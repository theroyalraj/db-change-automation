# Ticketing Adapters

## Adding a New Ticketing Integration

1. Create a new file (e.g., `servicenow-adapter.js`)
2. Extend `BaseTicketingAdapter`
3. Implement all methods: `createTicket`, `addComment`, `transitionTicket`, `getTicket`, `linkTickets`
4. Register the adapter in `scripts/core/jira-client.js` (or create a generic ticketing client)

See `jira-adapter.js` for a reference implementation.
