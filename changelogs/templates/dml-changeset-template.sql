-- ============================================================
-- DB CHANGE METADATA — DML (required — do not remove or reorder)
-- ============================================================
-- @id:              YYYYMMDD-NNN-short-description
-- @author:          firstname.lastname (must match Git username)
-- @type:            dml
-- @description:     Human-readable description of what this change does
-- @ticket:          PROJ-000 (existing Jira epic or story this relates to)
-- @environment:     dev | staging | preprod | uat | prod | all
-- @risk:            low | medium | high
-- @reviewers:       dba-team (GitHub team slug required for approval)
-- @rollback:        manual | auto
-- @compliance:      SOX | PCI_DSS | HIPAA | GDPR | none
-- @schedule:        immediate | YYYY-MM-DDTHH:MM
-- @operation:       insert | update | delete
-- @target_table:    table_name
-- @estimated_rows:  500
-- @requires_backup: true | false
-- @backup_query:    SELECT * FROM table_name WHERE condition
-- ============================================================

-- changeset firstname.lastname:YYYYMMDD-NNN
-- labels: environment:preprod
-- context: preprod

-- YOUR DML SQL HERE
INSERT INTO config_settings (key, value, updated_at)
VALUES ('feature_flag_x', 'enabled', NOW());

-- rollback
-- DELETE FROM config_settings WHERE key = 'feature_flag_x';
