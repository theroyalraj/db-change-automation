# Scheduling Guide

## Overview

Database changes can be scheduled for execution at a specific date and time instead of immediate deployment on PR merge.

## How to Schedule a Change

Set the `@schedule` metadata field to an ISO8601 datetime:

```sql
-- @schedule: 2026-03-15T02:00
```

The time is interpreted in the timezone specified by `SCHEDULE_TIMEZONE` (default: `UTC`).

## How It Works

1. When a PR with `@schedule` set to a future time is opened, the Jira ticket is created but execution is deferred
2. On PR merge, the pipeline creates a `workflow_dispatch` event with the scheduled time
3. A GitHub Actions cron job runs every 15 minutes (`db-change-scheduled.yml`)
4. When the current time is within a 5-minute window of the scheduled time, the changeset is executed
5. Notifications are sent on completion or failure

## Configuration

```env
SCHEDULING_ENABLED=true
SCHEDULE_TIMEZONE=Asia/Kolkata
```

## Manual Trigger

You can also manually trigger a scheduled execution from GitHub Actions:

1. Go to Actions → "DB Change — Scheduled Execution"
2. Click "Run workflow"
3. Fill in: changeset path, target environment, your username
4. Click "Run workflow"

## Timezone Handling

All schedule times should be specified in the timezone set by `SCHEDULE_TIMEZONE`. Common values:

- `UTC` — default
- `Asia/Kolkata` — IST
- `America/New_York` — Eastern
- `Europe/London` — GMT/BST

## Best Practices

- Schedule changes during maintenance windows (low-traffic periods)
- Use for large schema changes that need a specific execution time
- Always test the same change in preprod first before scheduling for prod
- Monitor the scheduled execution via Jira ticket and notification channels
