const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const BaseDbAdapter = require('./base-db-adapter');

const execFileAsync = promisify(execFile);

const MIN_LIQUIBASE_VERSION = [5, 7];
const TRACKER_TABLE = 'DB_CHANGE_TRACKER';

/**
 * MySQL database adapter. Uses mysql2 for direct queries and
 * shells out to the Liquibase CLI for migration operations.
 *
 * For MySQL < 5.7, Liquibase is not supported. The adapter falls back
 * to direct SQL execution via mysql2 and tracks changes in a custom
 * {@link TRACKER_TABLE} table instead of Liquibase's DATABASECHANGELOG.
 */
class MySQLAdapter extends BaseDbAdapter {
  constructor(config) {
    super(config);
    this.pool = null;
    this._serverVersion = null;
    this._liquibaseSupported = null;
  }

  /** @returns {import('mysql2/promise').Pool} */
  _getPool() {
    if (!this.pool) {
      const mysql = require('mysql2/promise');
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.name,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
      });
    }
    return this.pool;
  }

  /**
   * Detects the MySQL server version and determines Liquibase compatibility.
   * @returns {Promise<string>} Server version string (e.g., "5.5.37")
   */
  async detectVersion() {
    if (this._serverVersion) return this._serverVersion;
    const pool = this._getPool();
    const [rows] = await pool.query('SELECT VERSION() AS version');
    this._serverVersion = rows[0].version;

    const parts = this._serverVersion.split('.').map(Number);
    this._liquibaseSupported =
      parts[0] > MIN_LIQUIBASE_VERSION[0] ||
      (parts[0] === MIN_LIQUIBASE_VERSION[0] && parts[1] >= MIN_LIQUIBASE_VERSION[1]);

    return this._serverVersion;
  }

  /**
   * Whether this MySQL version supports Liquibase (>= 5.7).
   * Must call {@link detectVersion} first.
   */
  get liquibaseSupported() {
    return this._liquibaseSupported;
  }

  async testConnection() {
    const pool = this._getPool();
    try {
      const [rows] = await pool.query('SELECT 1 AS connected');
      return rows[0].connected === 1;
    } catch (error) {
      throw new Error(`MySQL connection failed (${this.config.host}:${this.config.port}): ${error.message}`);
    }
  }

  // ── Change tracking (version-adaptive) ──────────────────────

  /**
   * Creates the fallback change tracker table for MySQL < 5.7.
   */
  async _ensureChangeTracker() {
    const pool = this._getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (
        id VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        filename VARCHAR(500),
        sql_hash VARCHAR(64),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rollback_sql TEXT,
        status VARCHAR(20) DEFAULT 'applied',
        PRIMARY KEY (id)
      )
    `);
  }

  async getChangelogTable() {
    const pool = this._getPool();
    await this.detectVersion();

    if (!this._liquibaseSupported) {
      await this._ensureChangeTracker();
      const [rows] = await pool.query(
        `SELECT * FROM ${TRACKER_TABLE} ORDER BY applied_at DESC`
      );
      return rows;
    }

    const [rows] = await pool.query(
      'SELECT * FROM DATABASECHANGELOG ORDER BY DATEEXECUTED DESC'
    );
    return rows;
  }

  async getAppliedChangesets() {
    const pool = this._getPool();
    await this.detectVersion();

    if (!this._liquibaseSupported) {
      await this._ensureChangeTracker();
      const [rows] = await pool.query(
        `SELECT id FROM ${TRACKER_TABLE} WHERE status = 'applied'`
      );
      return rows.map((r) => r.id);
    }

    const [rows] = await pool.query('SELECT ID FROM DATABASECHANGELOG');
    return rows.map((r) => r.ID);
  }

  // ── Liquibase CLI helpers (MySQL >= 5.7 only) ───────────────

  /**
   * @param {object} properties
   * @returns {string[]}
   */
  _buildLiquibaseArgs(properties = {}) {
    const url = `jdbc:mysql://${this.config.host}:${this.config.port}/${this.config.name}` +
      `?useSSL=${!!this.config.ssl}&serverTimezone=UTC&allowPublicKeyRetrieval=true`;
    return [
      `--url=${url}`,
      `--username=${this.config.username}`,
      `--password=${this.config.password}`,
      `--changeLogFile=${properties.changeLogFile || 'changelogs/master.xml'}`,
      `--driver=com.mysql.cj.jdbc.Driver`,
      ...(properties.contexts ? [`--contexts=${properties.contexts}`] : []),
      ...(properties.labels ? [`--labels=${properties.labels}`] : []),
    ];
  }

  // ── Direct SQL execution (MySQL < 5.7 fallback) ─────────────

  /**
   * Executes SQL directly and records it in the tracker table.
   * Used when Liquibase is not supported for this MySQL version.
   *
   * @param {object} changeset - Parsed changeset with sqlBody, rollbackSql, id, author, filename
   * @returns {Promise<{ success: boolean, output: string, duration: number }>}
   */
  async _runDirectSQL(changeset) {
    await this._ensureChangeTracker();
    const pool = this._getPool();
    const conn = await pool.getConnection();
    const start = Date.now();

    try {
      await conn.beginTransaction();
      await conn.query(changeset.sqlBody);
      const sqlHash = crypto.createHash('md5').update(changeset.sqlBody).digest('hex');
      await conn.query(
        `INSERT INTO ${TRACKER_TABLE} (id, author, filename, sql_hash, rollback_sql, status) VALUES (?, ?, ?, ?, ?, 'applied')`,
        [changeset.id, changeset.author || 'unknown', changeset.filename || '', sqlHash, changeset.rollbackSql || '']
      );
      await conn.commit();
      return {
        success: true,
        output: `[Direct SQL] Executed on MySQL ${this._serverVersion} (Liquibase bypassed — requires >= 5.7). Change tracked in ${TRACKER_TABLE}.`,
        duration: Date.now() - start,
      };
    } catch (error) {
      await conn.rollback();
      return {
        success: false,
        output: `[Direct SQL] Failed on MySQL ${this._serverVersion}: ${error.message}`,
        duration: Date.now() - start,
      };
    } finally {
      conn.release();
    }
  }

  /**
   * Rolls back a changeset using the stored rollback SQL.
   * @param {string} changesetId
   * @returns {Promise<{ success: boolean, output: string, duration: number }>}
   */
  async _runDirectRollback(changesetId) {
    await this._ensureChangeTracker();
    const pool = this._getPool();
    const start = Date.now();

    const [rows] = await pool.query(
      `SELECT rollback_sql FROM ${TRACKER_TABLE} WHERE id = ? AND status = 'applied'`,
      [changesetId]
    );

    if (!rows.length || !rows[0].rollback_sql) {
      return {
        success: false,
        output: `[Direct SQL] No rollback SQL found for changeset ${changesetId}`,
        duration: Date.now() - start,
      };
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(rows[0].rollback_sql);
      await conn.query(
        `UPDATE ${TRACKER_TABLE} SET status = 'rolled_back' WHERE id = ?`,
        [changesetId]
      );
      await conn.commit();
      return {
        success: true,
        output: `[Direct SQL] Rolled back changeset ${changesetId} on MySQL ${this._serverVersion}`,
        duration: Date.now() - start,
      };
    } catch (error) {
      await conn.rollback();
      return {
        success: false,
        output: `[Direct SQL] Rollback failed for ${changesetId}: ${error.message}`,
        duration: Date.now() - start,
      };
    } finally {
      conn.release();
    }
  }

  // ── Public migration methods (version-adaptive) ─────────────

  /**
   * Applies a migration. Uses Liquibase CLI on >= 5.7, direct SQL on older versions.
   *
   * @param {object} [properties] - Liquibase properties (ignored for direct SQL mode)
   * @param {object} [changeset]  - Parsed changeset object (required for direct SQL mode)
   * @returns {Promise<{ success: boolean, output: string, duration: number }>}
   */
  async runLiquibaseUpdate(properties = {}, changeset = null) {
    await this.detectVersion();

    if (!this._liquibaseSupported) {
      if (!changeset || !changeset.sqlBody) {
        return {
          success: false,
          output: `MySQL ${this._serverVersion} detected — Liquibase not supported (requires >= 5.7). ` +
            `Changeset object with sqlBody is required for direct SQL execution.`,
          duration: 0,
        };
      }
      return this._runDirectSQL(changeset);
    }

    const args = [...this._buildLiquibaseArgs(properties), 'update'];
    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync('liquibase', args, { timeout: 120000 });
      return { success: true, output: stdout + stderr, duration: Date.now() - start };
    } catch (error) {
      return {
        success: false,
        output: (error.stdout || '') + (error.stderr || '') + error.message,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Rolls back a changeset. Uses Liquibase CLI on >= 5.7, direct SQL on older versions.
   */
  async runLiquibaseRollback(properties = {}, changesetId) {
    await this.detectVersion();

    if (!this._liquibaseSupported) {
      return this._runDirectRollback(changesetId);
    }

    const args = [...this._buildLiquibaseArgs(properties), 'rollbackCount', '1'];
    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync('liquibase', args, { timeout: 120000 });
      return { success: true, output: stdout + stderr, duration: Date.now() - start };
    } catch (error) {
      return {
        success: false,
        output: (error.stdout || '') + (error.stderr || '') + error.message,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Validates a changelog. Uses Liquibase CLI on >= 5.7, basic connection test on older versions.
   */
  async runLiquibaseValidate(properties = {}) {
    await this.detectVersion();

    if (!this._liquibaseSupported) {
      try {
        const connected = await this.testConnection();
        return {
          valid: connected,
          output: `MySQL ${this._serverVersion} — Liquibase validation skipped (requires >= 5.7). Connection test ${connected ? 'passed' : 'failed'}.`,
        };
      } catch (error) {
        return { valid: false, output: `Connection test failed: ${error.message}` };
      }
    }

    const args = [...this._buildLiquibaseArgs(properties), 'validate'];
    try {
      const { stdout, stderr } = await execFileAsync('liquibase', args, { timeout: 60000 });
      return { valid: true, output: stdout + stderr };
    } catch (error) {
      return {
        valid: false,
        output: (error.stdout || '') + (error.stderr || '') + error.message,
      };
    }
  }

  async runDMLWithBackup(properties, changeset) {
    const pool = this._getPool();
    let backupRowCount = null;

    if (changeset.requiresBackup && changeset.backupQuery) {
      const [backupRows] = await pool.query(changeset.backupQuery);
      backupRowCount = backupRows.length;
    }

    const [result] = await pool.query(changeset.sqlBody);

    await this.detectVersion();
    if (!this._liquibaseSupported) {
      await this._ensureChangeTracker();
      const sqlHash = crypto.createHash('md5').update(changeset.sqlBody).digest('hex');
      await pool.query(
        `INSERT INTO ${TRACKER_TABLE} (id, author, filename, sql_hash, rollback_sql, status) VALUES (?, ?, ?, ?, ?, 'applied')`,
        [changeset.id, changeset.author || 'unknown', changeset.filename || '', sqlHash, changeset.rollbackSql || '']
      );
    }

    return {
      backupRowCount,
      affectedRows: result.affectedRows || 0,
      success: true,
    };
  }

  /**
   * Validates the DB user has the required permissions.
   * @returns {Promise<{ hasPermissions: boolean, missing: string[] }>}
   */
  async validatePermissions() {
    const pool = this._getPool();
    const [grants] = await pool.query('SHOW GRANTS FOR CURRENT_USER()');
    const grantStr = JSON.stringify(grants).toUpperCase();

    const required = ['SELECT', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'DROP'];
    const missing = [];

    if (grantStr.includes('ALL PRIVILEGES')) {
      return { hasPermissions: true, missing: [] };
    }

    for (const perm of required) {
      if (!grantStr.includes(perm)) {
        missing.push(perm);
      }
    }

    return { hasPermissions: missing.length === 0, missing };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = MySQLAdapter;
