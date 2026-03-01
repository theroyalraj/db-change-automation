# Developer Guide

## Your Day-to-Day Workflow

As a developer, you only do 3 things:

1. **Write a SQL changeset** using the template
2. **Commit to a branch** and push
3. **Open a Pull Request** — everything else is automated

## Step 1: Write Your Changeset

### DDL Changes (ALTER, CREATE, DROP)

Create a file in `changelogs/migrations/` using the naming convention:

```
YYYYMMDD-NNN-short-description.sql
```

Example: `20260301-001-add-email-verified-column.sql`

Use the template from `changelogs/templates/changeset-template.sql`:

```sql
-- ============================================================
-- DB CHANGE METADATA (required — do not remove or reorder)
-- ============================================================
-- @id:          20260301-001-add-email-verified-column
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

-- changeset john.doe:20260301-001-add-email-verified-column
-- context: prod

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- rollback
ALTER TABLE users DROP COLUMN email_verified;
```

### DML Changes (INSERT, UPDATE, DELETE)

Create a file in `changelogs/dml/` — see [DML-GUIDE.md](DML-GUIDE.md).

## Step 2: Metadata Field Reference

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `@id` | Yes | `YYYYMMDD-NNN-description` | Unique changeset identifier |
| `@author` | Yes | `firstname.lastname` | Must match your Git username |
| `@type` | Yes | `ddl` or `dml` | Type of database change |
| `@description` | Yes | Free text | What this change does |
| `@ticket` | Yes | `PROJ-NNN` | Related Jira epic/story |
| `@environment` | Yes | `dev/staging/preprod/uat/prod/all` | Target environment |
| `@risk` | Yes | `low/medium/high` | Risk assessment |
| `@reviewers` | Yes | GitHub team slug | Who must approve |
| `@rollback` | Yes | `manual/auto` | How rollback is handled |
| `@compliance` | Yes | `SOX/PCI_DSS/HIPAA/GDPR/none` | Compliance framework |
| `@schedule` | No | `immediate` or `YYYY-MM-DDTHH:MM` | When to execute |

## Step 3: What Happens After You Open a PR

1. **Validation** — changeset is parsed and validated (metadata, SQL, rollback block)
2. **Jira ticket created** — with all changeset details, linked to your `@ticket`
3. **PR comment posted** — summary table with Jira link
4. **Reviewers requested** — from `@reviewers` field
5. **DBA reviews** — approves or requests changes

## After Approval and Merge

1. **Preprod deployment** — automatic
2. **UAT deployment** — automatic (if UAT is enabled)
3. **Prod deployment** — waits for manual approval via GitHub Environments
4. **Jira ticket closed** — with deployment details

## What To Do If Your Change Is Rejected

1. Read the review comments on the PR
2. Fix the SQL and/or metadata
3. Push the fix to the same branch
4. The pipeline re-validates automatically

## Writing Good Rollback Scripts

Always include a rollback block. Match every forward change:

| Change | Rollback |
|--------|----------|
| `ADD COLUMN x` | `DROP COLUMN x` |
| `CREATE TABLE x` | `DROP TABLE x` |
| `CREATE INDEX x` | `DROP INDEX x` |
| `ALTER COLUMN x TYPE y` | `ALTER COLUMN x TYPE original_type` |
| `INSERT INTO x` | `DELETE FROM x WHERE ...` |

## Common Examples

### Add Column
```sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
-- rollback
ALTER TABLE users DROP COLUMN phone;
```

### Create Index
```sql
CREATE INDEX idx_users_email ON users(email);
-- rollback
DROP INDEX idx_users_email ON users;
```

### Create Table
```sql
CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- rollback
DROP TABLE audit_log;
```
