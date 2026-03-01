const EmailAdapter = require('../../adapters/notification/email-adapter');
const WhatsAppAdapter = require('../../adapters/notification/whatsapp-adapter');

/**
 * Dispatches notifications to all configured channels in parallel.
 * Graceful degradation — if one channel fails, others still send.
 */
class NotificationDispatcher {
  /**
   * @param {Record<string, string>} config - Environment variables
   */
  constructor(config) {
    this.adapters = [];
    const channels = (config.NOTIFICATION_CHANNELS || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    for (const channel of channels) {
      try {
        if (channel === 'email') {
          this.adapters.push(new EmailAdapter(config));
        } else if (channel === 'whatsapp') {
          this.adapters.push(new WhatsAppAdapter(config));
        } else {
          console.warn(`[NotificationDispatcher] Unknown channel: "${channel}"`);
        }
      } catch (err) {
        console.error(`[NotificationDispatcher] Failed to initialize ${channel}: ${err.message}`);
      }
    }
  }

  /**
   * Dispatches a notification event to all configured channels.
   * @param {'approval_needed'|'deployed'|'failed'|'rollback'|'scheduled'} event
   * @param {object} data - Event-specific data
   * @returns {Promise<Array<{ channel: string, success: boolean, messageId?: string, error?: string }>>}
   */
  async notifyAll(event, data) {
    if (this.adapters.length === 0) return [];

    const results = await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        try {
          let result;
          switch (event) {
            case 'approval_needed':
              result = await adapter.sendChangeApprovalRequest(data.changeset, data.approvers || []);
              break;
            case 'deployed':
              result = await adapter.sendDeploymentResult(data.changeset, data.environment, data.result);
              break;
            case 'failed':
              result = await adapter.sendFailureAlert(data.changeset, data.error, data.environment);
              break;
            default:
              result = await adapter.sendNotification(
                data.recipients || [],
                data.subject || `DB Change: ${event}`,
                data.body || '',
                data.priority || 'normal'
              );
          }
          return { channel: adapter.channelName, ...result };
        } catch (err) {
          return { channel: adapter.channelName, success: false, error: err.message };
        }
      })
    );

    return results.map((r) =>
      r.status === 'fulfilled' ? r.value : { channel: 'unknown', success: false, error: r.reason?.message }
    );
  }

  get channelCount() {
    return this.adapters.length;
  }
}

module.exports = NotificationDispatcher;
