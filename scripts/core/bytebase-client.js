const axios = require('axios');
const { withRetry } = require('../utils/retry');
const { logAudit } = require('../utils/logger');

/**
 * Bytebase API client for project management and approval workflows.
 */
class BytebaseClient {
  constructor(config) {
    this.baseUrl = (config.BYTEBASE_URL || '').replace(/\/+$/, '');
    this.projectId = config.BYTEBASE_PROJECT_ID;
    this.environment = config.BYTEBASE_ENVIRONMENT;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/v1`,
      headers: {
        Authorization: `Bearer ${config.BYTEBASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  /**
   * Creates a Bytebase project.
   * @param {string} projectId
   * @param {string} title
   * @returns {Promise<object>}
   */
  async createProject(projectId, title) {
    return this._request('POST', '/projects', {
      projectId,
      title,
      key: projectId.toUpperCase().replace(/-/g, '_'),
    });
  }

  /**
   * Adds a database instance to a project.
   * @param {object} instanceConfig
   * @returns {Promise<object>}
   */
  async addInstance(instanceConfig) {
    return this._request('POST', `/instances`, {
      instanceId: instanceConfig.id,
      title: instanceConfig.title,
      engine: instanceConfig.engine || 'MYSQL',
      dataSourceList: [
        {
          type: 'ADMIN',
          host: instanceConfig.host,
          port: String(instanceConfig.port),
          username: instanceConfig.username,
          password: instanceConfig.password,
          database: instanceConfig.database,
        },
      ],
    });
  }

  /**
   * Creates an issue (change request) in Bytebase.
   * @param {object} changeset - Parsed changeset
   * @param {string} sql - SQL to execute
   * @returns {Promise<object>}
   */
  async createIssue(changeset, sql) {
    const issue = await this._request(
      'POST',
      `/projects/${this.projectId}/issues`,
      {
        title: `[${changeset.type.toUpperCase()}] ${changeset.id}`,
        description: changeset.description,
        type: 'DATABASE_CHANGE',
        assignee: '',
      }
    );

    logAudit('CHANGESET_SUBMITTED', {
      changesetId: changeset.id,
      extra: { bytebaseIssueId: issue.name },
    });

    return issue;
  }

  /**
   * Gets the approval status of a Bytebase issue.
   * @param {string} issueName - Bytebase issue resource name
   * @returns {Promise<{ approved: boolean, approvers: string[] }>}
   */
  async getApprovalStatus(issueName) {
    const issue = await this._request('GET', `/${issueName}`);
    const approved = issue.approvalFindingDone && issue.approvalFindingError === '';
    return {
      approved,
      approvers: (issue.approvers || []).map((a) => a.principal),
    };
  }

  async _request(method, url, data) {
    return withRetry(
      async () => {
        const response = await this.client.request({ method, url, data });
        return response.data;
      },
      { maxAttempts: 3, baseDelayMs: 1000 }
    );
  }
}

module.exports = BytebaseClient;
