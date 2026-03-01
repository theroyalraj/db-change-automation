jest.mock('../../adapters/database/mysql-adapter', () => {
  return jest.fn().mockImplementation((config) => ({
    testConnection: jest.fn().mockResolvedValue(true),
    runLiquibaseValidate: jest.fn().mockResolvedValue({ valid: true, output: 'OK' }),
    runLiquibaseUpdate: jest.fn().mockResolvedValue({ success: false, output: 'Duplicate column', duration: 50 }),
    runLiquibaseRollback: jest.fn().mockResolvedValue({ success: true, output: 'Rolled back', duration: 30 }),
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

const EnvironmentPromoter = require('../../scripts/core/environment-promoter');

describe('Rollback on Failure (integration)', () => {
  const config = {
    ENVIRONMENTS: 'preprod',
    UAT_ENABLED: 'false',
    PROD_REQUIRES_MANUAL_APPROVAL: 'false',
    AUTO_ROLLBACK_ON_FAILURE: 'true',
    NOTIFICATION_CHANNELS: '',
    LIQUIBASE_CHANGELOG_PATH: 'changelogs/master.xml',
    DB_TYPE: 'mysql',
    DB_HOST: 'localhost',
    DB_PORT: '3307',
    DB_NAME: 'testdb',
    DB_USERNAME: 'test',
    DB_PASSWORD: 'test',
    PREPROD_DB_HOST: 'localhost',
    PREPROD_DB_PORT: '3307',
    PREPROD_DB_NAME: 'testdb',
    PREPROD_DB_USERNAME: 'test',
    PREPROD_DB_PASSWORD: 'test',
  };

  const changeset = {
    id: 'rollback-test-001',
    author: 'test',
    type: 'ddl',
    description: 'Will fail and rollback',
    environment: 'preprod',
    risk: 'high',
    compliance: ['none'],
    schedule: 'immediate',
    sqlBody: 'ALTER TABLE t ADD COLUMN existing BOOLEAN;',
    rollbackSql: 'ALTER TABLE t DROP COLUMN existing;',
  };

  it('should attempt rollback when deployment fails', async () => {
    const promoter = new EnvironmentPromoter(config);
    const { results } = await promoter.promote(changeset, { targetEnv: 'preprod' });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('FAILED');
    expect(results[0].error).toContain('Duplicate column');

    const MySQLAdapter = require('../../adapters/database/mysql-adapter');
    const mockInstance = MySQLAdapter.mock.results[0].value;
    expect(mockInstance.runLiquibaseRollback).toHaveBeenCalled();
  });

  it('should not attempt rollback when AUTO_ROLLBACK_ON_FAILURE=false', async () => {
    const noRollbackConfig = { ...config, AUTO_ROLLBACK_ON_FAILURE: 'false' };
    const promoter = new EnvironmentPromoter(noRollbackConfig);

    // Reset the mock to track calls fresh
    const MySQLAdapter = require('../../adapters/database/mysql-adapter');
    MySQLAdapter.mockClear();

    const { results } = await promoter.promote(changeset, { targetEnv: 'preprod' });

    expect(results[0].status).toBe('FAILED');
  });
});
