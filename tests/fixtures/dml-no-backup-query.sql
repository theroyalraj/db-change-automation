-- ============================================================
-- @id:              dml-test-001
-- @author:          test.user
-- @type:            dml
-- @description:     Test DML with missing backup query
-- @ticket:          TEST-001
-- @environment:     preprod
-- @risk:            low
-- @reviewers:       dba-team
-- @rollback:        auto
-- @compliance:      none
-- @schedule:        immediate
-- @operation:       update
-- @target_table:    users
-- @estimated_rows:  100
-- @requires_backup: true
-- ============================================================

UPDATE users SET active = true WHERE created_at < '2025-01-01';

-- rollback
-- UPDATE users SET active = false WHERE created_at < '2025-01-01';
