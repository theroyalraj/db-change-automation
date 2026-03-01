# Setup Guide

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org/)
- **Docker Desktop** — [download](https://docs.docker.com/desktop/install/)
- **Liquibase CLI** — [download](https://www.liquibase.com/download) or `winget install Liquibase.Liquibase`
  - Required only for environments running MySQL **5.7+**
  - Not used for MySQL < 5.7 (direct SQL execution via mysql2 driver)
- **Jira Cloud account** with API token
- **GitHub repository** with Actions enabled

## MySQL Version Compatibility

| Component | MySQL 5.5.x | MySQL 5.7.x | MySQL 8.0.x |
|-----------|:-----------:|:-----------:|:-----------:|
| mysql2 npm driver | Yes | Yes | Yes |
| Liquibase 4.x/5.x | **No** | Yes | Yes |
| Bytebase | **No** | Yes | Yes |
| Direct SQL mode | Yes | Yes | Yes |

**Important:** If your environment runs MySQL < 5.7, the adapter automatically bypasses Liquibase and executes SQL directly via the `mysql2` driver. Changes are tracked in a `DB_CHANGE_TRACKER` table instead of Liquibase's `DATABASECHANGELOG`.

## Installation

```bash
git clone <repo-url>
cd db-change-automation
npm install
```

## Configuration

### 1. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your actual values. Required sections:

**Jira:**
- `JIRA_BASE_URL` — your Jira instance URL (e.g., `https://company.atlassian.net`)
- `JIRA_EMAIL` — service account email
- `JIRA_API_TOKEN` — [generate one here](https://id.atlassian.com/manage-profile/security/api-tokens)
- `JIRA_PROJECT_KEY` — project where DB change tickets are created
- `JIRA_DONE_TRANSITION_ID`, `JIRA_IN_REVIEW_TRANSITION_ID`, `JIRA_FAILED_TRANSITION_ID` — get these from Jira's workflow transition API

**GitHub:**
- `GITHUB_TOKEN` — personal access token with `repo` scope
- `GITHUB_REPO` — format: `org/repo-name`

**Database (per environment):**
- `PREPROD_DB_HOST`, `UAT_DB_HOST`, `PROD_DB_HOST` etc.
- Each environment gets its own `{ENV}_DB_*` prefix
- `{ENV}_DB_MYSQL_VERSION` — optional hint (e.g., `5.5` or `5.7`). The adapter also auto-detects via `SELECT VERSION()`

**Notifications:**
- See [NOTIFICATION-SETUP.md](NOTIFICATION-SETUP.md)

### 2. GitHub Secrets

Add these secrets to your repository Settings → Secrets:

All `JIRA_*`, `DB_*`, `PREPROD_DB_*`, `UAT_DB_*`, `PROD_DB_*`, `BYTEBASE_*` variables.

### 3. GitHub Environments

Create these environments in Settings → Environments:
- `preprod` — no protection rules (auto-deploy)
- `uat` — no protection rules (auto-deploy after preprod)
- `prod` — add required reviewers (DBA team) for manual approval gate

### 4. Local Bytebase (for testing)

```bash
cd bytebase
docker compose up -d
bash setup.sh
```

This starts Bytebase on port 8080, MySQL 5.7.28 (prod-sim) on 3307, MySQL 5.5 (preprod-sim) on 3309.

> **Note:** Bytebase can only manage the MySQL 5.7 instance. The MySQL 5.5 preprod container is for testing the direct SQL execution fallback path.

### 5. Validate Configuration

```bash
npm run validate:env
```

This validates all required environment variables are present and correctly formatted.

## Finding Jira Transition IDs

```bash
curl -u "email:token" "https://company.atlassian.net/rest/api/2/issue/PROJ-1/transitions"
```

Look for the `id` field in the response for each transition (To Do → In Review, In Review → Done, etc.).

## Running Tests

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests (some require Docker)
npm run test:e2e      # End-to-end tests
```
