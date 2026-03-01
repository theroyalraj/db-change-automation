const NotificationDispatcher = require('../../scripts/core/notification-dispatcher');

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'email-msg-001' }),
  })),
}));

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM001' });
  return jest.fn(() => ({
    messages: Object.assign(jest.fn(() => ({ fetch: jest.fn().mockResolvedValue({ status: 'delivered' }) })), {
      create: mockCreate,
    }),
  }));
});

const mockChangeset = {
  id: '20260228-001-test',
  author: 'test.user',
  type: 'ddl',
  description: 'Test change',
  ticket: 'TEST-1',
  environment: 'prod',
  risk: 'high',
  reviewers: ['dba-team'],
  rollback: 'auto',
  compliance: ['SOX'],
  schedule: 'immediate',
};

describe('NotificationDispatcher', () => {
  describe('channel initialization', () => {
    it('should have zero adapters when NOTIFICATION_CHANNELS is empty', () => {
      const dispatcher = new NotificationDispatcher({ NOTIFICATION_CHANNELS: '' });
      expect(dispatcher.channelCount).toBe(0);
    });

    it('should initialize email adapter when configured', () => {
      const dispatcher = new NotificationDispatcher({
        NOTIFICATION_CHANNELS: 'email',
        EMAIL_SMTP_HOST: 'smtp.test.com',
        EMAIL_SMTP_PORT: '587',
        EMAIL_SMTP_SECURE: 'false',
        EMAIL_FROM: 'test@test.com',
        EMAIL_USERNAME: 'user',
        EMAIL_PASSWORD: 'pass',
        EMAIL_DBA_RECIPIENTS: 'dba@test.com',
      });
      expect(dispatcher.channelCount).toBe(1);
    });

    it('should initialize both email and whatsapp', () => {
      const dispatcher = new NotificationDispatcher({
        NOTIFICATION_CHANNELS: 'email,whatsapp',
        EMAIL_SMTP_HOST: 'smtp.test.com',
        EMAIL_SMTP_PORT: '587',
        EMAIL_SMTP_SECURE: 'false',
        EMAIL_FROM: 'test@test.com',
        EMAIL_USERNAME: 'user',
        EMAIL_PASSWORD: 'pass',
        EMAIL_DBA_RECIPIENTS: 'dba@test.com',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+1000',
        WHATSAPP_DBA_NUMBERS: 'whatsapp:+2000',
        WHATSAPP_NOTIFY_ON: 'all',
      });
      expect(dispatcher.channelCount).toBe(2);
    });

    it('should ignore unknown channels', () => {
      const dispatcher = new NotificationDispatcher({
        NOTIFICATION_CHANNELS: 'telegram',
      });
      expect(dispatcher.channelCount).toBe(0);
    });
  });

  describe('notifyAll', () => {
    it('should return empty array when no channels configured', async () => {
      const dispatcher = new NotificationDispatcher({ NOTIFICATION_CHANNELS: '' });
      const results = await dispatcher.notifyAll('deployed', {});
      expect(results).toEqual([]);
    });

    it('should dispatch approval_needed event to email', async () => {
      const dispatcher = new NotificationDispatcher({
        NOTIFICATION_CHANNELS: 'email',
        EMAIL_SMTP_HOST: 'smtp.test.com',
        EMAIL_SMTP_PORT: '587',
        EMAIL_SMTP_SECURE: 'false',
        EMAIL_FROM: 'test@test.com',
        EMAIL_USERNAME: 'user',
        EMAIL_PASSWORD: 'pass',
        EMAIL_DBA_RECIPIENTS: 'dba@test.com',
      });

      const results = await dispatcher.notifyAll('approval_needed', {
        changeset: mockChangeset,
        approvers: ['dba@test.com'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].channel).toBe('email');
      expect(results[0].success).toBe(true);
    });

    it('should dispatch failed event to all channels', async () => {
      const dispatcher = new NotificationDispatcher({
        NOTIFICATION_CHANNELS: 'email,whatsapp',
        EMAIL_SMTP_HOST: 'smtp.test.com',
        EMAIL_SMTP_PORT: '587',
        EMAIL_SMTP_SECURE: 'false',
        EMAIL_FROM: 'test@test.com',
        EMAIL_USERNAME: 'user',
        EMAIL_PASSWORD: 'pass',
        EMAIL_DBA_RECIPIENTS: 'dba@test.com',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+1000',
        WHATSAPP_DBA_NUMBERS: 'whatsapp:+2000',
        WHATSAPP_NOTIFY_ON: 'failure',
      });

      const results = await dispatcher.notifyAll('failed', {
        changeset: mockChangeset,
        error: new Error('Connection refused'),
        environment: 'prod',
      });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });
});
