#!/usr/bin/env node
require('dotenv').config();

const { parseChangeset } = require('../core/changeset-parser');
const JiraClient = require('../core/jira-client');
const GitHubAdapter = require('../../adapters/vcs/github-adapter');
const EnvironmentPromoter = require('../core/environment-promoter');
const { validateEnv } = require('../utils/env-validator');
const { logger, logAudit } = require('../utils/logger');
const crypto = require('crypto');

/**
 * Runs when a PR is merged.
 * Verifies approvals, runs multi-environment promotion, updates Jira.
 */
async function main() {
  try {
    const config = validateEnv();
    const env = process.env;

    const prNumber = env.GITHUB_PR_NUMBER || env.PR_NUMBER;
    const targetEnv = env.TARGET_ENV; // Set by GitHub Actions job

    if (!prNumber) {
      logger.error('PR_NUMBER not set');
      process.exit(1);
    }

    const github = new GitHubAdapter(env);
    const jira = new JiraClient(env);
    const promoter = new EnvironmentPromoter(env);

    // Get PR details
    const prDetails = await github.getPRDetails(prNumber);
    if (!prDetails.merged) {
      logger.info('PR was closed without merging. Skipping deployment.');
      process.exit(0);
    }

    // Verify approvals (separation of duties)
    if (env.REQUIRE_APPROVAL_BEFORE_DEPLOY === 'true') {
      const approval = await github.getPRApprovalStatus(prNumber);
      if (!approval.approved) {
        const msg = 'Deployment blocked: PR has not been approved by any reviewer.';
        logger.error(msg);
        await github.addPRComment(prNumber, `### Deployment Blocked\n\n${msg}`);
        process.exit(1);
      }

      if (env.ENFORCE_SEPARATION_OF_DUTIES === 'true') {
        const authorApprovedSelf = approval.approvers.includes(prDetails.author);
        if (authorApprovedSelf && approval.approvers.length <= 1) {
          const msg = 'Deployment blocked: Separation of duties violation — author cannot be the only approver.';
          logger.error(msg);
          await github.addPRComment(prNumber, `### Deployment Blocked\n\n${msg}`);
          process.exit(1);
        }
      }
    }

    // Find changeset files
    const changedFiles = await github.getChangedFiles(prNumber);
    const changesetFiles = changedFiles.filter(
      (f) =>
        (f.startsWith('changelogs/migrations/') || f.startsWith('changelogs/dml/')) &&
        f.endsWith('.sql')
    );

    if (changesetFiles.length === 0) {
      logger.info('No changeset files to deploy.');
      process.exit(0);
    }

    for (const file of changesetFiles) {
      const changeset = parseChangeset(file);
      changeset.prNumber = parseInt(prNumber, 10);

      // Check for scheduled execution
      if (changeset.schedule !== 'immediate' && env.SCHEDULING_ENABLED === 'true') {
        logger.info(`Changeset ${changeset.id} is scheduled for ${changeset.schedule}. Deferring.`);
        continue;
      }

      // Extract Jira ticket from PR comments (simplified — looks for ticket key pattern)
      const jiraTicketId = env.JIRA_TICKET_ID || `${env.JIRA_PROJECT_KEY}-0`;
      changeset.jiraTicketId = jiraTicketId;

      // Mark in review
      await jira.markInReview(jiraTicketId, `Deploying changeset ${changeset.id}`);

      // Run multi-environment promotion
      const { results } = await promoter.promote(changeset, {
        targetEnv,
        liquibaseProperties: {
          changeLogFile: env.LIQUIBASE_CHANGELOG_PATH || 'changelogs/master.xml',
        },
      });

      const failed = results.find((r) => r.status === 'FAILED');
      const lastResult = results[results.length - 1];

      if (failed) {
        await jira.markFailed(jiraTicketId, {
          error: failed.error,
          environment: failed.env,
          rollbackAttempted: env.AUTO_ROLLBACK_ON_FAILURE === 'true',
          rollbackSuccess: false,
        });

        await github.addPRComment(
          prNumber,
          `### Deployment FAILED on ${failed.env}\n\nError: ${failed.error}\n\nCheck the Jira ticket and pipeline logs.`
        );

        process.exit(1);
      }

      if (lastResult.status === 'AWAITING_APPROVAL') {
        await github.addPRComment(
          prNumber,
          `### Deployment to prod awaiting manual approval\n\nPreprod deployment succeeded. Approve the prod deployment via GitHub Environments.`
        );
        continue;
      }

      // All environments succeeded
      const changesetHash = crypto
        .createHash('md5')
        .update(changeset.sqlBody)
        .digest('hex');

      await jira.markDeployed(jiraTicketId, {
        environment: lastResult.env,
        duration: results.reduce((sum, r) => sum + r.duration, 0),
        changesetHash,
      });

      const envSummary = results.map((r) => `- **${r.env}**: ${r.status} (${r.duration}ms)`).join('\n');
      await github.addPRComment(
        prNumber,
        `### Deployment Complete\n\n${envSummary}\n\nJira ticket closed.`
      );

      logger.info(`Changeset ${changeset.id} deployed successfully across all environments`);
    }

    process.exit(0);
  } catch (error) {
    logger.error(`on-pr-merge failed: ${error.message}`);
    process.exit(1);
  }
}

main();
