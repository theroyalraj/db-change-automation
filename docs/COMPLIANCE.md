# Compliance Guide

## Overview

The system enforces compliance rules based on the `COMPLIANCE_MODE` environment variable. Each mode adds extra validation and audit requirements.

## Compliance Mode Mapping

### SOX (Sarbanes-Oxley)

| Requirement | System Feature |
|-------------|---------------|
| Change authorization | DBA approval required via Jira + GitHub PR review |
| Separation of duties | Author cannot be their own approver (`ENFORCE_SEPARATION_OF_DUTIES=true`) |
| 4-eyes principle | For HIGH risk: 2+ approvers required |
| Audit trail | Every action logged with actor, timestamp, changeset hash |
| Rollback capability | Rollback block required for all changesets (`REQUIRE_ROLLBACK_SCRIPT=true`) |
| Data retention | Audit logs retained 7 years (`AUDIT_LOG_RETENTION_DAYS=2555`) |
| Risk assessment | `@risk` field mandatory |
| Change documentation | Full changeset metadata in Jira ticket |

### PCI-DSS (Payment Card Industry)

| Requirement | System Feature |
|-------------|---------------|
| No direct prod access | All changes go through CI/CD pipeline, no manual execution |
| Testing in non-prod first | Multi-env promotion: preprod → UAT → prod |
| Change approval | DBA approval enforced before deployment |
| Access logging | All API calls and DB changes logged with timestamps |
| Encryption awareness | Changes involving encryption columns flagged for security review |
| Network segmentation | Per-environment DB credentials, no credential sharing |

### HIPAA (Health Insurance Portability)

| Requirement | System Feature |
|-------------|---------------|
| PHI data protection | Changes to PHI-containing tables require extra approval |
| Access audit | Complete audit trail: who changed what, when, why |
| Minimum necessary | Changes scoped to specific tables via `@target_table` |
| Authorization | Multi-level approval workflow |
| Integrity controls | SQL hash (MD5) logged for tamper detection |

### GDPR (General Data Protection Regulation)

| Requirement | System Feature |
|-------------|---------------|
| DPO notification | Changes affecting personal data columns trigger DPO notification via Jira comment |
| Data processing records | Full audit log of all data changes |
| Right to erasure | DELETE DML changesets tracked and auditable |
| Data minimization | DML changes require `@target_table` and `@estimated_rows` |
| Consent tracking | Changes to consent-related tables flagged |

## Enabling Compliance Mode

```env
COMPLIANCE_MODE=SOX
ENFORCE_SEPARATION_OF_DUTIES=true
REQUIRE_ROLLBACK_SCRIPT=true
AUDIT_LOG_RETENTION_DAYS=2555
```

## Multiple Compliance Standards

If your organization requires compliance with multiple standards, use the most restrictive settings from all applicable standards. SOX is typically the most restrictive.

## Compliance Labels in Jira

Each changeset's `@compliance` field is added as a Jira label (e.g., `compliance-sox`). Use JQL to filter:

```
project = DBCHANGE AND labels = "compliance-sox"
```
