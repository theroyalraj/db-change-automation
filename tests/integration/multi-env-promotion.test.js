const EnvironmentPromoter = require('../../scripts/core/environment-promoter');

jest.mock('../../adapters/database/mysql-adapter', () => {
  return jest.fn().mockImplementation((config) => ({
    testConnection: jest.fn().mockResolvedValue(true),
    runLiquibaseValidate: jest.fn().mockResolvedValue({ valid: true, output: 'OK' }),
    runLiquibaseUpdate: jest.fn().mockResolvedValue({ success: true, output: 'Applied', duration: 100 }),
    runLiquibaseRollback: jest.fn().mockResolvedValue({ success: true, output: 'Rolled back', duration: 50 }),
    runDMLWithBackup: jest.fn().mockResolvedValue({ backupRowCount: 5, affectedRows: 3, success: true }),
    close: jest.fn().mockResolvedValue(),
    config,
  }));
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  })),
}));

jest.mock('twilio', () => jest.fn(() => ({
  messages: Object.assign(jest.fn(), { create: jest.fn().mockResolvedValue({ sid: 'SM1' }) }),
})));

const baseConfig = {
  ENVIRONMENTS: 'preprod,uat,prod',
  UAT_ENABLED: 'true',
  PROD_REQUIRES_MANUAL_APPROVAL: 'true',
  AUTO_ROLLBACK_ON_FAILURE: 'true',
  NOTIFICATION_CHANNELS: '',
  LIQUIBASE_CHANGELOG_PATH: 'changelogs/master.xml',
  DB_TYPE: 'mysql',
  DB_HOST: 'localhost',
  DB_PORT: '3307',
  DB_NAME: 'testdb',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  PREPROD_DB_HOST: 'preprod-host',
  PREPROD_DB_PORT: '3306',
  PREPROD_DB_NAME: 'appdb',
  PREPROD_DB_USERNAME: 'user',
  PREPROD_DB_PASSWORD: 'pass',
  UAT_DB_HOST: 'uat-host',
  UAT_DB_PORT: '3306',
  UAT_DB_NAME: 'appdb',
  UAT_DB_USERNAME: 'user',
  UAT_DB_PASSWORD: 'pass',
  PROD_DB_HOST: 'prod-host',
  PROD_DB_PORT: '3306',
  PROD_DB_NAME: 'appdb',
  PROD_DB_USERNAME: 'user',
  PROD_DB_PASSWORD: 'pass',
};

const changeset = {
  id: 'test-001',
  author: 'test',
  type: 'ddl',
  description: 'Test',
  environment: 'prod',
  risk: 'medium',
  compliance: ['none'],
  schedule: 'immediate',
  sqlBody: 'ALTER TABLE t ADD COLUMN c BOOLEAN;',
  rollbackSql: 'ALTER TABLE t DROP COLUMN c;',
};

describe('EnvironmentPromoter (integration)', () => {
  it('should deploy to preprod and uat, then wait for prod approval', async () => {
    const promoter = new EnvironmentPromoter(baseConfig);
    const { results } = await promoter.promote(changeset);

    expect(results).toHaveLength(3);
    expect(results[0].env).toBe('preprod');
    expect(results[0].status).toBe('SUCCESS');
    expect(results[1].env).toBe('uat');
    expect(results[1].status).toBe('SUCCESS');
    expect(results[2].env).toBe('prod');
    expect(results[2].status).toBe('AWAITING_APPROVAL');
  });

  it('should skip UAT when UAT_ENABLED=false', async () => {
    const config = { ...baseConfig, UAT_ENABLED: 'false' };
    const promoter = new EnvironmentPromoter(config);
    const { results } = await promoter.promote(changeset);

    expect(results).toHaveLength(2);
    expect(results[0].env).toBe('preprod');
    expect(results[0].status).toBe('SUCCESS');
    expect(results[1].env).toBe('prod');
    expect(results[1].status).toBe('AWAITING_APPROVAL');
  });

  it('should deploy directly to prod when PROD_REQUIRES_MANUAL_APPROVAL=false', async () => {
    const config = { ...baseConfig, PROD_REQUIRES_MANUAL_APPROVAL: 'false' };
    const promoter = new EnvironmentPromoter(config);
    const { results } = await promoter.promote(changeset);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'SUCCESS')).toBe(true);
  });

  it('should deploy only to target env when targetEnv is specified', async () => {
    const promoter = new EnvironmentPromoter(baseConfig);
    const { results } = await promoter.promote(changeset, { targetEnv: 'preprod' });

    expect(results).toHaveLength(1);
    expect(results[0].env).toBe('preprod');
    expect(results[0].status).toBe('SUCCESS');
  });

  it('should stop promotion and report failure when deployment fails', async () => {
    const MySQLAdapter = require('../../adapters/database/mysql-adapter');
    MySQLAdapter.mockImplementation((config) => ({
      testConnection: jest.fn().mockResolvedValue(true),
      runLiquibaseValidate: jest.fn().mockResolvedValue({ valid: true, output: 'OK' }),
      runLiquibaseUpdate: jest.fn().mockImplementation(() => {
        if (config.host === 'uat-host') {
          return Promise.resolve({ success: false, output: 'Table not found', duration: 50 });
        }
        return Promise.resolve({ success: true, output: 'OK', duration: 100 });
      }),
      runLiquibaseRollback: jest.fn().mockResolvedValue({ success: true, output: 'Rolled back', duration: 50 }),
      close: jest.fn().mockResolvedValue(),
      config,
    }));

    const promoter = new EnvironmentPromoter(baseConfig);
    const { results } = await promoter.promote(changeset);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('SUCCESS');
    expect(results[1].env).toBe('uat');
    expect(results[1].status).toBe('FAILED');
  });
});
