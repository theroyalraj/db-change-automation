const nodemailer = require('nodemailer');
const BaseNotificationAdapter = require('./base-notification-adapter');
const { withRetry } = require('../../scripts/utils/retry');

/**
 * Email notification adapter using Nodemailer.
 * Supports SMTP and SendGrid transports.
 */
class EmailAdapter extends BaseNotificationAdapter {
  constructor(config) {
    super(config);
    this.channelName = 'email';
    this.from = config.EMAIL_FROM;
    this.dbaRecipients = (config.EMAIL_DBA_RECIPIENTS || '').split(',').map((e) => e.trim()).filter(Boolean);
    this.complianceMode = config.COMPLIANCE_MODE || 'NONE';

    this.transporter = nodemailer.createTransport({
      host: config.EMAIL_SMTP_HOST,
      port: parseInt(config.EMAIL_SMTP_PORT, 10),
      secure: config.EMAIL_SMTP_SECURE === 'true',
      auth: {
        user: config.EMAIL_USERNAME,
        pass: config.EMAIL_PASSWORD,
      },
    });
  }

  async sendNotification(recipients, subject, body, priority = 'normal') {
    const priorityMap = { low: '5', normal: '3', high: '2', critical: '1' };
    const mailOptions = {
      from: this.from,
      to: recipients.join(', '),
      subject,
      html: this._wrapHtml(body),
      priority: priority === 'critical' ? 'high' : priority,
      headers: { 'X-Priority': priorityMap[priority] || '3' },
    };

    if (this.complianceMode === 'SOX') {
      mailOptions.cc = this.config.EMAIL_AUDIT_CC || '';
    }

    const result = await withRetry(
      () => this.transporter.sendMail(mailOptions),
      { maxAttempts: 3, baseDelayMs: 2000 }
    );

    return { messageId: result.messageId, success: true };
  }

  async sendChangeApprovalRequest(changeset, approvers) {
    const subject = `[DB Change Approval Required] ${changeset.id} — ${changeset.risk.toUpperCase()} risk`;
    const body = `
      <h2>Database Change Approval Request</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Changeset ID</strong></td><td>${changeset.id}</td></tr>
        <tr><td><strong>Author</strong></td><td>${changeset.author}</td></tr>
        <tr><td><strong>Type</strong></td><td>${changeset.type.toUpperCase()}</td></tr>
        <tr><td><strong>Description</strong></td><td>${changeset.description}</td></tr>
        <tr><td><strong>Risk</strong></td><td>${changeset.risk}</td></tr>
        <tr><td><strong>Environment</strong></td><td>${changeset.environment}</td></tr>
        <tr><td><strong>Compliance</strong></td><td>${changeset.compliance.join(', ')}</td></tr>
        <tr><td><strong>Schedule</strong></td><td>${changeset.schedule}</td></tr>
      </table>
      <p>Please review and approve via the Jira ticket or GitHub PR.</p>`;

    return this.sendNotification(
      approvers.length ? approvers : this.dbaRecipients,
      subject,
      body,
      changeset.risk === 'high' ? 'high' : 'normal'
    );
  }

  async sendDeploymentResult(changeset, environment, result) {
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const subject = `[DB Deploy ${status}] ${changeset.id} → ${environment}`;
    const body = `
      <h2>Deployment ${status}</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Changeset</strong></td><td>${changeset.id}</td></tr>
        <tr><td><strong>Environment</strong></td><td>${environment}</td></tr>
        <tr><td><strong>Status</strong></td><td>${status}</td></tr>
        <tr><td><strong>Duration</strong></td><td>${result.duration}ms</td></tr>
        ${result.error ? `<tr><td><strong>Error</strong></td><td>${this._escapeHtml(result.error)}</td></tr>` : ''}
      </table>`;

    return this.sendNotification(
      this.dbaRecipients,
      subject,
      body,
      result.success ? 'normal' : 'high'
    );
  }

  async sendFailureAlert(changeset, error, environment) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const subject = `[CRITICAL] DB Deploy FAILED — ${changeset.id} on ${environment}`;
    const body = `
      <h2 style="color:red;">Database Deployment Failed</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Changeset</strong></td><td>${changeset.id}</td></tr>
        <tr><td><strong>Environment</strong></td><td>${environment}</td></tr>
        <tr><td><strong>Error</strong></td><td><pre>${this._escapeHtml(errorMsg)}</pre></td></tr>
      </table>
      <p><strong>Immediate action required.</strong> Check the Jira ticket and pipeline logs.</p>`;

    return this.sendNotification(this.dbaRecipients, subject, body, 'critical');
  }

  async getDeliveryStatus(messageId) {
    return { delivered: true, status: 'sent' };
  }

  _wrapHtml(body) {
    return `<div style="font-family:Arial,sans-serif;max-width:600px;">${body}</div>`;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = EmailAdapter;
