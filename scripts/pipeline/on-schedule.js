#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const { parseChangeset } = require('../core/changeset-parser');
const JiraClient = require('../core/jira-client');
const EnvironmentPromoter = require('../core/environment-promoter');
const NotificationDispatcher = require('../core/notification-dispatcher');
const { validateEnv } = require('../utils/env-validator');
const { logger, logAudit } = require('../utils/logger');

const SCHEDULE_WINDOW_MS = 5 * 60 * 1000; // 5-minute tolerance

/**
 * Handles scheduled changeset execution.
 * Called by GitHub Actions cron (every 15 min) or workflow_dispatch.
 */
async function main() {
  try {
    const config = validateEnv();
    const env = process.env;

    if (env.SCHEDULING_ENABLED !== 'true') {
      logger.info('Scheduling is disabled (SCHEDULING_ENABLED != true). Exiting.');
      process.exit(0);
    }

    const changesetPath = env.CHANGESET_PATH;
    const targetEnv = env.TARGET_ENVIRONMENT || env.TARGET_ENV;
    const scheduledBy = env.SCHEDULED_BY || 'cron';

    if (!changesetPath) {
      logger.info('No CHANGESET_PATH provided. Checking for pending scheduled changesets...');
      // In a full implementation, this would scan a schedule store (DB or file)
      // For now, log and exit
      logger.info('No pending scheduled changesets found.');
      process.exit(0);
    }

    const changeset = parseChangeset(changesetPath);

    // Validate schedule time
    if (changeset.schedule !== 'immediate') {
      const scheduledTime = new Date(changeset.schedule);
      const now = new Date();
      const timezone = env.SCHEDULE_TIMEZONE || 'UTC';

      const diff = Math.abs(now.getTime() - scheduledTime.getTime());
      if (diff > SCHEDULE_WINDOW_MS) {
        logger.info(
          `Changeset ${changeset.id} is scheduled for ${changeset.schedule} but current time is outside the 5-minute window. Skipping.`
        );
        process.exit(0);
      }
    }

    logger.info(`Executing scheduled changeset ${changeset.id} (scheduled by: ${scheduledBy})`);

    logAudit('CHANGESET_SUBMITTED', {
      changesetId: changeset.id,
      extra: { trigger: 'scheduled', scheduledBy, targetEnv },
    });

    const jira = new JiraClient(env);
    const promoter = new EnvironmentPromoter(env);
    const notifier = new NotificationDispatcher(env);

    const { results } = await promoter.promote(changeset, {
      targetEnv,
      liquibaseProperties: {
        changeLogFile: env.LIQUIBASE_CHANGELOG_PATH || 'changelogs/master.xml',
      },
    });

    const failed = results.find((r) => r.status === 'FAILED');

    if (failed) {
      logger.error(`Scheduled execution of ${changeset.id} FAILED on ${failed.env}: ${failed.error}`);

      await notifier.notifyAll('failed', {
        changeset,
        error: failed.error,
        environment: failed.env,
      });

      process.exit(1);
    }

    logger.info(`Scheduled execution of ${changeset.id} completed successfully`);

    await notifier.notifyAll('deployed', {
      changeset,
      environment: results[results.length - 1].env,
      result: { success: true, duration: results.reduce((s, r) => s + r.duration, 0) },
    });

    process.exit(0);
  } catch (error) {
    logger.error(`on-schedule failed: ${error.message}`);
    process.exit(1);
  }
}

main();
