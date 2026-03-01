-- ============================================================
-- DB CHANGE METADATA (required — do not remove or reorder)
-- ============================================================
-- @id:          20260301-001-add-phone-column
-- @author:      theroyalraj
-- @type:        ddl
-- @description: Add phone number column to users table for SMS verification
-- @ticket:      PROJ-456
-- @environment: prod
-- @risk:        low
-- @reviewers:   dba-team
-- @rollback:    auto
-- @compliance:  none
-- @schedule:    immediate
-- ============================================================

-- changeset theroyalraj:20260301-001-add-phone-column
-- labels: environment:prod
-- context: prod

ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL;

-- rollback
ALTER TABLE users DROP COLUMN phone;
