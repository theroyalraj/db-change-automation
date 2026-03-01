#!/usr/bin/env node
require('dotenv').config();

const JiraClient = require('../core/jira-client');
const GitHubAdapter = require('../../adapters/vcs/github-adapter');
const NotificationDispatcher = require('../core/notification-dispatcher');
const { logger, logAudit } = require('../utils/logger');

/**
 * Handles any pipeline failure.
 * Captures error context, updates Jira, posts PR comment, sends notifications.
 */
async function main() {
  const env = process.env;

  try {
    const prNumber = env.GITHUB_PR_NUMBER || env.PR_NUMBER;
    const errorMessage = env.FAILURE_ERROR || 'Unknown pipeline failure';
    const environment = env.FAILURE_ENV || env.TARGET_ENV || 'unknown';
    const changesetId = env.CHANGESET_ID || 'unknown';
    const jiraTicketId = env.JIRA_TICKET_ID;

    logger.error(`Pipeline failure: ${errorMessage} (env: ${environment}, changeset: ${changesetId})`);

    logAudit('FAILED', {
      changesetId,
      jiraTicketId,
      environment,
      extra: { error: errorMessage, triggeredBy: 'on-failure' },
    });

    // Update Jira
    if (jiraTicketId) {
      try {
        const jira = new JiraClient(env);
        await jira.markFailed(jiraTicketId, {
          error: errorMessage,
          environment,
          rollbackAttempted: env.AUTO_ROLLBACK_ON_FAILURE === 'true',
          rollbackSuccess: false,
        });
      } catch (jiraError) {
        logger.error(`Failed to update Jira ticket ${jiraTicketId}: ${jiraError.message}`);
      }
    }

    // Post PR comment
    if (prNumber) {
      try {
        const github = new GitHubAdapter(env);
        await github.addPRComment(
          prNumber,
          [
            `### Pipeline Failure`,
            '',
            `**Environment:** ${environment}`,
            `**Changeset:** ${changesetId}`,
            `**Error:** ${errorMessage}`,
            '',
            'Check the pipeline logs for details.',
          ].join('\n')
        );
      } catch (ghError) {
        logger.error(`Failed to post PR comment: ${ghError.message}`);
      }
    }

    // Send notifications
    try {
      const notifier = new NotificationDispatcher(env);
      await notifier.notifyAll('failed', {
        changeset: { id: changesetId, author: env.CHANGESET_AUTHOR || 'unknown', type: 'unknown', description: errorMessage, risk: 'high', compliance: [], schedule: 'immediate' },
        error: errorMessage,
        environment,
      });
    } catch (notifyError) {
      logger.error(`Failed to send failure notifications: ${notifyError.message}`);
    }

    process.exit(1);
  } catch (fatalError) {
    logger.error(`on-failure handler itself failed: ${fatalError.message}`);
    process.exit(1);
  }
}

main();
