# Database Adapters

## Adding a New Database Integration

1. Create a new file (e.g., `postgres-adapter.js`)
2. Extend `BaseDbAdapter`
3. Implement all methods: `testConnection`, `getChangelogTable`, `getAppliedChangesets`, `runLiquibaseUpdate`, `runLiquibaseRollback`, `runLiquibaseValidate`, `runDMLWithBackup`, `close`
4. Update `scripts/core/db-client.js` to register the new adapter under its `DB_TYPE`

See `mysql-adapter.js` for a reference implementation.
