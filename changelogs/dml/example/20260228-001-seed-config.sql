-- ============================================================
-- DB CHANGE METADATA — DML (required — do not remove or reorder)
-- ============================================================
-- @id:              20260228-001-seed-config
-- @author:          jane.smith
-- @type:            dml
-- @description:     Seed initial configuration settings for feature flags
-- @ticket:          PROJ-456
-- @environment:     preprod
-- @risk:            low
-- @reviewers:       dba-team
-- @rollback:        auto
-- @compliance:      none
-- @schedule:        immediate
-- @operation:       insert
-- @target_table:    config_settings
-- @estimated_rows:  3
-- @requires_backup: false
-- @backup_query:    SELECT * FROM config_settings WHERE key IN ('feat_a','feat_b','feat_c')
-- ============================================================

-- changeset jane.smith:20260228-001-seed-config
-- labels: environment:preprod
-- context: preprod

INSERT INTO config_settings (key, value, updated_at) VALUES
  ('feat_a', 'enabled', NOW()),
  ('feat_b', 'disabled', NOW()),
  ('feat_c', 'enabled', NOW());

-- rollback
DELETE FROM config_settings WHERE key IN ('feat_a', 'feat_b', 'feat_c');
