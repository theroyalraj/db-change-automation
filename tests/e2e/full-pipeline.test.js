const nock = require('nock');
const path = require('path');
const { parseChangeset } = require('../../scripts/core/changeset-parser');
const JiraClient = require('../../scripts/core/jira-client');
const { logAudit } = require('../../scripts/utils/logger');

jest.mock('../../adapters/database/mysql-adapter', () => {
  return jest.fn().mockImplementation((config) => ({
    testConnection: jest.fn().mockResolvedValue(true),
    runLiquibaseValidate: jest.fn().mockResolvedValue({ valid: true, output: 'OK' }),
    runLiquibaseUpdate: jest.fn().mockResolvedValue({ success: true, output: 'Applied', duration: 100 }),
    runLiquibaseRollback: jest.fn().mockResolvedValue({ success: true, output: 'Rolled back', duration: 50 }),
    close: jest.fn().mockResolvedValue(),
    config,
  }));
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'e2e-email' }),
  })),
}));

jest.mock('twilio', () => jest.fn(() => ({
  messages: Object.assign(jest.fn(), { create: jest.fn().mockResolvedValue({ sid: 'SM-e2e' }) }),
})));

const EnvironmentPromoter = require('../../scripts/core/environment-promoter');

const DDL_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  'changelogs',
  'migrations',
  'example',
  '20260228-001-add-email-verified.sql'
);

const jiraBase = 'https://test.atlassian.net';

const config = {
  JIRA_BASE_URL: jiraBase,
  JIRA_EMAIL: 'test@test.com',
  JIRA_API_TOKEN: 'token',
  JIRA_PROJECT_KEY: 'TEST',
  JIRA_ISSUE_TYPE: 'Task',
  JIRA_AUTH_TYPE: 'cloud',
  JIRA_DONE_TRANSITION_ID: '31',
  JIRA_IN_REVIEW_TRANSITION_ID: '21',
  JIRA_FAILED_TRANSITION_ID: '41',
  DML_JIRA_ISSUE_TYPE: 'Sub-task',
  ENVIRONMENTS: 'preprod,prod',
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
  PROD_DB_HOST: 'localhost',
  PROD_DB_PORT: '3307',
  PROD_DB_NAME: 'testdb',
  PROD_DB_USERNAME: 'test',
  PROD_DB_PASSWORD: 'test',
};

describe('Full Pipeline E2E', () => {
  beforeEach(() => nock.cleanAll());
  afterAll(() => nock.restore());

  it('should simulate complete DDL flow: parse → create Jira → deploy → close', async () => {
    // 1. Parse changeset
    const changeset = parseChangeset(DDL_FILE);
    expect(changeset.id).toBe('20260228-001-add-email-verified');
    expect(changeset.type).toBe('ddl');

    // 2. Create Jira ticket
    nock(jiraBase).post('/rest/api/2/issue').reply(201, { key: 'TEST-E2E-1' });
    nock(jiraBase).post('/rest/api/2/issueLink').reply(201);

    const jira = new JiraClient(config);
    const { ticketId } = await jira.createChangeTicket(changeset, 'https://github.com/pr/99', 99);
    expect(ticketId).toBe('TEST-E2E-1');

    // 3. Deploy across environments
    const promoter = new EnvironmentPromoter(config);
    const { results } = await promoter.promote(changeset);

    expect(results).toHaveLength(2);
    expect(results[0].env).toBe('preprod');
    expect(results[0].status).toBe('SUCCESS');
    expect(results[1].env).toBe('prod');
    expect(results[1].status).toBe('SUCCESS');

    // 4. Close Jira ticket
    nock(jiraBase).post('/rest/api/2/issue/TEST-E2E-1/transitions').reply(204);
    nock(jiraBase).post('/rest/api/2/issue/TEST-E2E-1/comment').reply(201, { id: '1' });

    await jira.markDeployed(ticketId, {
      environment: 'prod',
      duration: results.reduce((s, r) => s + r.duration, 0),
      changesetHash: 'e2e-hash',
    });
  });

  it('should simulate failure flow: parse → create Jira → deploy fails → mark failed', async () => {
    const MySQLAdapter = require('../../adapters/database/mysql-adapter');
    MySQLAdapter.mockImplementation((cfg) => ({
      testConnection: jest.fn().mockResolvedValue(true),
      runLiquibaseValidate: jest.fn().mockResolvedValue({ valid: true, output: 'OK' }),
      runLiquibaseUpdate: jest.fn().mockResolvedValue({ success: false, output: 'Error: duplicate', duration: 50 }),
      runLiquibaseRollback: jest.fn().mockResolvedValue({ success: true, output: 'OK', duration: 30 }),
      close: jest.fn().mockResolvedValue(),
      config: cfg,
    }));

    const changeset = parseChangeset(DDL_FILE);

    nock(jiraBase).post('/rest/api/2/issue').reply(201, { key: 'TEST-E2E-2' });
    nock(jiraBase).post('/rest/api/2/issueLink').reply(201);

    const jira = new JiraClient(config);
    const { ticketId } = await jira.createChangeTicket(changeset, 'https://github.com/pr/100', 100);

    const promoter = new EnvironmentPromoter(config);
    const { results } = await promoter.promote(changeset);

    expect(results[0].status).toBe('FAILED');

    // Mark Jira as failed
    nock(jiraBase).post('/rest/api/2/issue/TEST-E2E-2/transitions').reply(204);
    nock(jiraBase).post('/rest/api/2/issue/TEST-E2E-2/comment').reply(201, { id: '1' });

    await jira.markFailed(ticketId, {
      error: 'Duplicate column',
      environment: 'preprod',
      rollbackAttempted: true,
      rollbackSuccess: true,
    });
  });
});
