const { validateEnv, getDbConfigForEnv } = require('../../scripts/utils/env-validator');

describe('env-validator', () => {
  const validEnv = {
    JIRA_BASE_URL: 'https://test.atlassian.net',
    JIRA_EMAIL: 'test@test.com',
    JIRA_API_TOKEN: 'token123',
    JIRA_PROJECT_KEY: 'TEST',
    JIRA_ISSUE_TYPE: 'Task',
    JIRA_AUTH_TYPE: 'cloud',
    JIRA_DONE_TRANSITION_ID: '31',
    JIRA_IN_REVIEW_TRANSITION_ID: '21',
    JIRA_FAILED_TRANSITION_ID: '41',
    GITHUB_TOKEN: 'ghp_test',
    GITHUB_REPO: 'org/repo',
    ENVIRONMENTS: 'preprod,prod',
    UAT_ENABLED: 'false',
    PROD_REQUIRES_MANUAL_APPROVAL: 'false',
    DB_TYPE: 'mysql',
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_NAME: 'testdb',
    DB_USERNAME: 'user',
    DB_PASSWORD: 'pass',
    BYTEBASE_URL: 'http://localhost:8080',
    BYTEBASE_SERVICE_ACCOUNT: 'svc@bb.com',
    BYTEBASE_SERVICE_KEY: 'key123',
    LIQUIBASE_CHANGELOG_PATH: 'changelogs/master.xml',
    NOTIFICATION_CHANNELS: '',
    SCHEDULING_ENABLED: 'false',
    SCHEDULE_TIMEZONE: 'UTC',
    DML_APPROVAL_REQUIRED: 'true',
    DML_JIRA_ISSUE_TYPE: 'Sub-task',
    DML_AUTO_APPROVE_ROW_LIMIT: '0',
    DML_ALLOWED_ENVIRONMENTS: 'preprod,uat',
    DML_PROD_ENABLED: 'false',
    REQUIRE_APPROVAL_BEFORE_DEPLOY: 'true',
    AUTO_ROLLBACK_ON_FAILURE: 'true',
    COMPLIANCE_MODE: 'NONE',
    AUDIT_LOG_RETENTION_DAYS: '30',
    ENFORCE_SEPARATION_OF_DUTIES: 'false',
    REQUIRE_ROLLBACK_SCRIPT: 'false',
  };

  describe('validateEnv', () => {
    it('should pass with all valid env vars', () => {
      expect(() => validateEnv(validEnv)).not.toThrow();
    });

    it('should throw when JIRA_BASE_URL is missing', () => {
      const env = { ...validEnv };
      delete env.JIRA_BASE_URL;
      expect(() => validateEnv(env)).toThrow('JIRA_BASE_URL');
    });

    it('should throw when JIRA_EMAIL is invalid', () => {
      const env = { ...validEnv, JIRA_EMAIL: 'not-an-email' };
      expect(() => validateEnv(env)).toThrow('JIRA_EMAIL');
    });

    it('should throw when GITHUB_REPO format is wrong', () => {
      const env = { ...validEnv, GITHUB_REPO: 'no-slash' };
      expect(() => validateEnv(env)).toThrow('GITHUB_REPO');
    });

    it('should throw when DB_PORT is not a number', () => {
      const env = { ...validEnv, DB_PORT: 'abc' };
      expect(() => validateEnv(env)).toThrow('DB_PORT');
    });

    it('should throw when email config missing but email channel enabled', () => {
      const env = { ...validEnv, NOTIFICATION_CHANNELS: 'email' };
      expect(() => validateEnv(env)).toThrow('EMAIL_SMTP_HOST');
    });

    it('should throw when whatsapp config missing but whatsapp channel enabled', () => {
      const env = { ...validEnv, NOTIFICATION_CHANNELS: 'whatsapp' };
      expect(() => validateEnv(env)).toThrow('TWILIO_ACCOUNT_SID');
    });

    it('should pass when email channel enabled with full config', () => {
      const env = {
        ...validEnv,
        NOTIFICATION_CHANNELS: 'email',
        EMAIL_SMTP_HOST: 'smtp.test.com',
        EMAIL_SMTP_PORT: '587',
        EMAIL_FROM: 'test@test.com',
        EMAIL_USERNAME: 'user',
        EMAIL_PASSWORD: 'pass',
        EMAIL_DBA_RECIPIENTS: 'dba@test.com',
      };
      expect(() => validateEnv(env)).not.toThrow();
    });

    it('should pass when whatsapp channel enabled with full config', () => {
      const env = {
        ...validEnv,
        NOTIFICATION_CHANNELS: 'whatsapp',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+1000',
        WHATSAPP_DBA_NUMBERS: 'whatsapp:+2000',
        WHATSAPP_NOTIFY_ON: 'all',
      };
      expect(() => validateEnv(env)).not.toThrow();
    });

    it('should include actionable error message', () => {
      try {
        validateEnv({});
        fail('Expected error');
      } catch (e) {
        expect(e.message).toContain('Environment validation failed');
        expect(e.message).toContain('Fix these issues');
      }
    });
  });

  describe('getDbConfigForEnv', () => {
    it('should return env-specific config when available', () => {
      const env = {
        ...validEnv,
        PREPROD_DB_TYPE: 'mysql',
        PREPROD_DB_HOST: 'preprod.db.com',
        PREPROD_DB_PORT: '3306',
        PREPROD_DB_NAME: 'preprod_app',
        PREPROD_DB_USERNAME: 'preprod_user',
        PREPROD_DB_PASSWORD: 'preprod_pass',
        PREPROD_DB_SSL: 'true',
      };
      const config = getDbConfigForEnv('preprod', env);
      expect(config.host).toBe('preprod.db.com');
      expect(config.name).toBe('preprod_app');
      expect(config.ssl).toBe(true);
    });

    it('should fall back to primary DB config when env-specific not set', () => {
      const config = getDbConfigForEnv('staging', validEnv);
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(3306);
      expect(config.name).toBe('testdb');
    });
  });
});
