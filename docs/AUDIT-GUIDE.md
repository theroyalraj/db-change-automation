# Audit Guide

## Audit Data Sources

The system produces audit data in three places:

1. **Liquibase DATABASECHANGELOG table** — in the target database
2. **Structured log files** — in `logs/audit-YYYY-MM-DD.log`
3. **Jira ticket comments** — timestamped audit entries

## Querying DATABASECHANGELOG

```sql
-- All applied changesets
SELECT ID, AUTHOR, FILENAME, DATEEXECUTED, ORDEREXECUTED, MD5SUM, DESCRIPTION
FROM DATABASECHANGELOG
ORDER BY DATEEXECUTED DESC;

-- Changes in a date range
SELECT * FROM DATABASECHANGELOG
WHERE DATEEXECUTED BETWEEN '2026-01-01' AND '2026-03-31'
ORDER BY DATEEXECUTED;

-- Changes by a specific author
SELECT * FROM DATABASECHANGELOG
WHERE AUTHOR = 'john.doe';

-- Failed changesets (check DATABASECHANGELOGLOCK)
SELECT * FROM DATABASECHANGELOGLOCK;
```

## Querying Audit Logs

Audit logs are JSON-lines files in `logs/`:

```bash
# Find all DEPLOYED events
grep '"eventType":"DEPLOYED"' logs/audit-2026-03-01.log

# Find failures for a specific changeset
grep '"changesetId":"20260228-001"' logs/audit-*.log | grep FAILED

# Count events by type
grep -o '"eventType":"[A-Z_]*"' logs/audit-2026-03-01.log | sort | uniq -c
```

Each log entry contains:
- `timestamp` — ISO8601
- `eventType` — CHANGESET_SUBMITTED, TICKET_CREATED, REVIEW_REQUESTED, APPROVED, REJECTED, DEPLOYED, ROLLBACK, FAILED
- `actor` — username or "system"
- `changesetId` — changeset identifier
- `jiraTicketId` — Jira ticket key
- `environment` — target environment
- `sqlHash` — MD5 hash of SQL (for tamper detection)
- `duration` — execution time in milliseconds

## Querying Jira for Audit

```
# All DB change tickets in a date range
project = DBCHANGE AND created >= "2026-01-01" AND created <= "2026-03-31" AND labels = "db-change"

# Failed deployments
project = DBCHANGE AND labels = "requires-investigation"

# Changes by compliance mode
project = DBCHANGE AND labels = "compliance-sox"

# DML changes
project = DBCHANGE AND labels = "dml-change"
```

## Generating Compliance Reports

For SOX audits, produce a report showing:

1. All changes applied (DATABASECHANGELOG query above)
2. Who submitted each change (Jira ticket author)
3. Who approved each change (Jira ticket comments + GitHub PR approvers)
4. Timestamp of each action (audit log)
5. Rollback availability (changeset `@rollback` field)

## Log Retention

Configured via `AUDIT_LOG_RETENTION_DAYS`:
- SOX: 2555 days (7 years)
- PCI-DSS: 365 days (1 year)
- Default: 2555 days
