-- ============================================================
-- DB CHANGE METADATA (required — do not remove or reorder)
-- ============================================================
-- @id:          YYYYMMDD-NNN-short-description
-- @author:      firstname.lastname (must match Git username)
-- @type:        ddl
-- @description: Human-readable description of what this change does
-- @ticket:      PROJ-000 (existing Jira epic or story this relates to)
-- @environment: dev | staging | preprod | uat | prod | all
-- @risk:        low | medium | high
-- @reviewers:   dba-team (GitHub team slug required for approval)
-- @rollback:    manual | auto (auto = rollback block below is used)
-- @compliance:  SOX | PCI_DSS | HIPAA | GDPR | none
-- @schedule:    immediate | YYYY-MM-DDTHH:MM (ISO8601, in SCHEDULE_TIMEZONE)
-- ============================================================

-- changeset firstname.lastname:YYYYMMDD-NNN
-- labels: environment:prod
-- context: prod

-- YOUR DDL SQL HERE
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- rollback
-- ALTER TABLE users DROP COLUMN email_verified;
