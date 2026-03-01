const winston = require('winston');
const path = require('path');
const crypto = require('crypto');

require('winston-daily-rotate-file');

const AUDIT_LEVEL = 'audit';

const customLevels = {
  levels: { error: 0, warn: 1, audit: 2, info: 3, debug: 4 },
  colors: { error: 'red', warn: 'yellow', audit: 'cyan', info: 'green', debug: 'grey' },
};

winston.addColors(customLevels.colors);

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

const consoleFormat = isCI
  ? winston.format.json()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    );

const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '2555', 10);

const logger = winston.createLogger({
  levels: customLevels.levels,
  level: 'debug',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: `${retentionDays}d`,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      level: AUDIT_LEVEL,
    }),
  ],
});

/**
 * Logs a structured audit event with compliance-grade fields.
 *
 * @param {string} eventType - CHANGESET_SUBMITTED | TICKET_CREATED | REVIEW_REQUESTED | APPROVED | REJECTED | DEPLOYED | ROLLBACK | FAILED
 * @param {object} details
 * @param {string} [details.actor='system']
 * @param {string} [details.changesetId]
 * @param {string} [details.jiraTicketId]
 * @param {string} [details.environment]
 * @param {string} [details.dbHost]
 * @param {string} [details.sqlBody] - Will be hashed, never stored raw
 * @param {number} [details.prNumber]
 * @param {number} [details.duration]
 * @param {object} [details.extra]
 */
function logAudit(eventType, details = {}) {
  const sqlHash = details.sqlBody
    ? crypto.createHash('md5').update(details.sqlBody).digest('hex')
    : undefined;

  logger.log(AUDIT_LEVEL, eventType, {
    eventType,
    actor: details.actor || 'system',
    changesetId: details.changesetId,
    jiraTicketId: details.jiraTicketId,
    environment: details.environment,
    dbHost: details.dbHost ? redactHost(details.dbHost) : undefined,
    sqlHash,
    prNumber: details.prNumber,
    duration: details.duration,
    details: details.extra,
  });
}

function redactHost(host) {
  if (!host) return host;
  return host.replace(/:\d+$/, ':****');
}

module.exports = { logger, logAudit };
