const { z } = require('zod');

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  // Jira
  JIRA_BASE_URL: z.string().url('JIRA_BASE_URL must be a valid URL'),
  JIRA_EMAIL: z.string().email('JIRA_EMAIL must be a valid email'),
  JIRA_API_TOKEN: z.string().min(1, 'JIRA_API_TOKEN is required'),
  JIRA_PROJECT_KEY: z.string().min(1, 'JIRA_PROJECT_KEY is required'),
  JIRA_ISSUE_TYPE: z.string().default('Task'),
  JIRA_AUTH_TYPE: z.enum(['cloud', 'server']).default('cloud'),
  JIRA_DONE_TRANSITION_ID: z.string().min(1, 'JIRA_DONE_TRANSITION_ID is required'),
  JIRA_IN_REVIEW_TRANSITION_ID: z.string().min(1, 'JIRA_IN_REVIEW_TRANSITION_ID is required'),
  JIRA_FAILED_TRANSITION_ID: z.string().min(1, 'JIRA_FAILED_TRANSITION_ID is required'),

  // GitHub
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_REPO: z.string().regex(/^.+\/.+$/, 'GITHUB_REPO must be in "org/repo" format'),

  // Multi-environment
  ENVIRONMENTS: z.string().min(1, 'ENVIRONMENTS is required (e.g., "preprod,uat,prod")'),
  UAT_ENABLED: booleanString.default('true'),
  PROD_REQUIRES_MANUAL_APPROVAL: booleanString.default('true'),

  // Database (primary fallback)
  DB_TYPE: z.enum(['mysql', 'postgresql', 'mssql', 'oracle']).default('mysql'),
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.string().regex(/^\d+$/, 'DB_PORT must be a number'),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USERNAME: z.string().min(1, 'DB_USERNAME is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),

  // Bytebase
  BYTEBASE_URL: z.string().url('BYTEBASE_URL must be a valid URL'),
  BYTEBASE_SERVICE_ACCOUNT: z.string().min(1, 'BYTEBASE_SERVICE_ACCOUNT is required'),
  BYTEBASE_SERVICE_KEY: z.string().min(1, 'BYTEBASE_SERVICE_KEY is required'),

  // Liquibase
  LIQUIBASE_CHANGELOG_PATH: z.string().min(1, 'LIQUIBASE_CHANGELOG_PATH is required'),

  // Notifications (optional — empty string disables)
  NOTIFICATION_CHANNELS: z.string().default(''),

  // Scheduling
  SCHEDULING_ENABLED: booleanString.default('false'),
  SCHEDULE_TIMEZONE: z.string().default('UTC'),

  // DML config
  DML_APPROVAL_REQUIRED: booleanString.default('true'),
  DML_JIRA_ISSUE_TYPE: z.string().default('Sub-task'),
  DML_AUTO_APPROVE_ROW_LIMIT: z.string().regex(/^\d+$/).default('0'),
  DML_ALLOWED_ENVIRONMENTS: z.string().default('preprod,uat'),
  DML_PROD_ENABLED: booleanString.default('false'),

  // Pipeline behaviour
  REQUIRE_APPROVAL_BEFORE_DEPLOY: booleanString.default('true'),
  AUTO_ROLLBACK_ON_FAILURE: booleanString.default('true'),

  // Compliance
  COMPLIANCE_MODE: z.enum(['SOX', 'PCI_DSS', 'HIPAA', 'GDPR', 'NONE']).default('NONE'),
  AUDIT_LOG_RETENTION_DAYS: z.string().regex(/^\d+$/).default('2555'),
  ENFORCE_SEPARATION_OF_DUTIES: booleanString.default('true'),
  REQUIRE_ROLLBACK_SCRIPT: booleanString.default('true'),
});

/**
 * Conditionally required fields when notification channels are enabled.
 */
const emailSchema = z.object({
  EMAIL_SMTP_HOST: z.string().min(1, 'EMAIL_SMTP_HOST is required when email notifications are enabled'),
  EMAIL_SMTP_PORT: z.string().regex(/^\d+$/),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email'),
  EMAIL_USERNAME: z.string().min(1),
  EMAIL_PASSWORD: z.string().min(1),
  EMAIL_DBA_RECIPIENTS: z.string().min(1, 'EMAIL_DBA_RECIPIENTS is required'),
});

const whatsappSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required when WhatsApp notifications are enabled'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required'),
  TWILIO_WHATSAPP_FROM: z.string().min(1, 'TWILIO_WHATSAPP_FROM is required'),
  WHATSAPP_DBA_NUMBERS: z.string().min(1, 'WHATSAPP_DBA_NUMBERS is required'),
  WHATSAPP_NOTIFY_ON: z.string().default('failure,prod_deploy'),
});

/**
 * Validates all required environment variables and returns a typed config object.
 * Fails fast with descriptive error messages.
 *
 * @param {Record<string, string>} [env=process.env] - Environment variables to validate
 * @returns {object} Validated and parsed configuration
 * @throws {Error} If required variables are missing or malformed
 */
function validateEnv(env = process.env) {
  const baseResult = envSchema.safeParse(env);

  if (!baseResult.success) {
    const missing = baseResult.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    throw new Error(
      `Environment validation failed. Fix these issues:\n${missing.join('\n')}`
    );
  }

  const channels = (env.NOTIFICATION_CHANNELS || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (channels.includes('email')) {
    const emailResult = emailSchema.safeParse(env);
    if (!emailResult.success) {
      const errors = emailResult.error.issues.map(
        (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
      );
      throw new Error(
        `Email notification config invalid:\n${errors.join('\n')}`
      );
    }
  }

  if (channels.includes('whatsapp')) {
    const waResult = whatsappSchema.safeParse(env);
    if (!waResult.success) {
      const errors = waResult.error.issues.map(
        (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
      );
      throw new Error(
        `WhatsApp notification config invalid:\n${errors.join('\n')}`
      );
    }
  }

  return baseResult.data;
}

/**
 * Returns DB config for a specific environment, falling back to primary DB_* vars.
 * Includes optional mysqlVersion hint used by the adapter for Liquibase compatibility checks.
 *
 * @param {string} envName - Environment name (e.g., 'preprod', 'uat', 'prod')
 * @param {Record<string, string>} [env=process.env]
 * @returns {{ host: string, port: number, name: string, username: string, password: string, ssl: boolean, type: string, mysqlVersion?: string }}
 */
function getDbConfigForEnv(envName, env = process.env) {
  const prefix = envName.toUpperCase();
  return {
    type: env[`${prefix}_DB_TYPE`] || env.DB_TYPE || 'mysql',
    host: env[`${prefix}_DB_HOST`] || env.DB_HOST,
    port: parseInt(env[`${prefix}_DB_PORT`] || env.DB_PORT, 10),
    name: env[`${prefix}_DB_NAME`] || env.DB_NAME,
    username: env[`${prefix}_DB_USERNAME`] || env.DB_USERNAME,
    password: env[`${prefix}_DB_PASSWORD`] || env.DB_PASSWORD,
    ssl: (env[`${prefix}_DB_SSL`] || env.DB_SSL) === 'true',
    mysqlVersion: env[`${prefix}_DB_MYSQL_VERSION`] || undefined,
  };
}

module.exports = { validateEnv, getDbConfigForEnv, envSchema, emailSchema, whatsappSchema };

// Allow running directly: node scripts/utils/env-validator.js
if (require.main === module) {
  require('dotenv').config();
  try {
    const config = validateEnv();
    console.log('Environment validation passed.');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
