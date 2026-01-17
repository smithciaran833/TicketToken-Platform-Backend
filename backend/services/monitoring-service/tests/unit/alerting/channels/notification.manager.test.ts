import { NotificationManager } from '../../../../src/alerting/channels/notification.manager';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import axios from 'axios';

jest.mock('nodemailer');
jest.mock('@slack/web-api');
jest.mock('axios');

jest.mock('../../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from '../../../../src/logger';

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockSendMail: jest.Mock;
  let mockSlackPostMessage: jest.Mock;

  const createMockAlert = (overrides = {}) => ({
    ruleId: 'rule-123',
    ruleName: 'High CPU Alert',
    severity: 'warning',
    message: 'CPU usage is high',
    value: 85,
    threshold: 80,
    timestamp: new Date('2024-01-15T10:30:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.ALERT_TO_EMAIL;
    delete process.env.SLACK_TOKEN;
    delete process.env.SLACK_CHANNEL;
    delete process.env.PAGERDUTY_ROUTING_KEY;
    delete process.env.WEBHOOK_URL;

    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    mockSlackPostMessage = jest.fn().mockResolvedValue({ ok: true });

    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    (WebClient as jest.Mock).mockImplementation(() => ({
      chat: {
        postMessage: mockSlackPostMessage,
      },
    }));

    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });
  });

  describe('constructor', () => {
    describe('email transporter initialization', () => {
      it('should initialize email transporter when SMTP config is present', () => {
        process.env.SMTP_HOST = 'smtp.test.com';
        process.env.SMTP_USER = 'user@test.com';
        process.env.SMTP_PASS = 'password123';

        new NotificationManager();

        expect(nodemailer.createTransport).toHaveBeenCalledWith({
          host: 'smtp.test.com',
          port: 587,
          secure: false,
          auth: {
            user: 'user@test.com',
            pass: 'password123',
          },
        });
        expect(logger.info).toHaveBeenCalledWith('Email transporter initialized');
      });

      it('should use custom SMTP port when provided', () => {
        process.env.SMTP_HOST = 'smtp.test.com';
        process.env.SMTP_USER = 'user@test.com';
        process.env.SMTP_PASS = 'password123';
        process.env.SMTP_PORT = '465';
        process.env.SMTP_SECURE = 'true';

        new NotificationManager();

        expect(nodemailer.createTransport).toHaveBeenCalledWith(
          expect.objectContaining({
            port: 465,
            secure: true,
          })
        );
      });

      it('should warn when SMTP config is missing', () => {
        new NotificationManager();

        expect(logger.warn).toHaveBeenCalledWith(
          'Email notification disabled: Missing SMTP configuration'
        );
      });

      it('should log error when email transporter creation fails', () => {
        process.env.SMTP_HOST = 'smtp.test.com';
        process.env.SMTP_USER = 'user@test.com';
        process.env.SMTP_PASS = 'password123';

        const error = new Error('Invalid SMTP config');
        (nodemailer.createTransport as jest.Mock).mockImplementation(() => {
          throw error;
        });

        new NotificationManager();

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to initialize email transporter:',
          error
        );
      });
    });

    describe('slack client initialization', () => {
      it('should initialize Slack client when token is present', () => {
        process.env.SLACK_TOKEN = 'xoxb-test-token';

        new NotificationManager();

        expect(WebClient).toHaveBeenCalledWith('xoxb-test-token');
        expect(logger.info).toHaveBeenCalledWith('Slack client initialized');
      });

      it('should warn when Slack token is missing', () => {
        new NotificationManager();

        expect(logger.warn).toHaveBeenCalledWith(
          'Slack notification disabled: Missing SLACK_TOKEN'
        );
      });

      it('should log error when Slack client creation fails', () => {
        process.env.SLACK_TOKEN = 'invalid-token';

        const error = new Error('Invalid token');
        (WebClient as jest.Mock).mockImplementation(() => {
          throw error;
        });

        new NotificationManager();

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to initialize Slack client:',
          error
        );
      });
    });
  });

  describe('send', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASS = 'password123';
      process.env.SLACK_TOKEN = 'xoxb-test-token';

      notificationManager = new NotificationManager();
    });

    it('should log debug message when sending', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(logger.debug).toHaveBeenCalledWith(
        'Sending notification via email',
        { alert: 'High CPU Alert' }
      );
    });

    it('should route to email channel', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should route to slack channel', async () => {
      const alert = createMockAlert();

      await notificationManager.send('slack', 'Test message', alert);

      expect(mockSlackPostMessage).toHaveBeenCalled();
    });

    it('should route to pagerduty channel', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-routing-key';
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await notificationManager.send('pagerduty', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should route to webhook channel', async () => {
      process.env.WEBHOOK_URL = 'https://test.webhook.com/hook';
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await notificationManager.send('webhook', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.webhook.com/hook',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle case-insensitive channel names', async () => {
      const alert = createMockAlert();

      await notificationManager.send('EMAIL', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should warn for unknown channel', async () => {
      const alert = createMockAlert();

      await notificationManager.send('unknown-channel', 'Test message', alert);

      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown notification channel: unknown-channel'
      );
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Send failed');
      mockSendMail.mockRejectedValue(error);
      const alert = createMockAlert();

      await expect(
        notificationManager.send('email', 'Test message', alert)
      ).rejects.toThrow('Send failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send notification via email:',
        error
      );
    });
  });

  describe('sendEmail', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'sender@test.com';
      process.env.SMTP_PASS = 'password123';

      notificationManager = new NotificationManager();
    });

    it('should throw when email transporter not initialized', async () => {
      delete process.env.SMTP_HOST;
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await expect(
        notificationManager.send('email', 'Test', alert)
      ).rejects.toThrow('Email transporter not initialized');
    });

    it('should use ALERT_TO_EMAIL when configured', async () => {
      process.env.ALERT_TO_EMAIL = 'alerts@company.com';
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alerts@company.com',
        })
      );
    });

    it('should fallback to SMTP_USER when ALERT_TO_EMAIL not set', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'sender@test.com',
        })
      );
    });

    it('should send email with correct subject format', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      await notificationManager.send('email', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[CRITICAL] High CPU Alert',
        })
      );
    });

    it('should include plain text message', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Plain text content', alert);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text content',
        })
      );
    });

    it('should include HTML formatted message', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('<!DOCTYPE html>'),
        })
      );
    });

    it('should log success after sending', async () => {
      const alert = createMockAlert();

      await notificationManager.send('email', 'Test message', alert);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Email notification sent to')
      );
    });
  });

  describe('sendSlack', () => {
    beforeEach(() => {
      process.env.SLACK_TOKEN = 'xoxb-test-token';

      notificationManager = new NotificationManager();
    });

    it('should throw when Slack client not initialized', async () => {
      delete process.env.SLACK_TOKEN;
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await expect(
        notificationManager.send('slack', 'Test', alert)
      ).rejects.toThrow('Slack client not initialized');
    });

    it('should use default channel when SLACK_CHANNEL not set', async () => {
      const alert = createMockAlert();

      await notificationManager.send('slack', 'Test message', alert);

      expect(mockSlackPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#monitoring-alerts',
        })
      );
    });

    it('should use configured SLACK_CHANNEL', async () => {
      process.env.SLACK_CHANNEL = '#custom-alerts';
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await notificationManager.send('slack', 'Test message', alert);

      expect(mockSlackPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#custom-alerts',
        })
      );
    });

    it('should send message with blocks', async () => {
      const alert = createMockAlert();

      await notificationManager.send('slack', 'Test message', alert);

      expect(mockSlackPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'header' }),
            expect.objectContaining({ type: 'section' }),
          ]),
        })
      );
    });

    it('should include alert details in blocks', async () => {
      const alert = createMockAlert({
        value: 95,
        threshold: 80,
      });

      await notificationManager.send('slack', 'Test message', alert);

      const callArgs = mockSlackPostMessage.mock.calls[0][0];
      const blocksJson = JSON.stringify(callArgs.blocks);

      expect(blocksJson).toContain('95');
      expect(blocksJson).toContain('80');
      expect(blocksJson).toContain('rule-123');
    });

    it('should log success after sending', async () => {
      const alert = createMockAlert();

      await notificationManager.send('slack', 'Test message', alert);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Slack notification sent to')
      );
    });
  });

  describe('sendPagerDuty', () => {
    beforeEach(() => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-routing-key';
      notificationManager = new NotificationManager();
    });

    it('should throw when routing key not configured', async () => {
      delete process.env.PAGERDUTY_ROUTING_KEY;
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await expect(
        notificationManager.send('pagerduty', 'Test', alert)
      ).rejects.toThrow('PagerDuty routing key not configured');
    });

    it('should post to PagerDuty events API', async () => {
      const alert = createMockAlert();

      await notificationManager.send('pagerduty', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({
          routing_key: 'test-routing-key',
          event_action: 'trigger',
        }),
        expect.any(Object)
      );
    });

    it('should include payload with alert details', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      await notificationManager.send('pagerduty', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            summary: 'CRITICAL: High CPU Alert',
            severity: 'critical',
            source: 'monitoring-service',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should map severity correctly', async () => {
      const testCases = [
        { input: 'critical', expected: 'critical' },
        { input: 'error', expected: 'error' },
        { input: 'warning', expected: 'warning' },
        { input: 'info', expected: 'info' },
        { input: 'unknown', expected: 'warning' },
      ];

      for (const { input, expected } of testCases) {
        jest.clearAllMocks();
        const alert = createMockAlert({ severity: input });

        await notificationManager.send('pagerduty', 'Test', alert);

        expect(axios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            payload: expect.objectContaining({
              severity: expected,
            }),
          }),
          expect.any(Object)
        );
      }
    });

    it('should log success after sending', async () => {
      const alert = createMockAlert();

      await notificationManager.send('pagerduty', 'Test message', alert);

      expect(logger.info).toHaveBeenCalledWith('PagerDuty incident created');
    });
  });

  describe('sendWebhook', () => {
    beforeEach(() => {
      process.env.WEBHOOK_URL = 'https://webhook.test.com/alerts';
      notificationManager = new NotificationManager();
    });

    it('should throw when webhook URL not configured', async () => {
      delete process.env.WEBHOOK_URL;
      notificationManager = new NotificationManager();
      const alert = createMockAlert();

      await expect(
        notificationManager.send('webhook', 'Test', alert)
      ).rejects.toThrow('Webhook URL not configured');
    });

    it('should post to configured webhook URL', async () => {
      const alert = createMockAlert();

      await notificationManager.send('webhook', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        'https://webhook.test.com/alerts',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should include alert data in payload', async () => {
      const alert = createMockAlert();

      await notificationManager.send('webhook', 'Formatted message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          alert: expect.objectContaining({
            rule_id: 'rule-123',
            rule_name: 'High CPU Alert',
            severity: 'warning',
          }),
          formatted_message: 'Formatted message',
        }),
        expect.any(Object)
      );
    });

    it('should set correct headers', async () => {
      const alert = createMockAlert();

      await notificationManager.send('webhook', 'Test message', alert);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TicketToken-Monitoring-Service',
          },
          timeout: 5000,
        })
      );
    });

    it('should log success after sending', async () => {
      const alert = createMockAlert();

      await notificationManager.send('webhook', 'Test message', alert);

      expect(logger.info).toHaveBeenCalledWith('Webhook notification sent');
    });
  });

  describe('severity color mapping', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASS = 'password123';
      notificationManager = new NotificationManager();
    });

    it('should use red for critical severity in email HTML', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      await notificationManager.send('email', 'Test', alert);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#dc3545');
    });

    it('should use orange for error severity in email HTML', async () => {
      const alert = createMockAlert({ severity: 'error' });

      await notificationManager.send('email', 'Test', alert);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#fd7e14');
    });

    it('should use yellow for warning severity in email HTML', async () => {
      const alert = createMockAlert({ severity: 'warning' });

      await notificationManager.send('email', 'Test', alert);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#ffc107');
    });

    it('should use blue for info severity in email HTML', async () => {
      const alert = createMockAlert({ severity: 'info' });

      await notificationManager.send('email', 'Test', alert);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#17a2b8');
    });

    it('should use gray for unknown severity in email HTML', async () => {
      const alert = createMockAlert({ severity: 'unknown' });

      await notificationManager.send('email', 'Test', alert);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#6c757d');
    });
  });
});
