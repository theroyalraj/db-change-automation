const axios = require('axios');
const BaseTicketingAdapter = require('./base-ticketing-adapter');
const { withRetry } = require('../../scripts/utils/retry');

const RISK_TO_PRIORITY = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const STATUS_TO_TRANSITION = {
  IN_REVIEW: 'JIRA_IN_REVIEW_TRANSITION_ID',
  DONE: 'JIRA_DONE_TRANSITION_ID',
  FAILED: 'JIRA_FAILED_TRANSITION_ID',
};

/**
 * Jira Cloud and Server adapter for ticket lifecycle management.
 */
class JiraAdapter extends BaseTicketingAdapter {
  constructor(config) {
    super(config);
    this.baseUrl = config.JIRA_BASE_URL.replace(/\/+$/, '');
    this.client = axios.create({
      baseURL: `${this.baseUrl}/rest/api/2`,
      headers: this._buildHeaders(config),
      timeout: 15000,
    });
  }

  _buildHeaders(config) {
    const headers = { 'Content-Type': 'application/json' };

    if (config.JIRA_AUTH_TYPE === 'server') {
      const auth = Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else {
      const auth = Buffer.from(`${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }

  async createTicket(changeset, prUrl) {
    const description = this._buildDescription(changeset, prUrl);
    const labels = ['db-change', 'automated'];
    if (changeset.compliance && changeset.compliance[0] !== 'none') {
      labels.push(...changeset.compliance.map((c) => `compliance-${c.toLowerCase()}`));
    }
    if (changeset.type === 'dml') {
      labels.push('dml-change');
    }

    const issueType =
      changeset.type === 'dml'
        ? this.config.DML_JIRA_ISSUE_TYPE || 'Sub-task'
        : this.config.JIRA_ISSUE_TYPE || 'Task';

    const fields = {
      project: { key: this.config.JIRA_PROJECT_KEY },
      summary: `[DB-${changeset.type.toUpperCase()}] ${changeset.id}: ${changeset.description}`,
      description,
      issuetype: { name: issueType },
      priority: { name: RISK_TO_PRIORITY[changeset.risk] || 'Medium' },
      labels: [...labels, 'awaiting-dba-approval'],
    };

    const response = await this._request('POST', '/issue', { fields });

    const ticketId = response.key;
    const ticketUrl = `${this.baseUrl}/browse/${ticketId}`;

    if (changeset.ticket && changeset.ticket !== 'PROJ-000') {
      try {
        await this.linkTickets(ticketId, changeset.ticket, 'relates to');
      } catch (_) {
        // Parent ticket may not exist — non-fatal
      }
    }

    return { ticketId, ticketUrl };
  }

  _buildDescription(changeset, prUrl) {
    const rows = [
      `| Field | Value |`,
      `| --- | --- |`,
      `| Changeset ID | ${changeset.id} |`,
      `| Author | ${changeset.author} |`,
      `| Type | ${changeset.type.toUpperCase()} |`,
      `| Risk Level | ${changeset.risk.charAt(0).toUpperCase() + changeset.risk.slice(1)} |`,
      `| Environment | ${changeset.environment} |`,
      `| PR Link | [View PR](${prUrl}) |`,
      `| Rollback | ${changeset.rollback} |`,
      `| Compliance | ${changeset.compliance.join(', ')} |`,
      `| Schedule | ${changeset.schedule} |`,
    ];

    if (changeset.type === 'dml') {
      rows.push(`| Operation | ${changeset.operation} |`);
      rows.push(`| Target Table | ${changeset.targetTable} |`);
      rows.push(`| Estimated Rows | ${changeset.estimatedRows} |`);
    }

    return rows.join('\n');
  }

  async addComment(ticketId, comment) {
    await this._request('POST', `/issue/${ticketId}/comment`, {
      body: comment,
    });
  }

  async transitionTicket(ticketId, status) {
    const envKey = STATUS_TO_TRANSITION[status];
    const transitionId = this.config[envKey];

    if (!transitionId) {
      throw new Error(
        `No transition ID configured for status "${status}". Set ${envKey} in your environment.`
      );
    }

    await this._request('POST', `/issue/${ticketId}/transitions`, {
      transition: { id: transitionId },
    });
  }

  async getTicket(ticketId) {
    return this._request('GET', `/issue/${ticketId}`);
  }

  async linkTickets(sourceId, targetId, linkType = 'relates to') {
    await this._request('POST', '/issueLink', {
      type: { name: linkType },
      inwardIssue: { key: sourceId },
      outwardIssue: { key: targetId },
    });
  }

  /**
   * Wrapped HTTP request with retry logic.
   * @param {'GET'|'POST'|'PUT'|'DELETE'} method
   * @param {string} path
   * @param {object} [data]
   * @returns {Promise<object>}
   */
  async _request(method, path, data) {
    return withRetry(
      async () => {
        const response = await this.client.request({ method, url: path, data });
        return response.data;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (error, attempt) => {
          const status = error.response?.status;
          console.warn(
            `[JiraAdapter] Request ${method} ${path} failed (status: ${status}), attempt ${attempt}/3`
          );
        },
      }
    );
  }
}

module.exports = JiraAdapter;
