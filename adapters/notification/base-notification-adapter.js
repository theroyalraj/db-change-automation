/**
 * Abstract base class for notification channel integrations.
 * All notification adapters (Email, WhatsApp, Slack, Teams, etc.) must extend
 * this class and implement every method.
 */
class BaseNotificationAdapter {
  constructor(config) {
    if (new.target === BaseNotificationAdapter) {
      throw new Error('BaseNotificationAdapter is abstract and cannot be instantiated directly');
    }
    this.config = config;
    this.channelName = 'unknown';
  }

  /**
   * Sends a generic notification.
   * @param {string[]} recipients - Array of recipient identifiers (emails, phone numbers, etc.)
   * @param {string} subject - Notification subject/title
   * @param {string} body - Notification body (may be HTML, markdown, or plain text depending on channel)
   * @param {'low'|'normal'|'high'|'critical'} priority
   * @returns {Promise<{ messageId: string, success: boolean }>}
   */
  async sendNotification(recipients, subject, body, priority = 'normal') {
    throw new Error('sendNotification() must be implemented by subclass');
  }

  /**
   * Sends a formatted change approval request notification.
   * @param {object} changeset - Parsed changeset object
   * @param {string[]} approvers - List of approver identifiers
   * @returns {Promise<{ messageId: string, success: boolean }>}
   */
  async sendChangeApprovalRequest(changeset, approvers) {
    throw new Error('sendChangeApprovalRequest() must be implemented by subclass');
  }

  /**
   * Sends a deployment result notification (success or failure per environment).
   * @param {object} changeset - Parsed changeset object
   * @param {string} environment - Environment name (preprod, uat, prod)
   * @param {{ success: boolean, duration: number, error?: string }} result
   * @returns {Promise<{ messageId: string, success: boolean }>}
   */
  async sendDeploymentResult(changeset, environment, result) {
    throw new Error('sendDeploymentResult() must be implemented by subclass');
  }

  /**
   * Sends a high-priority failure alert.
   * @param {object} changeset - Parsed changeset object
   * @param {Error|string} error - Error details
   * @param {string} environment - Environment where failure occurred
   * @returns {Promise<{ messageId: string, success: boolean }>}
   */
  async sendFailureAlert(changeset, error, environment) {
    throw new Error('sendFailureAlert() must be implemented by subclass');
  }

  /**
   * Checks the delivery status of a previously sent notification.
   * @param {string} messageId - Message identifier returned from send methods
   * @returns {Promise<{ delivered: boolean, status: string }>}
   */
  async getDeliveryStatus(messageId) {
    throw new Error('getDeliveryStatus() must be implemented by subclass');
  }
}

module.exports = BaseNotificationAdapter;
