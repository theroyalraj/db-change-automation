-- ============================================================
-- DB CHANGE METADATA (required — do not remove or reorder)
-- ============================================================
-- @id:          20260228-001-add-email-verified
-- @author:      john.doe
-- @type:        ddl
-- @description: Add email_verified boolean column to users table
-- @ticket:      PROJ-123
-- @environment: prod
-- @risk:        medium
-- @reviewers:   dba-team
-- @rollback:    auto
-- @compliance:  SOX
-- @schedule:    immediate
-- ============================================================

-- changeset john.doe:20260228-001-add-email-verified
-- labels: environment:prod
-- context: prod

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- rollback
ALTER TABLE users DROP COLUMN email_verified;
