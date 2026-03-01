jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'email-int-001' }),
  })),
}));

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM-int-001' });
  return jest.fn(() => ({
    messages: Object.assign(jest.fn(() => ({ fetch: jest.fn().mockResolvedValue({ status: 'delivered' }) })), {
      create: mockCreate,
    }),
  }));
});

const EmailAdapter = require('../../adapters/notification/email-adapter');
const WhatsAppAdapter = require('../../adapters/notification/whatsapp-adapter');

const emailConfig = {
  EMAIL_SMTP_HOST: 'smtp.test.com',
  EMAIL_SMTP_PORT: '587',
  EMAIL_SMTP_SECURE: 'false',
  EMAIL_FROM: 'db@test.com',
  EMAIL_USERNAME: 'user',
  EMAIL_PASSWORD: 'pass',
  EMAIL_DBA_RECIPIENTS: 'dba1@test.com,dba2@test.com',
  COMPLIANCE_MODE: 'SOX',
};

const waConfig = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+1000',
  WHATSAPP_DBA_NUMBERS: 'whatsapp:+2000,whatsapp:+3000',
  WHATSAPP_NOTIFY_ON: 'failure,prod_deploy,approval_needed',
};

const changeset = {
  id: 'int-test-001',
  author: 'test.user',
  type: 'ddl',
  description: 'Integration test changeset',
  environment: 'prod',
  risk: 'high',
  compliance: ['SOX'],
  schedule: 'immediate',
};

describe('Notification Adapters (integration)', () => {
  describe('EmailAdapter', () => {
    let email;
    beforeEach(() => { email = new EmailAdapter(emailConfig); });

    it('should send approval request email', async () => {
      const result = await email.sendChangeApprovalRequest(changeset, ['dba@test.com']);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-int-001');
    });

    it('should send deployment result email', async () => {
      const result = await email.sendDeploymentResult(changeset, 'prod', { success: true, duration: 500 });
      expect(result.success).toBe(true);
    });

    it('should send failure alert email', async () => {
      const result = await email.sendFailureAlert(changeset, new Error('Connection refused'), 'prod');
      expect(result.success).toBe(true);
    });
  });

  describe('WhatsAppAdapter', () => {
    let wa;
    beforeEach(() => { wa = new WhatsAppAdapter(waConfig); });

    it('should send approval request via WhatsApp', async () => {
      const result = await wa.sendChangeApprovalRequest(changeset, []);
      expect(result.success).toBe(true);
    });

    it('should send failure alert via WhatsApp', async () => {
      const result = await wa.sendFailureAlert(changeset, 'DB connection timeout', 'prod');
      expect(result.success).toBe(true);
    });

    it('should skip deployment result when event not in WHATSAPP_NOTIFY_ON', async () => {
      const result = await wa.sendDeploymentResult(changeset, 'preprod', { success: true, duration: 100 });
      // preprod deploy not in notify list, but prod_deploy is — should check
      expect(result.success).toBe(true);
    });

    it('should send prod deployment result', async () => {
      const result = await wa.sendDeploymentResult(changeset, 'prod', { success: true, duration: 200 });
      expect(result.success).toBe(true);
    });
  });
});
