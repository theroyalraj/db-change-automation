const BaseNotificationAdapter = require('./base-notification-adapter');
const { withRetry } = require('../../scripts/utils/retry');

/**
 * WhatsApp notification adapter using Twilio.
 * Sends concise messages within WhatsApp's 1600 char limit.
 * Only sends for event types listed in WHATSAPP_NOTIFY_ON.
 */
class WhatsAppAdapter extends BaseNotificationAdapter {
  constructor(config) {
    super(config);
    this.channelName = 'whatsapp';
    this.from = config.TWILIO_WHATSAPP_FROM;
    this.dbaNumbers = (config.WHATSAPP_DBA_NUMBERS || '').split(',').map((n) => n.trim()).filter(Boolean);
    this.notifyOn = (config.WHATSAPP_NOTIFY_ON || 'failure,prod_deploy').split(',').map((e) => e.trim());

    const twilio = require('twilio');
    this.twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }

  /**
   * Checks if the given event type should trigger a WhatsApp notification.
   * @param {string} eventType
   * @returns {boolean}
   */
  _shouldNotify(eventType) {
    return this.notifyOn.includes('all') || this.notifyOn.includes(eventType);
  }

  async sendNotification(recipients, subject, body, priority = 'normal') {
    const targets = recipients.length ? recipients : this.dbaNumbers;
    const truncatedBody = body.length > 1500 ? body.substring(0, 1500) + '...' : body;
    const message = `*${subject}*\n\n${truncatedBody}`;

    const results = await Promise.allSettled(
      targets.map((to) =>
        withRetry(
          () =>
            this.twilioClient.messages.create({
              from: this.from,
              to,
              body: message,
            }),
          { maxAttempts: 2, baseDelayMs: 2000 }
        )
      )
    );

    const firstSuccess = results.find((r) => r.status === 'fulfilled');
    return {
      messageId: firstSuccess?.value?.sid || 'batch-send',
      success: results.some((r) => r.status === 'fulfilled'),
    };
  }

  async sendChangeApprovalRequest(changeset, approvers) {
    if (!this._shouldNotify('approval_needed')) {
      return { messageId: 'skipped', success: true };
    }

    const subject = `DB Change Approval Needed`;
    const body = [
      `Changeset: ${changeset.id}`,
      `Author: ${changeset.author}`,
      `Risk: ${changeset.risk.toUpperCase()}`,
      `Env: ${changeset.environment}`,
      `Type: ${changeset.type.toUpperCase()}`,
      `Description: ${changeset.description}`,
      ``,
      `Please approve via Jira or GitHub PR.`,
    ].join('\n');

    return this.sendNotification([], subject, body, changeset.risk === 'high' ? 'high' : 'normal');
  }

  async sendDeploymentResult(changeset, environment, result) {
    const eventType = environment === 'prod' ? 'prod_deploy' : 'deploy';
    if (!this._shouldNotify(eventType) && !this._shouldNotify('prod_deploy')) {
      return { messageId: 'skipped', success: true };
    }

    const status = result.success ? 'SUCCESS' : 'FAILED';
    const subject = `DB Deploy ${status}: ${environment}`;
    const body = [
      `Changeset: ${changeset.id}`,
      `Environment: ${environment}`,
      `Status: ${status}`,
      `Duration: ${result.duration}ms`,
      result.error ? `Error: ${result.error}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.sendNotification([], subject, body, result.success ? 'normal' : 'critical');
  }

  async sendFailureAlert(changeset, error, environment) {
    if (!this._shouldNotify('failure')) {
      return { messageId: 'skipped', success: true };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    const subject = `CRITICAL: DB Deploy FAILED`;
    const body = [
      `Changeset: ${changeset.id}`,
      `Environment: ${environment}`,
      `Error: ${errorMsg.substring(0, 500)}`,
      ``,
      `Immediate action required.`,
    ].join('\n');

    return this.sendNotification([], subject, body, 'critical');
  }

  async getDeliveryStatus(messageId) {
    if (messageId === 'skipped' || messageId === 'batch-send') {
      return { delivered: true, status: messageId };
    }

    try {
      const msg = await this.twilioClient.messages(messageId).fetch();
      return {
        delivered: ['delivered', 'read'].includes(msg.status),
        status: msg.status,
      };
    } catch {
      return { delivered: false, status: 'unknown' };
    }
  }
}

module.exports = WhatsAppAdapter;
