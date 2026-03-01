# Extending the System

The adapter pattern makes it straightforward to add support for new databases, VCS providers, ticketing systems, and notification channels.

## Adding PostgreSQL Support

1. Create `adapters/database/postgres-adapter.js`:

```javascript
const BaseDbAdapter = require('./base-db-adapter');

class PostgresAdapter extends BaseDbAdapter {
  constructor(config) {
    super(config);
    // Use 'pg' npm package
    const { Pool } = require('pg');
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });
  }

  async testConnection() { /* ... */ }
  async getChangelogTable() { /* ... */ }
  // ... implement all BaseDbAdapter methods
}

module.exports = PostgresAdapter;
```

2. Register in `scripts/core/db-client.js`:

```javascript
const PostgresAdapter = require('../../adapters/database/postgres-adapter');
ADAPTER_REGISTRY['postgresql'] = PostgresAdapter;
```

3. Set `DB_TYPE=postgresql` in your `.env`.

## Adding GitLab Support

1. Create `adapters/vcs/gitlab-adapter.js` extending `BaseVcsAdapter`
2. Use the GitLab API (`https://gitlab.com/api/v4/`)
3. Map methods: `getPRDetails` → MR details, `addPRComment` → MR notes, etc.
4. Update pipeline scripts to select the adapter based on a `VCS_TYPE` env var

## Adding ServiceNow Ticketing

1. Create `adapters/ticketing/servicenow-adapter.js` extending `BaseTicketingAdapter`
2. Use the ServiceNow Table API to create/update incident or change records
3. Map status transitions to ServiceNow states
4. Update `scripts/core/jira-client.js` to be a generic ticketing client that selects the adapter

## Adding Azure DevOps

1. Create `adapters/vcs/azure-devops-adapter.js` for PR operations
2. Create `adapters/ticketing/azure-boards-adapter.js` for work item management
3. Use the Azure DevOps REST API

## Adding a New Notification Channel

1. Create `adapters/notification/slack-adapter.js` extending `BaseNotificationAdapter`
2. Register the channel name in `scripts/core/notification-dispatcher.js`:

```javascript
if (channel === 'slack') {
  this.adapters.push(new SlackAdapter(config));
}
```

3. Add `slack` to `NOTIFICATION_CHANNELS` in `.env`.

## MySQL Version Fallback (Direct SQL Mode)

When connecting to MySQL < 5.7, the `MySQLAdapter` automatically:
- Detects the server version via `SELECT VERSION()`
- Bypasses Liquibase CLI (which requires MySQL >= 5.7)
- Executes SQL directly via the `mysql2` driver
- Tracks applied changes in a `DB_CHANGE_TRACKER` table
- Stores rollback SQL for each change, enabling direct rollback

This is transparent to the rest of the pipeline. The `runLiquibaseUpdate` and `runLiquibaseRollback` methods accept an optional `changeset` parameter that enables this fallback.

If you're adding a new database adapter for a DB that has similar version constraints, follow the same pattern: detect the version, provide a direct execution fallback, and use a custom tracker table.

## General Steps

1. Extend the appropriate base class
2. Implement all abstract methods
3. Register in the factory/dispatcher
4. Add configuration to `.env.example`
5. Write unit tests with mocked API calls
6. Update documentation
