const axios = require('axios');
const BaseVcsAdapter = require('./base-vcs-adapter');
const { withRetry } = require('../../scripts/utils/retry');

/**
 * GitHub REST API adapter for pull request operations.
 */
class GitHubAdapter extends BaseVcsAdapter {
  constructor(config) {
    super(config);
    const [owner, repo] = (config.GITHUB_REPO || '').split('/');
    this.owner = owner;
    this.repo = repo;

    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${config.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 15000,
    });
  }

  async getPRDetails(prNumber) {
    const data = await this._request('GET', `/repos/${this.owner}/${this.repo}/pulls/${prNumber}`);
    return {
      number: data.number,
      title: data.title,
      author: data.user.login,
      url: data.html_url,
      state: data.state,
      merged: data.merged || false,
      description: data.body || '',
      headSha: data.head.sha,
      baseBranch: data.base.ref,
    };
  }

  async addPRComment(prNumber, comment) {
    await this._request(
      'POST',
      `/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`,
      { body: comment }
    );
  }

  async getChangedFiles(prNumber) {
    const files = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const data = await this._request(
        'GET',
        `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`
      );
      files.push(...data.map((f) => f.filename));

      if (data.length < perPage) break;
      page++;
    }

    return files;
  }

  async requestReviewers(prNumber, reviewers) {
    const teams = [];
    const users = [];

    for (const r of reviewers) {
      if (r.includes('/') || r.endsWith('-team') || r.startsWith('team:')) {
        teams.push(r.replace('team:', ''));
      } else {
        users.push(r);
      }
    }

    const body = {};
    if (teams.length) body.team_reviewers = teams;
    if (users.length) body.reviewers = users;

    if (Object.keys(body).length > 0) {
      await this._request(
        'POST',
        `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/requested_reviewers`,
        body
      );
    }
  }

  async getPRApprovalStatus(prNumber) {
    const reviews = await this._request(
      'GET',
      `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/reviews`
    );

    const latestByUser = {};
    for (const review of reviews) {
      const user = review.user.login;
      if (!latestByUser[user] || new Date(review.submitted_at) > new Date(latestByUser[user].submitted_at)) {
        latestByUser[user] = review;
      }
    }

    const approvers = [];
    const pendingReviewers = [];

    for (const [user, review] of Object.entries(latestByUser)) {
      if (review.state === 'APPROVED') {
        approvers.push(user);
      } else if (review.state === 'CHANGES_REQUESTED' || review.state === 'COMMENTED') {
        pendingReviewers.push(user);
      }
    }

    return {
      approved: approvers.length > 0,
      approvers,
      pendingReviewers,
    };
  }

  async setCommitStatus(sha, state, description, context, targetUrl) {
    const body = { state, description, context };
    if (targetUrl) body.target_url = targetUrl;

    await this._request(
      'POST',
      `/repos/${this.owner}/${this.repo}/statuses/${sha}`,
      body
    );
  }

  /**
   * Posts a formatted PR comment with changeset summary.
   * @param {number} prNumber
   * @param {object} changeset - Parsed changeset
   * @param {string} ticketUrl - Jira ticket URL
   * @param {string} ticketId - Jira ticket key
   */
  async postChangesetSummary(prNumber, changeset, ticketUrl, ticketId) {
    const comment = [
      `### DB Change Ticket Created`,
      ``,
      `| Field | Value |`,
      `| --- | --- |`,
      `| Jira Ticket | [${ticketId}](${ticketUrl}) |`,
      `| Changeset | \`${changeset.id}\` |`,
      `| Author | ${changeset.author} |`,
      `| Type | ${changeset.type.toUpperCase()} |`,
      `| Risk | ${changeset.risk.toUpperCase()} |`,
      `| Environment | ${changeset.environment} |`,
      `| Schedule | ${changeset.schedule} |`,
      `| Compliance | ${changeset.compliance.join(', ')} |`,
      ``,
      `**Status:** Awaiting DBA approval before deployment.`,
    ].join('\n');

    await this.addPRComment(prNumber, comment);
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

module.exports = GitHubAdapter;
