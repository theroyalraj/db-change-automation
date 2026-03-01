const { createDbClient } = require('./db-client');
const NotificationDispatcher = require('./notification-dispatcher');
const { logAudit } = require('../utils/logger');

/**
 * Handles sequential multi-environment promotion of database changes.
 * Deploys through: preprod -> UAT (if enabled) -> prod (with manual gate).
 */
class EnvironmentPromoter {
  /**
   * @param {Record<string, string>} config - Environment variables
   */
  constructor(config) {
    this.config = config;
    this.environments = (config.ENVIRONMENTS || 'preprod,prod')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    this.uatEnabled = config.UAT_ENABLED !== 'false';
    this.prodRequiresApproval = config.PROD_REQUIRES_MANUAL_APPROVAL !== 'false';
    this.autoRollback = config.AUTO_ROLLBACK_ON_FAILURE !== 'false';
    this.notifier = new NotificationDispatcher(config);
  }

  /**
   * Promotes a changeset through all configured environments.
   *
   * @param {object} changeset - Parsed changeset object
   * @param {object} [options]
   * @param {string} [options.targetEnv] - If set, only deploy to this specific environment
   * @param {object} [options.liquibaseProperties] - Extra Liquibase properties
   * @returns {Promise<{ results: Array<{ env: string, status: string, duration: number, appliedAt: string, error?: string }> }>}
   */
  async promote(changeset, options = {}) {
    const results = [];
    let envChain = this.environments;

    if (!this.uatEnabled) {
      envChain = envChain.filter((e) => e !== 'uat');
    }

    if (options.targetEnv) {
      envChain = [options.targetEnv];
    }

    for (const env of envChain) {
      if (env === 'prod' && this.prodRequiresApproval && !options.targetEnv) {
        logAudit('DEPLOYED', {
          changesetId: changeset.id,
          environment: env,
          extra: { status: 'AWAITING_APPROVAL' },
        });

        await this.notifier.notifyAll('approval_needed', {
          changeset,
          approvers: [],
        });

        results.push({
          env,
          status: 'AWAITING_APPROVAL',
          duration: 0,
          appliedAt: new Date().toISOString(),
        });
        break;
      }

      const envResult = await this._deployToEnv(changeset, env, options.liquibaseProperties);
      results.push(envResult);

      if (envResult.status === 'FAILED') {
        await this.notifier.notifyAll('failed', {
          changeset,
          error: envResult.error,
          environment: env,
        });
        break;
      }

      await this.notifier.notifyAll('deployed', {
        changeset,
        environment: env,
        result: { success: true, duration: envResult.duration },
      });
    }

    return { results };
  }

  /**
   * Deploys a changeset to a single environment.
   * @param {object} changeset
   * @param {string} env
   * @param {object} [liquibaseProperties]
   * @returns {Promise<object>}
   */
  async _deployToEnv(changeset, env, liquibaseProperties) {
    const start = Date.now();
    let dbClient;

    try {
      dbClient = createDbClient(env, this.config);

      const connected = await dbClient.testConnection();
      if (!connected) {
        throw new Error(`Cannot connect to ${env} database`);
      }

      const props = {
        ...liquibaseProperties,
        changeLogFile: this.config.LIQUIBASE_CHANGELOG_PATH || 'changelogs/master.xml',
        contexts: env,
      };

      // Validate first
      const validation = await dbClient.runLiquibaseValidate(props);
      if (!validation.valid) {
        throw new Error(`Liquibase validation failed on ${env}: ${validation.output}`);
      }

      // Apply — pass changeset so MySQL < 5.7 can use direct SQL execution
      let result;
      if (changeset.type === 'dml') {
        result = await dbClient.runDMLWithBackup(props, changeset);
      } else {
        result = await dbClient.runLiquibaseUpdate(props, changeset);
      }

      if (!result.success) {
        throw new Error(`Liquibase update failed on ${env}: ${result.output}`);
      }

      const duration = Date.now() - start;

      logAudit('DEPLOYED', {
        changesetId: changeset.id,
        environment: env,
        duration,
        dbHost: this.config[`${env.toUpperCase()}_DB_HOST`],
        sqlBody: changeset.sqlBody,
      });

      return {
        env,
        status: 'SUCCESS',
        duration,
        appliedAt: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - start;

      if (this.autoRollback && dbClient) {
        try {
          await dbClient.runLiquibaseRollback(
            { changeLogFile: this.config.LIQUIBASE_CHANGELOG_PATH || 'changelogs/master.xml' },
            changeset.id
          );
          logAudit('ROLLBACK', {
            changesetId: changeset.id,
            environment: env,
            extra: { success: true },
          });
        } catch (rollbackError) {
          logAudit('ROLLBACK', {
            changesetId: changeset.id,
            environment: env,
            extra: { success: false, error: rollbackError.message },
          });
        }
      }

      logAudit('FAILED', {
        changesetId: changeset.id,
        environment: env,
        duration,
        extra: { error: error.message },
      });

      return {
        env,
        status: 'FAILED',
        duration,
        appliedAt: new Date().toISOString(),
        error: error.message,
      };
    } finally {
      if (dbClient) {
        try { await dbClient.close(); } catch (_) {}
      }
    }
  }
}

module.exports = EnvironmentPromoter;
