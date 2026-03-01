const nock = require('nock');
const JiraClient = require('../../scripts/core/jira-client');

const config = {
  JIRA_BASE_URL: 'https://test.atlassian.net',
  JIRA_EMAIL: 'test@test.com',
  JIRA_API_TOKEN: 'token',
  JIRA_PROJECT_KEY: 'TEST',
  JIRA_ISSUE_TYPE: 'Task',
  JIRA_AUTH_TYPE: 'cloud',
  JIRA_DONE_TRANSITION_ID: '31',
  JIRA_IN_REVIEW_TRANSITION_ID: '21',
  JIRA_FAILED_TRANSITION_ID: '41',
  DML_JIRA_ISSUE_TYPE: 'Sub-task',
};

const changeset = {
  id: '20260228-001-test',
  author: 'john.doe',
  type: 'ddl',
  description: 'Add test column',
  ticket: 'PROJ-100',
  environment: 'prod',
  risk: 'medium',
  reviewers: ['dba-team'],
  rollback: 'auto',
  compliance: ['SOX'],
  schedule: 'immediate',
  sqlBody: 'ALTER TABLE users ADD COLUMN test BOOLEAN;',
  rollbackSql: 'ALTER TABLE users DROP COLUMN test;',
};

describe('Jira Full Lifecycle (integration)', () => {
  let jira;
  const base = 'https://test.atlassian.net';

  beforeEach(() => {
    jira = new JiraClient(config);
    nock.cleanAll();
  });

  afterAll(() => nock.restore());

  it('should complete full lifecycle: create -> in_review -> deployed -> done', async () => {
    // 1. Create ticket
    nock(base).post('/rest/api/2/issue').reply(201, { key: 'TEST-100' });
    nock(base).post('/rest/api/2/issueLink').reply(201);

    const { ticketId } = await jira.createChangeTicket(changeset, 'https://github.com/pr/1', 1);
    expect(ticketId).toBe('TEST-100');

    // 2. Mark in review
    nock(base).post('/rest/api/2/issue/TEST-100/transitions').reply(204);
    nock(base).post('/rest/api/2/issue/TEST-100/comment').reply(201, { id: '1' });

    await jira.markInReview('TEST-100', 'Reviewer: dba-team');

    // 3. Mark approved
    nock(base).post('/rest/api/2/issue/TEST-100/comment').reply(201, { id: '2' });

    await jira.markApproved('TEST-100', 'dba-admin');

    // 4. Mark deployed
    nock(base).post('/rest/api/2/issue/TEST-100/transitions').reply(204);
    nock(base).post('/rest/api/2/issue/TEST-100/comment').reply(201, { id: '3' });

    await jira.markDeployed('TEST-100', {
      environment: 'prod',
      duration: 1500,
      changesetHash: 'abc123',
    });
  });

  it('should handle failure lifecycle: create -> in_review -> failed', async () => {
    nock(base).post('/rest/api/2/issue').reply(201, { key: 'TEST-101' });
    nock(base).post('/rest/api/2/issueLink').reply(201);

    await jira.createChangeTicket(changeset, 'https://github.com/pr/2', 2);

    nock(base).post('/rest/api/2/issue/TEST-101/transitions').reply(204);
    nock(base).post('/rest/api/2/issue/TEST-101/comment').reply(201, { id: '1' });

    await jira.markInReview('TEST-101', 'Reviewing');

    nock(base).post('/rest/api/2/issue/TEST-101/transitions').reply(204);
    nock(base).post('/rest/api/2/issue/TEST-101/comment').reply(201, { id: '2' });

    await jira.markFailed('TEST-101', {
      error: 'Column already exists',
      environment: 'preprod',
      rollbackAttempted: true,
      rollbackSuccess: true,
    });
  });

  it('should add audit comments', async () => {
    nock(base).post('/rest/api/2/issue/TEST-100/comment').reply(201, { id: '4' });

    await jira.addAuditComment('TEST-100', {
      actor: 'system',
      action: 'DEPLOYED',
      details: 'Changeset applied to preprod',
    });
  });
});
