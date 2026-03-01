#!/usr/bin/env node
const path = require('path');
require('dotenv').config();

const { parseChangeset } = require('../core/changeset-parser');
const JiraClient = require('../core/jira-client');
const GitHubAdapter = require('../../adapters/vcs/github-adapter');
const NotificationDispatcher = require('../core/notification-dispatcher');
const { validateEnv } = require('../utils/env-validator');
const { logger, logAudit } = require('../utils/logger');

const COMPLIANCE_RULES = {
  SOX: { requireRollback: true, minApprovers: 2, requireRisk: true },
  PCI_DSS: { requireStaging: true, flagEncryption: true },
  HIPAA: { phiTablesExtraApproval: true },
  GDPR: { personalDataDpoNotify: true },
};

/**
 * Runs when a PR is opened or updated.
 * Validates changesets, creates Jira tickets, posts PR comments, requests reviewers.
 */
async function main() {
  try {
    const config = validateEnv();
    const env = process.env;

    const prNumber = env.GITHUB_PR_NUMBER || env.PR_NUMBER;
    if (!prNumber) {
      logger.error('PR_NUMBER not set. This script must run in a GitHub Actions context.');
      process.exit(1);
    }

    const github = new GitHubAdapter(env);
    const jira = new JiraClient(env);
    const notifier = new NotificationDispatcher(env);

    const changedFiles = await github.getChangedFiles(prNumber);
    const ddlFiles = changedFiles.filter((f) => f.startsWith('changelogs/migrations/') && f.endsWith('.sql'));
    const dmlFiles = changedFiles.filter((f) => f.startsWith('changelogs/dml/') && f.endsWith('.sql'));
    const changesetFiles = [...ddlFiles, ...dmlFiles];

    if (changesetFiles.length === 0) {
      logger.info('No changeset files found in this PR. Skipping.');
      process.exit(0);
    }

    const prDetails = await github.getPRDetails(prNumber);
    const errors = [];

    for (const file of changesetFiles) {
      try {
        const changeset = parseChangeset(file);
        changeset.prNumber = parseInt(prNumber, 10);
        changeset.gitAuthor = prDetails.author;

        // Compliance enforcement
        const complianceMode = env.COMPLIANCE_MODE || 'NONE';
        if (complianceMode !== 'NONE') {
          const rules = COMPLIANCE_RULES[complianceMode] || {};
          if (rules.requireRollback && !changeset.rollbackSql) {
            throw new Error(
              `${complianceMode} compliance requires a rollback block in ${changeset.filename}`
            );
          }
          if (rules.requireRisk && !changeset.risk) {
            throw new Error(
              `${complianceMode} compliance requires @risk to be set in ${changeset.filename}`
            );
          }
        }

        // Validate rollback requirement
        if (env.REQUIRE_ROLLBACK_SCRIPT === 'true' && !changeset.rollbackSql) {
          throw new Error(
            `Rollback script is required but missing in ${changeset.filename}. ` +
              'Add a "-- rollback" block to your changeset.'
          );
        }

        // Check if scheduled
        if (changeset.schedule !== 'immediate' && env.SCHEDULING_ENABLED === 'true') {
          logger.info(
            `Changeset ${changeset.id} is scheduled for ${changeset.schedule}. ` +
              'Will create ticket but defer execution.'
          );
        }

        // Create Jira ticket
        const { ticketId, ticketUrl } = await jira.createChangeTicket(
          changeset,
          prDetails.url,
          parseInt(prNumber, 10)
        );

        changeset.jiraTicketId = ticketId;

        logAudit('CHANGESET_SUBMITTED', {
          changesetId: changeset.id,
          jiraTicketId: ticketId,
          prNumber: parseInt(prNumber, 10),
          actor: changeset.author,
          sqlBody: changeset.sqlBody,
        });

        // Post PR comment
        await github.postChangesetSummary(prNumber, changeset, ticketUrl, ticketId);

        // Request reviewers
        if (changeset.reviewers.length > 0) {
          await github.requestReviewers(prNumber, changeset.reviewers);
        }

        // Notify DBA team
        await notifier.notifyAll('approval_needed', {
          changeset,
          approvers: [],
        });

        logger.info(`Processed ${changeset.filename}: Jira ${ticketId} created`);
      } catch (fileError) {
        errors.push({ file, error: fileError.message });
        logger.error(`Validation failed for ${file}: ${fileError.message}`);
      }
    }

    if (errors.length > 0) {
      const errorComment = [
        `### DB Change Validation Failed`,
        '',
        ...errors.map((e) => `- **${e.file}**: ${e.error}`),
        '',
        'Fix these issues and push again.',
      ].join('\n');

      await github.addPRComment(prNumber, errorComment);

      if (prDetails.headSha) {
        await github.setCommitStatus(
          prDetails.headSha,
          'failure',
          `${errors.length} changeset(s) failed validation`,
          'db-change-automation'
        );
      }

      process.exit(1);
    }

    if (prDetails.headSha) {
      await github.setCommitStatus(
        prDetails.headSha,
        'success',
        `${changesetFiles.length} changeset(s) validated`,
        'db-change-automation'
      );
    }

    logger.info(`PR #${prNumber}: ${changesetFiles.length} changeset(s) processed successfully`);
    process.exit(0);
  } catch (error) {
    logger.error(`on-pr-open failed: ${error.message}`);
    process.exit(1);
  }
}

main();
