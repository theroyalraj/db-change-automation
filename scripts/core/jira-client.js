const JiraAdapter = require('../../adapters/ticketing/jira-adapter');
const { logAudit } = require('../utils/logger');

/**
 * High-level Jira client that orchestrates the full ticket lifecycle.
 * Uses the JiraAdapter for low-level API calls.
 */
class JiraClient {
  /**
   * @param {Record<string, string>} config - Environment variables
   */
  constructor(config) {
    this.adapter = new JiraAdapter(config);
    this.config = config;
  }

  /**
   * Creates a Jira ticket for a database change.
   * @param {object} changeset - Parsed changeset object
   * @param {string} prUrl - Pull request URL
   * @param {number} prNumber - PR number
   * @returns {Promise<{ ticketId: string, ticketUrl: string }>}
   */
  async createChangeTicket(changeset, prUrl, prNumber) {
    const result = await this.adapter.createTicket(changeset, prUrl);

    logAudit('TICKET_CREATED', {
      changesetId: changeset.id,
      jiraTicketId: result.ticketId,
      prNumber,
      actor: changeset.author,
      extra: { ticketUrl: result.ticketUrl, type: changeset.type },
    });

    return result;
  }

  /**
   * Transitions ticket to IN_REVIEW and adds reviewer comment.
   * @param {string} ticketId
   * @param {string} reviewerComment
   */
  async markInReview(ticketId, reviewerComment) {
    await this.adapter.transitionTicket(ticketId, 'IN_REVIEW');
    await this.adapter.addComment(
      ticketId,
      `[IN REVIEW] ${reviewerComment}\nTimestamp: ${new Date().toISOString()}`
    );

    logAudit('REVIEW_REQUESTED', { jiraTicketId: ticketId });
  }

  /**
   * Transitions ticket to APPROVED (mapped to DONE transition or custom).
   * @param {string} ticketId
   * @param {string} approver
   */
  async markApproved(ticketId, approver) {
    await this.adapter.addComment(
      ticketId,
      `[APPROVED] Approved by ${approver} at ${new Date().toISOString()}`
    );

    logAudit('APPROVED', { jiraTicketId: ticketId, actor: approver });
  }

  /**
   * Transitions ticket to DONE with deployment details.
   * @param {string} ticketId
   * @param {object} executionDetails
   * @param {string} executionDetails.environment
   * @param {number} executionDetails.duration
   * @param {string} [executionDetails.dbHost]
   * @param {string} [executionDetails.changesetHash]
   */
  async markDeployed(ticketId, executionDetails) {
    await this.adapter.transitionTicket(ticketId, 'DONE');

    const comment = [
      `[DEPLOYED]`,
      `Environment: ${executionDetails.environment}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Applied by: system`,
      `Duration: ${executionDetails.duration}ms`,
      executionDetails.changesetHash ? `Changeset Hash: ${executionDetails.changesetHash}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await this.adapter.addComment(ticketId, comment);

    logAudit('DEPLOYED', {
      jiraTicketId: ticketId,
      environment: executionDetails.environment,
      duration: executionDetails.duration,
      dbHost: executionDetails.dbHost,
    });
  }

  /**
   * Transitions ticket to FAILED with error details.
   * @param {string} ticketId
   * @param {object} errorDetails
   * @param {string} errorDetails.error
   * @param {string} errorDetails.environment
   * @param {boolean} errorDetails.rollbackAttempted
   * @param {boolean} errorDetails.rollbackSuccess
   */
  async markFailed(ticketId, errorDetails) {
    try {
      await this.adapter.transitionTicket(ticketId, 'FAILED');
    } catch (_) {
      // FAILED status may not exist — fall through
    }

    const comment = [
      `[FAILED]`,
      `Environment: ${errorDetails.environment}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${errorDetails.error}`,
      `Rollback Attempted: ${errorDetails.rollbackAttempted ? 'Yes' : 'No'}`,
      errorDetails.rollbackAttempted
        ? `Rollback Result: ${errorDetails.rollbackSuccess ? 'Success' : 'Failed'}`
        : '',
      ``,
      `Next steps: Investigate the error and re-submit the changeset.`,
    ]
      .filter(Boolean)
      .join('\n');

    await this.adapter.addComment(ticketId, comment);

    logAudit('FAILED', {
      jiraTicketId: ticketId,
      environment: errorDetails.environment,
      extra: { error: errorDetails.error },
    });
  }

  /**
   * Adds a timestamped audit comment to the ticket.
   * @param {string} ticketId
   * @param {object} auditEvent
   * @param {string} auditEvent.actor
   * @param {string} auditEvent.action
   * @param {string} auditEvent.details
   */
  async addAuditComment(ticketId, auditEvent) {
    const comment = `[AUDIT] ${new Date().toISOString()} | ${auditEvent.actor} | ${auditEvent.action} | ${auditEvent.details}`;
    await this.adapter.addComment(ticketId, comment);
  }
}

module.exports = JiraClient;
