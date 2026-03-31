# Database Change Automation

**For:** Stakeholders, IT Directors, Release Management, Security & Compliance  
**GitHub:** [github.com/theroyalraj/db-change-automation](https://github.com/theroyalraj/db-change-automation)  
**Date:** 2026-03-31 | **Status:** POC complete, ready for pilot

---

## 1. The problem we're solving

| Today (manual)                                                | Impact                                                      |
| ---------------------------------------------------------------| -------------------------------------------------------------|
| Developer asks DBA over Goole Chat JIRA/email for a DB change | No track what was executed and when trail, changes get lost |
| Someone manually creates a Jira ticket                        | Inconsistent details, missing fields, delays                |
| DBA runs SQL directly on production                           | No review, no rollback plan, audit gap                      |
| No standard path from pre-prod → UAT → production             | Changes skip environments, outages happen                   |
| Compliance evidence gathered manually at audit time           | Weeks of scramble, screenshot hunting                       |

**Bottom line:** Every manual database change is a risk event with no safety net.

---

## 2. Scope & philosophy

<!-- This system is a **governance layer, not a centralized approval bottleneck.** -->

| Principle                                               | What it means                                                                                                                                                                  |
| ---------------------------------------------------------| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Governance, not gatekeeping**                         | The system enforces standards (rollback, metadata, compliance) automatically — it doesn't add manual approval steps where they aren't needed                                   |
| **DDL on prod = DBA review**                            | Structural schema changes (ALTER, DROP, CREATE) go through DBA review and multi-env promotion. This is the high-risk path that needs human eyes.                               |
| **INSERT / UPDATE = auto-approve where possible** | Data changes (config updates, feature flags, seed data) can be auto-approved below a row threshold. DBAs don't own business logic — the team that owns the service does.       |
| **SELECT / query review = self-service via Bytebase**   | Read-only queries reviewed by SQL policies, also by DBA if neede.                                                                                                              |
| **Service teams own their DB**                          | Each service owns its database and its migration pipeline. No global approval queue for every change. The system provides the guardrails, teams drive.                         |
| **Prod gate only when confident**                       | The manual production approval gate is enabled during rollout. Once teams have confidence (tracked via observability), it can be relaxed to auto-promote for low-risk changes. |

**Sustainable when:** used as governance + observability layer, scoped to critical/cross-cutting changes, heavily automated.

**Not sustainable when:** centralized approval for every change, ignores microservice ownership, requires manual DBA sign-off on business-logic data changes.

---

## 3. What this solution does 

A developer writes a database change in a file, submits it for review — and **everything else is automatic**:

1. Developer opens an **MR** with a SQL file
2. The system **validates** the change and **creates a Jira ticket** — linked back to the MR
3. **DDL (schema changes):** DBA is notified and reviews. **DML (data changes):** auto-approved below row threshold — DBAs don't own business logic
4. On merge, the change **deploys through preprod → UAT → production**
5. If anything fails, it **rolls back automatically**
6. Every step is **audit-logged** — who, what, when, outcome



---
![Issue lifecycle](assets/stakeholder/issue-lifecycle.avif)
## 4. Before vs After

|                           | Before (manual)           | After (automated)                     |
| ---------------------------| ---------------------------| ---------------------------------------|
| **Jira ticket creation**  | Manual, 5–10 min/change   | Automatic, 0 min                      |
| **DBA notification**      | Slack/email, easy to miss | WhatsApp + email alert, tracked       |
| **Review & approval**     | Ad-hoc, no standard       | Formal approval gate with audit trail |
| **Pre-prod environment**  | Sometimes skipped         | Always runs before production         |
| **Production deployment** | DBA runs SQL manually     | Gated, requires explicit approval     |
| **Rollback on failure**   | Manual investigation      | Automatic rollback attempted on failure |
| **Compliance evidence**   | Collected at audit time   | Generated continuously                |
| **Lead time (MR → prod)** | Hours to days             | Target: under 1 hour (for DDL)        |

---

## 5. Business metrics & targets

| KPI | Current (baseline) | 6-month target | Measurement |
|-----|-------------------|----------------|-------------|
| Avg. lead time: request → production | ___ hours | 60% reduction | Jira timestamps |
| Manual steps per DB change | 6–8 | 0 | Process audit |
| Failed production deployments / month | ___ | 50% reduction | Incident reports |
| Changes with a tested rollback plan | ~___% | 100% | Automated validation |
| Time to produce compliance report | ___ days | < 5 minutes | Audit log query |
| Unplanned DB downtime / quarter | ___ hours | 50% reduction | Incident tracker |

> **Fill in baselines** from the last quarter's data. Track monthly.

---



## 6. Cost analysis

### 5.1 Tooling costs — community (free) tier

Everything we use today is on free / open-source tiers or existing licenses:

| Component | What we use | License | New cost |
|-----------|------------|---------|----------|
| **Liquibase** | Community (OSS) | Open-source | $0 |
| **Bytebase** | Community (free) | Open-source, self-hosted | $0 |
| **GitLab CI** | Existing plan | Included minutes | $0 incremental |
| **Jira** | Existing license | Current plan | $0 incremental |
| **WhatsApp alerts** | Existing integration | Already in place | $0 |
| **Email (SMTP)** | Existing infrastructure | Already in place | $0 |
| **Infrastructure** (CI runners) | Existing runners | Already in place | $0 |
| **Total new cost (community tier)** | | | **$0** |

### 5.2 Premium features — if/when we need them

| Component               | Free tier limit                             | Premium unlocks                                                                                                      | Premium cost                                                                                                                                                                                     |
| -------------------------| ---------------------------------------------| ----------------------------------------------------------------------------------------------------------------------| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Liquibase Pro**       | Basic migrations, rollback                  | Policy checks, drift detection, Change Intelligence, targeted rollback, secrets management                           | ~$500/DB target/year (10 targets = $5K/yr, 20 = $10K/yr) per [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-asxd5dbnayzu6). New "Liquibase Secure" plans require custom quote. |
| **Bytebase Pro**        | Standard SQL review, basic approval flow    | Advanced SQL review (100+ rules with DB metadata), multi-stage custom approval, SSO, audit log export, batch changes | **$20/user/month** (~$240/user/year). 10 DB instances included.                                                                                                                                  |
| **Bytebase Enterprise** | —                                           | Everything in Pro + RBAC, custom roles, environment tiers, DBA workflow, SLA support                                 | Custom quote (contact sales)                                                                                                                                                                     |
| **GitLab CI**           | Included minutes in current plan            | Extra minutes if we exceed quota                                                                                     | Linux: $0.005/min — unlikely to matter for our volume ([GitLab pricing](https://about.gitlab.com/pricing/))                                                                                      |
| **Jira Premium**        | Standard automation (1,700 runs/user/month) | Advanced cross-team planning, 1,000 automation runs/user/month, 99.9% SLA, sandbox environments                      | **$14.50/user/month** — but already on existing plan, no change needed                                                                                                                           |

**When would we need premium?**

| Trigger | What to upgrade | Est. cost impact |
|---------|----------------|-----------------|
| Need advanced SQL review rules that connect to DB metadata | Bytebase Pro | ~$240/user/year (e.g., 5 DBAs = ~$1,200/yr) |
| Need multi-level approval chains (Project Owner → DBA → CISO) | Bytebase Pro or Enterprise | Same as above |
| Need drift detection or targeted rollback | Liquibase Pro | Contact sales for quote |
| Exceed GitLab CI free minutes | GitLab paid minutes | Negligible for our pipeline volume |

> **Recommendation:** Start with community/free tiers for pilot and initial rollout. Evaluate premium after 3 months based on actual usage.

### 5.3 Cost of NOT automating (risk exposure)

| Risk event                               | Probability   | Est. cost per incident            |
| ------------------------------------------| ---------------| -----------------------------------|
| Unreviewed SQL causes production outage  | Medium        | $10K–100K (downtime + recovery)   |
| Compliance audit finding (missing trail) | High at audit | $25K–500K (fines + remediation)   |
| Failed deploy with no rollback plan      | Medium        | $5K–50K (DBA overtime + data fix) |
| Shadow changes (no ticket, no record)    | High          | Unquantifiable reputational risk  |

---

## 7. How it fits your current workflow

> **Key point:** The process starts with a **Merge Request in GitLab** — not a Jira ticket. The Jira ticket is created automatically by the pipeline. No one needs to touch Jira to initiate a database change.

### 6.1 GitLab — this is where it starts

| Step | Developer does                 | System does automatically                                                                                                                                                |
| :----:| --------------------------------| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1    | Adds a `.sql` file to the repo | —                                                                                                                                                                        |
| 2    | Opens a **Merge Request**      | Pipeline triggers instantly                                                                                                                                              |
| 3    | —                              | Validates SQL, checks compliance rules, verifies rollback block                                                                                                          |
| 4    | —                              | **Creates a Jira ticket** and links it to the MR                                                                                                                         |
| 5    | —                              | Requests reviewers + notifies DBA via WhatsApp + email                                                                                                                   |
| 6    | DBA approves the MR            | —                                                                                                                                                                        |
| 7    | Developer clicks **Merge**     | DDL: deploys preprod → UAT → production (with manual prod gate). DML: deploys to target environment (default: preprod). Changes can be scheduled for off-business hours. |
| 8    | —                              | If anything fails: auto-rollback + Jira marked "Failed" + alert                                                                                                          |

### 6.2 Jira — auto-managed, nothing to create manually

| What happens | Who sees it | How |
|-------------|-------------|-----|
| Ticket auto-created when MR is opened | PM, DBA, developer | Appears in your Jira board automatically |
| Ticket moves through statuses automatically | Everyone on the board | Created → In Review → Done (or Failed) |
| Failure? Ticket marked "Failed" with details | DBA + developer notified | WhatsApp + email alert |
| Full history on the ticket | Auditors, managers | Comments with deploy timestamps, environments, approver |

<!-- ![Jira lifecycle](assets/stakeholder/Jira%20ticket%20lifecycle.png) -->



<!-- ![Pipeline stages](assets/stakeholder/pipeline%20stages.png) -->

### 6.3 Change types — what the system handles

| Type | What it covers | Real-world examples | Jira ticket | Deploy chain |
|------|---------------|--------------------|----|------|
| **DDL** (structure) | Schema changes | `ALTER TABLE users ADD COLUMN phone VARCHAR(20)`, `CREATE INDEX`, `DROP TABLE` | Task | preprod → UAT → production (3 stages, manual prod gate) |
| **DML — INSERT** | New data | Seed config rows, add feature flags, populate lookup tables | Sub-task | Single target env (default: preprod) |
| **DML — UPDATE** | Modify data | Update config value, fix bad data, change feature flag state | Sub-task | Single target env (default: preprod) |
| **DML — DELETE** | Remove data | Clean up stale records, purge expired sessions | Sub-task | Single target env (default: preprod) |
| **SELECT (query review)** | Read-only queries for review | Ad-hoc data investigation, report queries, access requests | *Via Bytebase SQL Editor* | No deploy — review only |

**Key differences:**

| | DDL | DML (INSERT/UPDATE/DELETE) | SELECT (query review) |
|--|-----|--------------------------|----------------------|
| **Production access** | Allowed (with manual gate) | Blocked by default — must be explicitly enabled | Read-only via Bytebase SQL Editor |
| **Extra validations** | Rollback block required | Row estimate + target table required, backup optional | SQL Review rules apply (syntax, performance, security) |
| **Auto-rollback on failure** | Yes | Yes | N/A |
| **Who approves** | DBA via MR review | DBA via MR review | DBA or Project Owner via Bytebase |

**Bytebase SQL Review in action:**

![Bytebase plan with SQL review warnings](assets/stakeholder/bb-plan-draft-warning-detail.avif)

![Bytebase plan after warnings resolved](assets/stakeholder/bb-plan-draft-pass.avif)

![Bytebase review rule detail](assets/stakeholder/bb-plan-warning-detail.avif)

> **DML to production** must be explicitly enabled — this is a safety feature.
>
> **Scheduling:** Any change (DDL or DML) can be scheduled for off-business hours by setting `@schedule: 2026-04-05T02:00` in the SQL file header. The system checks a cron job every 15 minutes and executes within a 5-minute window of the scheduled time. No manual intervention needed — deploy happens automatically at the chosen time.
>
> **SELECT query review** is handled through Bytebase's SQL Editor, where queries are reviewed against SQL Review policies (syntax, performance, security rules) before execution. This is useful for ad-hoc data access requests, report queries, or any SELECT that touches sensitive tables.

### 6.4 GitLab integration status

The POC was built with a plug-in adapter pattern (`BaseVcsAdapter`). The POC used GitHub for initial development; the production rollout targets **GitLab** as the primary VCS. Remaining work:

| Item | Effort | Risk |
|------|--------|------|
| Implement `GitLabAdapter` (extends `BaseVcsAdapter`) | 2–3 days | Low — 6 methods to implement against GitLab API v4 |
| Create `.gitlab-ci.yml` pipeline definitions | 1–2 days | Low — same pipeline logic, GitLab CI YAML |
| Configure GitLab CI/CD variables (masked/protected) | 1 hour | Low |
| Enable merge request pipelines + protected environments | 30 minutes | None |

No changes to the database logic, Jira integration, or notification setup.

---

## 8. Compliance & audit readiness

| Regulation | What the system enforces today | Planned (not yet enforced) | Evidence generated |
|-----------|-------------------------------|---------------------------|-------------------|
| **SOX** | Separation of duties (author ≠ approver), mandatory approval before deploy, rollback script required, risk field required | — | Full audit log: who, what, when, approval chain |
| **PCI-DSS** | No direct production access (all changes go through pipeline), pre-prod runs before prod | Explicit staging gate check, encryption column flagging | Pipeline logs + per-environment credentials |
| **HIPAA** | Same audit trail as SOX | Extra approval for PHI tables (flag defined, enforcement pending) | Timestamped change + approver records |
| **GDPR** | Same audit trail as SOX | DPO notification for personal data columns (flag defined, enforcement pending) | Data change audit log |

> **Note:** SOX compliance rules are fully enforced in the validation pipeline. PCI-DSS, HIPAA, and GDPR flags are defined in the codebase but their specific enforcement logic (PHI table detection, DPO notification, encryption flagging) is scaffolded and will be completed during the pilot phase.

**Audit day:** Instead of gathering evidence for weeks, run one query → get a complete report of every database change, who approved it, when it deployed, and whether it succeeded or failed.

---

## 9. Observability (planned)

This is a missing piece today. Must be added during pilot:

| Metric | What it tracks | How |
|--------|---------------|-----|
| **Migration success/failure rate** | % of changesets that deploy without rollback | Pipeline logs + Jira ticket outcomes |
| **DB performance impact** | Query latency, lock wait time, slow queries before/after a migration | DB monitoring (existing APM / CloudWatch / Grafana) + post-deploy health check |
| **Rollback frequency** | How often auto-rollback fires, and for which services/tables | Audit log events (`ROLLBACK` entries) |
| **Lead time by change type** | Time from MR open → prod deploy, split by DDL vs DML | Jira timestamps + pipeline duration |
| **Change volume by service** | Which teams/services are pushing the most changes | Changeset metadata (`@author`, file path) |

> **Goal:** Use these metrics to build confidence. Once a service shows consistent green (low rollback rate, no performance regressions), relax the manual prod gate for that service's low-risk changes.

---

## 10. Risk register

| Risk                           | Likelihood | Impact   | Mitigation already in place                                                 |
| --------------------------------| ------------| ----------| -----------------------------------------------------------------------------|
| Bad SQL reaches production     | Low        | High     | 3 safety layers: automated validation → DBA review → test environment first |
| Deployment fails in production | Low        | High     | Automatic rollback triggered immediately (duration depends on change size)  |
| Credentials exposed            | Low        | Critical | Stored in CI secrets vault, never in code                                   |
| Team resistance to new process | Medium     | Medium   | Developers only add one file — rest is automated                            |
| Jira/GitLab API changes        | Low        | Low      | Integration tests catch breakage early                                      |

---

## 11. Implementation timeline

| Phase                            | Duration  | Deliverable                                          |
| ----------------------------------| -----------| ------------------------------------------------------|
| **POC** (done)                   | 4 weeks   | Working prototype with GitLab + Jira + MySQL         |
| **Pilot** (1 team)               | 3–4 weeks | 1 team, 1 project, real database changes in pre-prod |
| **Expand to 2–3 teams**          | 4–6 weeks | Onboard additional teams, refine workflows based on pilot feedback |
| **Production rollout**           | 4–8 weeks | All teams, all environments, compliance mode enabled |
| **GitLab adapter completion**    | 2–4 weeks | GitLab CI pipelines live, adapter fully implemented   |
| **Full-scale Lenskart rollout**  | 4–6 weeks | All databases, all regions, monitoring & SLA validation |

**Total time to value: 6–8 months from today** (pilot results visible in 6–8 weeks).

---

## 12. What we need from leadership

| # | Decision / action | Owner | By when |
|---|------------------|-------|---------|
| 1 | Approve pilot for 1 team | VP Engineering | Week 1 |
| 2 | Assign DBA resource for pilot (part-time) | DBA Manager | Week 1 |
| 3 | Provide Jira service account + API token | IT Admin | Week 1 |
| 4 | Designate pilot project & database | Tech Lead | Week 2 |
| 5 | Confirm GitLab project + CI runner access for pipeline | Platform team | Week 2 |
| 6 | Confirm WhatsApp integration access for pipeline alerts | IT Admin | Week 2 |
| 7 | Review compliance mode selection (SOX/PCI/HIPAA/GDPR) | Security team | Week 3 |

---

## 13. What it looks like — sample change walkthrough

Below is a real example from the repo: [PR #1 — Add phone column](https://github.com/theroyalraj/db-change-automation/pull/1).

---

### Step 1: Developer creates a SQL file

The developer creates one file in `changelogs/migrations/` and fills in the metadata header:

```sql
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

ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL;

-- rollback
ALTER TABLE users DROP COLUMN phone;
```

That's it. One file, ~25 lines. No Jira, no Slack, no manual steps.

> **Screenshot to capture:** the file in your IDE or GitLab editor → save as `docs/assets/stakeholder/05-sql-file-in-editor.png`

---

### Step 2: Developer opens a Merge Request

The MR description follows the template — the developer fills in changeset ID, type, risk, rollback:

> **Title:** Add phone column to users table  
> **Branch:** `feature/test-add-phone-column` → `master`
>
> **DB Change Request**
> - Changeset: `20260301-001-add-phone-column`
> - Type: DDL
> - Risk: Low
> - Author: theroyalraj
>
> Adding phone VARCHAR(20) column to users table for SMS verification support.
>
> **Rollback:** Auto rollback: `ALTER TABLE users DROP COLUMN phone;`

Live example: [github.com/theroyalraj/db-change-automation/pull/1](https://github.com/theroyalraj/db-change-automation/pull/1)

> **Screenshot to capture:** the MR page showing title, description, and diff → save as `docs/assets/stakeholder/06-merge-request.png`

---

### Step 3: Pipeline runs automatically — bot comments on MR

Once the MR is opened, the pipeline validates the change and posts a summary comment:

> ### DB Change Ticket Created
>
> | Field | Value |
> | --- | --- |
> | Jira Ticket | [PROJ-101](https://your-jira.atlassian.net/browse/PROJ-101) |
> | Changeset | `20260301-001-add-phone-column` |
> | Author | theroyalraj |
> | Type | DDL |
> | Risk | LOW |
> | Environment | prod |
> | Schedule | immediate |
> | Compliance | none |
>
> **Status:** Awaiting DBA approval before deployment.

This is posted automatically by the system — no human action.

> **Screenshot to capture:** the bot comment on the MR → save as `docs/assets/stakeholder/07-bot-comment-on-mr.png`

---

### Step 4: Jira ticket appears on the board

The system creates a Jira issue with all the details:

> **Summary:** `[DB-DDL] 20260301-001-add-phone-column: Add phone number column to users table`  
> **Type:** Task  
> **Priority:** Low  
> **Labels:** `db-change`, `automated`, `awaiting-dba-approval`
>
> | Field | Value |
> | --- | --- |
> | Changeset ID | 20260301-001-add-phone-column |
> | Author | theroyalraj |
> | Type | DDL |
> | Risk Level | Low |
> | Environment | prod |
> | PR Link | [View PR](https://github.com/theroyalraj/db-change-automation/pull/1) |
> | Rollback | auto |
> | Compliance | none |
> | Schedule | immediate |

The ticket is linked to the original `PROJ-456` epic automatically.

> **Screenshot to capture:** the Jira ticket → save as `docs/assets/stakeholder/08-jira-ticket.png`

---

### Step 5: DBA approves → developer merges → auto-deploy

After DBA approves the MR:
1. Developer clicks **Merge**
2. Deploy pipeline runs: **preprod** (auto) → **UAT** (auto) → **production** (manual approval gate)
3. Jira ticket transitions to **Done** with a deployment comment:

> **[DEPLOYED]**  
> Environment: prod  
> Timestamp: 2026-03-01T13:15:42Z  
> Applied by: system  
> Duration: 1,230ms  
> Changeset Hash: a1b2c3d4e5f6...

If it fails at any stage, the system rolls back and posts:

> **[FAILED]**  
> Environment: uat  
> Error: Column 'phone' already exists  
> Rollback Attempted: Yes  
> Rollback Result: Success  
> Next steps: Investigate the error and re-submit the changeset.

> **Screenshots to capture:**  
> - Pipeline running (green/red) → save as `docs/assets/stakeholder/09-pipeline-run.png`  
> - Prod approval gate → save as `docs/assets/stakeholder/10-prod-gate.png`  
> - Jira ticket showing DEPLOYED comment → save as `docs/assets/stakeholder/11-jira-deployed.png`

---

### For DML changes — what's different

A DML change (e.g., seeding config data) looks similar but has extra fields:

```sql
-- @type:            dml
-- @operation:       insert
-- @target_table:    config_settings
-- @estimated_rows:  3
-- @requires_backup: false
```

The bot comment on the MR includes row estimate and backup status, and the Jira ticket is created as a **Sub-task** instead of a Task.

---

## 14. UI screenshots — links to capture

Visit each link below, take a screenshot, and save to `docs/assets/stakeholder/`:

**Our repo (live):**

| # | What to screenshot | Link | Save as |
|---|-------------------|------|---------|
| 1 | MR #1 — title, description, diff | [github.com/theroyalraj/db-change-automation/pull/1](https://github.com/theroyalraj/db-change-automation/pull/1) | `12-mr-overview.png` |
| 2 | MR #1 — Files changed tab (SQL diff) | [PR #1 → Files changed](https://github.com/theroyalraj/db-change-automation/pull/1/files) | `13-mr-diff.png` |
| 3 | GitLab CI — pipeline list | Your GitLab project → CI/CD → Pipelines | `14-pipeline-list.png` |

**Bytebase UI (visit these pages, screenshot the UI shown):**

| # | What it shows | Link | Save as |
|---|--------------|------|---------|
| 4 | Plan creation — SQL + auto review with warnings | [SQL Review GUI tutorial](https://docs.bytebase.com/tutorials/sql-review-gui) — follow steps 3-4, screenshot the plan with orange warnings | `15-bytebase-plan-review.png` |
| 5 | Approval flow config — multi-stage approver chain | [Custom Approval docs](https://docs.bytebase.com/change-database/approval) — screenshot the approval flow editor | `16-bytebase-approval-flow.png` |
| 6 | Rollout pipeline — stage-by-stage deploy (Test → Prod) | [First Schema Change tutorial](https://docs.bytebase.com/tutorials/first-schema-change) — follow to step 5, screenshot the rollout section | `17-bytebase-rollout.png` |
| 7 | SQL Editor — query review (SELECT) | [Bytebase SQL Editor docs](https://docs.bytebase.com/sql-editor/run-queries) — screenshot the editor with query results | `18-bytebase-sql-editor.png` |
| 8 | SQL Review rules — configuration panel | [SQL Review overview](https://docs.bytebase.com/sql-review/overview) — screenshot the rules list | `19-bytebase-review-rules.png` |

**GitLab environment gates:**

| # | What it shows | Link | Save as |
|---|--------------|------|---------|
| 9 | Manual job approval for prod deploy | [GitLab docs — Protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html) — screenshot the approval dialog or your project's Settings → CI/CD → Protected environments | `20-gitlab-deploy-gate.png` |
| 10 | Environment protection rules config | Your GitLab project → Settings → CI/CD → Protected environments — screenshot the required approvers section | `21-gitlab-env-config.png` |

**Jira (from your own instance after running the pipeline):**

| # | What it shows | Save as |
|---|--------------|---------|
| 11 | Auto-created ticket on Jira board | `22-jira-board.png` |
| 12 | Ticket detail — summary, labels, description table | `23-jira-ticket-detail.png` |
| 13 | Ticket history — status transitions + deploy comments | `24-jira-ticket-history.png` |

---

## 15. Screenshots & evidence

| Figure                                                                          | Description                     |
| ---------------------------------------------------------------------------------| ---------------------------------|
| ![Architecture overview](assets/stakeholder/End-to-end%20system%20overview.png) | End-to-end system flow          |
| ![Jira lifecycle](assets/stakeholder/Jira%20ticket%20lifecycle.png)             | Automated Jira ticket states    |
| ![Pipeline stages](assets/stakeholder/pipeline%20stages.png) | DDL vs DML deployment pipelines |

> Add screenshots from section 12 above as you capture them.

---

## 16. References

| Resource | Link |
|----------|------|
| Source code | [github.com/theroyalraj/db-change-automation](https://github.com/theroyalraj/db-change-automation) |
| Bytebase (review tool) | [bytebase.com](https://www.bytebase.com/) |
| Liquibase (migration engine) | [liquibase.com](https://www.liquibase.com/) |
| GitLab CI/CD docs | [docs.gitlab.com/ee/ci](https://docs.gitlab.com/ee/ci/) |
| Jira REST API | [developer.atlassian.com](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) |

---

*Prepared by the Engineering team. For technical deep-dives, see the [Developer Guide](DEVELOPER-GUIDE.md) and [Setup Guide](SETUP.md).*
