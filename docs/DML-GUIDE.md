# DML Guide

## Overview

DML (Data Manipulation Language) changes — INSERT, UPDATE, DELETE — use a separate pipeline from DDL changes. This provides different approval rules, environment restrictions, and backup capabilities.

## Creating a DML Changeset

Create files in `changelogs/dml/` using the template:

```sql
-- ============================================================
-- DB CHANGE METADATA — DML (required)
-- ============================================================
-- @id:              20260301-001-update-feature-flags
-- @author:          jane.smith
-- @type:            dml
-- @description:     Enable feature flags for Q2 rollout
-- @ticket:          PROJ-456
-- @environment:     preprod
-- @risk:            low
-- @reviewers:       dba-team
-- @rollback:        auto
-- @compliance:      none
-- @schedule:        immediate
-- @operation:       update
-- @target_table:    feature_flags
-- @estimated_rows:  15
-- @requires_backup: true
-- @backup_query:    SELECT * FROM feature_flags WHERE category = 'q2'
-- ============================================================

UPDATE feature_flags SET enabled = true WHERE category = 'q2';

-- rollback
UPDATE feature_flags SET enabled = false WHERE category = 'q2';
```

## DML-Specific Fields

| Field | Required | Description |
|-------|----------|-------------|
| `@operation` | Yes | `insert`, `update`, or `delete` |
| `@target_table` | Yes | The table being modified |
| `@estimated_rows` | Yes | Approximate number of rows affected |
| `@requires_backup` | Yes | `true` or `false` — run backup query before execution |
| `@backup_query` | If backup=true | SELECT query to capture current state |

## Approval Rules

Controlled by environment variables:

- `DML_APPROVAL_REQUIRED=true` — all DML needs approval
- `DML_AUTO_APPROVE_ROW_LIMIT=100` — auto-approve if estimated rows < 100
- `DML_ALLOWED_ENVIRONMENTS=preprod,uat` — which environments allow DML
- `DML_PROD_ENABLED=false` — production DML is blocked by default

## Environment Restrictions

By default, DML is only allowed in `preprod` and `uat`. To enable production DML, set `DML_PROD_ENABLED=true` (use with extreme caution).

## Backup Process

When `@requires_backup=true`:

1. The `@backup_query` is executed before the DML
2. The row count is logged to the Jira ticket
3. The backup serves as an audit record (not a restore mechanism)

## Jira Ticket Type

DML changes create tickets with the `DML_JIRA_ISSUE_TYPE` (default: `Sub-task`), keeping them separate from DDL tickets in Jira filters and reports.
