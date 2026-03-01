const MySQLAdapter = require('../../adapters/database/mysql-adapter');
const { getDbConfigForEnv } = require('../utils/env-validator');

const ADAPTER_REGISTRY = {
  mysql: MySQLAdapter,
};

/**
 * Factory that returns the correct database adapter based on DB_TYPE.
 *
 * @param {string} envName - Environment name (e.g., 'preprod', 'uat', 'prod')
 * @param {Record<string, string>} [env=process.env]
 * @returns {import('../../adapters/database/base-db-adapter')}
 */
function createDbClient(envName, env = process.env) {
  const config = getDbConfigForEnv(envName, env);
  const AdapterClass = ADAPTER_REGISTRY[config.type];

  if (!AdapterClass) {
    throw new Error(
      `No database adapter registered for type "${config.type}". ` +
        `Available: ${Object.keys(ADAPTER_REGISTRY).join(', ')}. ` +
        `Implement a new adapter in adapters/database/ and register it here.`
    );
  }

  return new AdapterClass(config);
}

module.exports = { createDbClient, ADAPTER_REGISTRY };
