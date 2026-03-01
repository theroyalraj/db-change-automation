const nock = require('nock');
const JiraAdapter = require('../../adapters/ticketing/jira-adapter');

const JIRA_CONFIG = {
  JIRA_BASE_URL: 'https://test.atlassian.net',
  JIRA_EMAIL: 'test@test.com',
  JIRA_API_TOKEN: 'test-token',
  JIRA_PROJECT_KEY: 'TEST',
  JIRA_ISSUE_TYPE: 'Task',
  JIRA_AUTH_TYPE: 'cloud',
  JIRA_DONE_TRANSITION_ID: '31',
  JIRA_IN_REVIEW_TRANSITION_ID: '21',
  JIRA_FAILED_TRANSITION_ID: '41',
  DML_JIRA_ISSUE_TYPE: 'Sub-task',
};

const mockChangeset = {
  id: '20260228-001-add-email-verified',
  author: 'john.doe',
  type: 'ddl',
  description: 'Add email_verified column',
  ticket: 'PROJ-123',
  environment: 'prod',
  risk: 'medium',
  reviewers: ['dba-team'],
  rollback: 'auto',
  compliance: ['SOX'],
  schedule: 'immediate',
  sqlBody: 'ALTER TABLE users ADD COLUMN email_verified BOOLEAN;',
  rollbackSql: 'ALTER TABLE users DROP COLUMN email_verified;',
};

describe('JiraAdapter', () => {
  let adapter;
  const jiraApi = 'https://test.atlassian.net';

  beforeEach(() => {
    adapter = new JiraAdapter(JIRA_CONFIG);
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('createTicket', () => {
    it('should create a Jira ticket with correct fields', async () => {
      const scope = nock(jiraApi)
        .post('/rest/api/2/issue', (body) => {
          expect(body.fields.project.key).toBe('TEST');
          expect(body.fields.summary).toContain('20260228-001-add-email-verified');
          expect(body.fields.priority.name).toBe('Medium');
          expect(body.fields.labels).toContain('db-change');
          expect(body.fields.labels).toContain('automated');
          expect(body.fields.labels).toContain('awaiting-dba-approval');
          return true;
        })
        .reply(201, { key: 'TEST-42', id: '10042' });

      // Mock the linkTickets call
      nock(jiraApi)
        .post('/rest/api/2/issueLink')
        .reply(201);

      const result = await adapter.createTicket(mockChangeset, 'https://github.com/pr/1');

      expect(result.ticketId).toBe('TEST-42');
      expect(result.ticketUrl).toBe('https://test.atlassian.net/browse/TEST-42');
      expect(scope.isDone()).toBe(true);
    });

    it('should include compliance labels', async () => {
      nock(jiraApi)
        .post('/rest/api/2/issue', (body) => {
          expect(body.fields.labels).toContain('compliance-sox');
          return true;
        })
        .reply(201, { key: 'TEST-43' });

      nock(jiraApi).post('/rest/api/2/issueLink').reply(201);

      await adapter.createTicket(mockChangeset, 'https://github.com/pr/1');
    });

    it('should use DML ticket type for DML changesets', async () => {
      const dmlChangeset = { ...mockChangeset, type: 'dml', operation: 'insert', targetTable: 'config', estimatedRows: 5 };

      nock(jiraApi)
        .post('/rest/api/2/issue', (body) => {
          expect(body.fields.issuetype.name).toBe('Sub-task');
          expect(body.fields.labels).toContain('dml-change');
          return true;
        })
        .reply(201, { key: 'TEST-44' });

      nock(jiraApi).post('/rest/api/2/issueLink').reply(201);

      await adapter.createTicket(dmlChangeset, 'https://github.com/pr/1');
    });
  });

  describe('addComment', () => {
    it('should post a comment to the ticket', async () => {
      const scope = nock(jiraApi)
        .post('/rest/api/2/issue/TEST-42/comment', (body) => {
          expect(body.body).toBe('Deployment succeeded');
          return true;
        })
        .reply(201, { id: '100' });

      await adapter.addComment('TEST-42', 'Deployment succeeded');
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('transitionTicket', () => {
    it('should transition ticket to IN_REVIEW', async () => {
      const scope = nock(jiraApi)
        .post('/rest/api/2/issue/TEST-42/transitions', (body) => {
          expect(body.transition.id).toBe('21');
          return true;
        })
        .reply(204);

      await adapter.transitionTicket('TEST-42', 'IN_REVIEW');
      expect(scope.isDone()).toBe(true);
    });

    it('should transition ticket to DONE', async () => {
      nock(jiraApi)
        .post('/rest/api/2/issue/TEST-42/transitions', (body) => {
          expect(body.transition.id).toBe('31');
          return true;
        })
        .reply(204);

      await adapter.transitionTicket('TEST-42', 'DONE');
    });

    it('should transition ticket to FAILED', async () => {
      nock(jiraApi)
        .post('/rest/api/2/issue/TEST-42/transitions', (body) => {
          expect(body.transition.id).toBe('41');
          return true;
        })
        .reply(204);

      await adapter.transitionTicket('TEST-42', 'FAILED');
    });
  });

  describe('getTicket', () => {
    it('should retrieve ticket details', async () => {
      nock(jiraApi)
        .get('/rest/api/2/issue/TEST-42')
        .reply(200, { key: 'TEST-42', fields: { summary: 'Test' } });

      const ticket = await adapter.getTicket('TEST-42');
      expect(ticket.key).toBe('TEST-42');
    });
  });

  describe('retry on 429', () => {
    it('should retry on rate limit and succeed on second attempt', async () => {
      nock(jiraApi)
        .get('/rest/api/2/issue/TEST-42')
        .reply(429, { message: 'Rate limited' });

      nock(jiraApi)
        .get('/rest/api/2/issue/TEST-42')
        .reply(200, { key: 'TEST-42', fields: {} });

      const ticket = await adapter.getTicket('TEST-42');
      expect(ticket.key).toBe('TEST-42');
    }, 15000);

    it('should throw after max retries on persistent 500', async () => {
      nock(jiraApi).get('/rest/api/2/issue/TEST-42').times(3).reply(500, { message: 'Server Error' });

      await expect(adapter.getTicket('TEST-42')).rejects.toThrow();
    }, 15000);
  });
});
