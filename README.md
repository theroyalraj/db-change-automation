# DB Change Automation

Production-ready, fully automated Database Change Management system. Replaces manual Jira ticket creation with a PR-driven pipeline: developer commits a SQL changeset, and the system automatically handles Jira ticket creation, DBA approvals, multi-environment deployment, audit logging, notifications, and rollback.

## Architecture

```
Developer writes SQL → Git PR → GitHub Actions → Jira + Liquibase + Bytebase → DB
```

**Promotion chain:** preprod → UAT (optional) → prod (manual approval gate)

## Key Features

- **Automated Jira lifecycle** — tickets auto-created on PR, transitioned through review/approved/done/failed
- **Multi-environment promotion** — sequential deploy through preprod → UAT → prod with configurable gates
- **Separate DDL/DML flows** — different templates, directories, approval rules, and Jira ticket types
- **Scheduled execution** — defer changeset execution to a specific date/time via cron
- **WhatsApp + Email notifications** — real-time alerts for approvals, deployments, and failures
- **Compliance enforcement** — SOX, PCI-DSS, HIPAA, GDPR modes with audit logging
- **Adapter pattern** — swap MySQL for PostgreSQL, Jira for ServiceNow, GitHub for GitLab with minimal code changes
- **Auto-rollback** — automatic rollback on deployment failure

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd db-change-automation
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Jira, GitHub, DB, and notification credentials

# 3. Start local infrastructure (requires Docker)
cd bytebase
docker compose up -d
bash setup.sh

# 4. Run tests
npm test
```

## Project Structure

```
changelogs/         SQL changeset files (DDL in migrations/, DML in dml/)
scripts/            Core logic, pipeline handlers, utilities
adapters/           Pluggable adapters for ticketing, VCS, DB, notifications
pipeline/           GitHub Actions workflow YAML files
bytebase/           Docker setup for Bytebase + MySQL
tests/              Unit, integration, and e2e tests
docs/               Detailed guides
```

## Developer Workflow

1. Create a `.sql` file in `changelogs/migrations/` (DDL) or `changelogs/dml/` (DML) using the template
2. Commit to a feature branch and open a Pull Request
3. Automation validates the changeset, creates a Jira ticket, and requests DBA review
4. After approval and merge, the change deploys through preprod → UAT → prod

See [docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md) for the full guide.

## Documentation

| Guide | Description |
|-------|-------------|
| [SETUP.md](docs/SETUP.md) | Full installation and configuration |
| [DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md) | Day-to-day workflow for developers |
| [DML-GUIDE.md](docs/DML-GUIDE.md) | DML-specific changeset format and rules |
| [SCHEDULING-GUIDE.md](docs/SCHEDULING-GUIDE.md) | How to schedule changes for a specific time |
| [NOTIFICATION-SETUP.md](docs/NOTIFICATION-SETUP.md) | WhatsApp and Email notification setup |
| [AUDIT-GUIDE.md](docs/AUDIT-GUIDE.md) | Querying audit logs and compliance reports |
| [EXTENDING.md](docs/EXTENDING.md) | Adding PostgreSQL, GitLab, ServiceNow, etc. |
| [COMPLIANCE.md](docs/COMPLIANCE.md) | SOX, PCI-DSS, HIPAA, GDPR mapping |

## MySQL Version Support

| MySQL Version | Liquibase | Bytebase | Direct SQL | Change Tracking |
|:---:|:---:|:---:|:---:|:---|
| 5.5.x | No | No | Yes | `DB_CHANGE_TRACKER` table |
| 5.7.x | Yes | Yes | Yes | Liquibase `DATABASECHANGELOG` |
| 8.0.x | Yes | Yes | Yes | Liquibase `DATABASECHANGELOG` |

The adapter auto-detects the MySQL version via `SELECT VERSION()` and transparently switches between Liquibase CLI mode (>= 5.7) and direct SQL execution mode (< 5.7).

## Tech Stack

- **Node.js 20+** — automation scripts
- **Liquibase** — database migration execution (MySQL >= 5.7 only)
- **Bytebase** — DB review and approval UI (MySQL >= 5.7 only)
- **GitHub Actions** — CI/CD pipeline
- **Jira REST API** — ticket lifecycle
- **MySQL 5.5+ / 5.7+** — primary database (extensible to PostgreSQL, MSSQL, Oracle)
- **mysql2** — Node.js MySQL driver (supports all MySQL versions)
- **Twilio** — WhatsApp notifications
- **Nodemailer** — email notifications (SMTP/SendGrid)
- **Winston** — structured audit logging
- **Zod** — environment and API response validation
- **Jest** — test framework

## License

MIT
