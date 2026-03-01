# Notification Adapters

## Adding a New Notification Channel

1. Create a new file (e.g., `slack-adapter.js`)
2. Extend `BaseNotificationAdapter`
3. Implement all methods: `sendNotification`, `sendChangeApprovalRequest`, `sendDeploymentResult`, `sendFailureAlert`, `getDeliveryStatus`
4. Register the channel name in `scripts/core/notification-dispatcher.js`

See `email-adapter.js` and `whatsapp-adapter.js` for reference implementations.
