/**
 * Abstract base class for database integrations.
 * All DB adapters (MySQL, PostgreSQL, MSSQL, Oracle, etc.) must extend
 * this class and implement every method.
 */
class BaseDbAdapter {
  constructor(config) {
    if (new.target === BaseDbAdapter) {
      throw new Error('BaseDbAdapter is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Tests database connectivity.
   * @returns {Promise<boolean>} True if connection succeeds
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Returns all rows from the DATABASECHANGELOG table.
   * @returns {Promise<object[]>} Array of changelog rows
   */
  async getChangelogTable() {
    throw new Error('getChangelogTable() must be implemented by subclass');
  }

  /**
   * Returns IDs of all previously applied changesets.
   * @returns {Promise<string[]>} Array of changeset IDs
   */
  async getAppliedChangesets() {
    throw new Error('getAppliedChangesets() must be implemented by subclass');
  }

  /**
   * Runs Liquibase update to apply pending migrations.
   * @param {object} properties - Liquibase properties (url, credentials, changelog path, etc.)
   * @returns {Promise<{ success: boolean, output: string, duration: number }>}
   */
  async runLiquibaseUpdate(properties) {
    throw new Error('runLiquibaseUpdate() must be implemented by subclass');
  }

  /**
   * Runs Liquibase rollback for a specific changeset.
   * @param {object} properties - Liquibase properties
   * @param {string} changesetId - Changeset ID to roll back
   * @returns {Promise<{ success: boolean, output: string, duration: number }>}
   */
  async runLiquibaseRollback(properties, changesetId) {
    throw new Error('runLiquibaseRollback() must be implemented by subclass');
  }

  /**
   * Runs Liquibase validate to check SQL without applying.
   * @param {object} properties - Liquibase properties
   * @returns {Promise<{ valid: boolean, output: string }>}
   */
  async runLiquibaseValidate(properties) {
    throw new Error('runLiquibaseValidate() must be implemented by subclass');
  }

  /**
   * Executes a DML changeset with optional backup.
   * If the changeset has requires_backup=true, runs the backup query first,
   * then executes the DML.
   *
   * @param {object} properties - Liquibase/DB properties
   * @param {object} changeset - Parsed DML changeset object
   * @returns {Promise<{ backupRowCount: number|null, affectedRows: number, success: boolean }>}
   */
  async runDMLWithBackup(properties, changeset) {
    throw new Error('runDMLWithBackup() must be implemented by subclass');
  }

  /**
   * Closes the database connection pool.
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('close() must be implemented by subclass');
  }
}

module.exports = BaseDbAdapter;
