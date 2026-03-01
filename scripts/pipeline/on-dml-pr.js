#!/usr/bin/env node
require('dotenv').config();

const { parseChangeset } = require('../core/changeset-parser');
const JiraClient = require('../core/jira-client');
const GitHubAdapter = require('../../adapters/vcs/github-adapter');
const NotificationDispatcher = require('../core/notification-dispatcher');
const { validateEnv } = require('../utils/env-validator');
const { logger, logAudit } = require('../utils/logger');

/**
 * Handles DML-specific PR validation.
 * Enforces DML approval rules, environment restrictions, and backup requirements.
 */
async function main() {
  try {
    const config = validateEnv();
    const env = process.env;

    const prNumber = env.GITHUB_PR_NUMBER || env.PR_NUMBER;
    if (!prNumber) {
      logger.error('PR_NUMBER not set');
      process.exit(1);
    }

    const github = new GitHubAdapter(env);
    const jira = new JiraClient(env);
    const notifier = new NotificationDispatcher(env);

    const changedFiles = await github.getChangedFiles(prNumber);
    const dmlFiles = changedFiles.filter(
      (f) => f.startsWith('changelogs/dml/') && f.endsWith('.sql')
    );

    if (dmlFiles.length === 0) {
      logger.info('No DML changeset files found in this PR. Skipping.');
      process.exit(0);
    }

    const prDetails = await github.getPRDetails(prNumber);
    const allowedEnvs = (env.DML_ALLOWED_ENVIRONMENTS || 'preprod,uat').split(',').map((e) => e.trim());
    const prodEnabled = env.DML_PROD_ENABLED === 'true';
    const approvalRequired = env.DML_APPROVAL_REQUIRED !== 'false';
    const autoApproveLimit = parseInt(env.DML_AUTO_APPROVE_ROW_LIMIT || '0', 10);
    const errors = [];

    for (const file of dmlFiles) {
      try {
        const changeset = parseChangeset(file);

        if (changeset.type !== 'dml') {
          throw new Error(`File ${file} is in changelogs/dml/ but @type is "${changeset.type}". Must be "dml".`);
        }

        // Environment restriction
        if (changeset.environment === 'prod' && !prodEnabled) {
          throw new Error(
            `DML changes to production are BLOCKED. Set DML_PROD_ENABLED=true to allow. File: ${file}`
          );
        }

        if (changeset.environment !== 'all' && !allowedEnvs.includes(changeset.environment) && changeset.environment !== 'prod') {
          throw new Error(
            `DML not allowed for environment "${changeset.environment}". Allowed: ${allowedEnvs.join(', ')}`
          );
        }

        // Approval logic
        const needsApproval =
          approvalRequired &&
          (autoApproveLimit === 0 || changeset.estimatedRows > autoApproveLimit);

        // Create Jira ticket
        const { ticketId, ticketUrl } = await jira.createChangeTicket(
          changeset,
          prDetails.url,
          parseInt(prNumber, 10)
        );

        // Post PR comment
        const approvalNote = needsApproval
          ? `**Approval required** (estimated rows: ${changeset.estimatedRows})`
          : `Auto-approved (estimated rows: ${changeset.estimatedRows} <= limit ${autoApproveLimit})`;

        const backupNote = changeset.requiresBackup
          ? `Backup will run before execution: \`${changeset.backupQuery}\``
          : 'No backup configured';

        const comment = [
          `### DML Change Ticket Created`,
          '',
          `| Field | Value |`,
          `| --- | --- |`,
          `| Jira Ticket | [${ticketId}](${ticketUrl}) |`,
          `| Changeset | \`${changeset.id}\` |`,
          `| Operation | ${changeset.operation.toUpperCase()} |`,
          `| Target Table | ${changeset.targetTable} |`,
          `| Estimated Rows | ${changeset.estimatedRows} |`,
          `| Environment | ${changeset.environment} |`,
          '',
          approvalNote,
          '',
          backupNote,
        ].join('\n');

        await github.addPRComment(prNumber, comment);

        if (changeset.reviewers.length > 0) {
          await github.requestReviewers(prNumber, changeset.reviewers);
        }

        await notifier.notifyAll('approval_needed', { changeset, approvers: [] });

        logger.info(`DML changeset ${changeset.id} processed: Jira ${ticketId}`);
      } catch (fileError) {
        errors.push({ file, error: fileError.message });
        logger.error(`DML validation failed for ${file}: ${fileError.message}`);
      }
    }

    if (errors.length > 0) {
      const errorComment = [
        `### DML Change Validation Failed`,
        '',
        ...errors.map((e) => `- **${e.file}**: ${e.error}`),
      ].join('\n');
      await github.addPRComment(prNumber, errorComment);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error(`on-dml-pr failed: ${error.message}`);
    process.exit(1);
  }
}

main();
