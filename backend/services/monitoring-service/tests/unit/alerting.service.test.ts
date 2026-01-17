// Mock dependencies BEFORE imports
jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

const mockPostMessage = jest.fn();
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(() => ({
    chat: {
      postMessage: mockPostMessage,
    },
  })),
}));

import { AlertingService } from '../../src/alerting.service';
import { logger } from '../../src/logger';

describe('AlertingService', () => {
  let alertingService: AlertingService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'testuser';
    process.env.SMTP_PASS = 'testpass';
    process.env.SLACK_TOKEN = 'xoxb-test-token';

    mockSendMail.mockResolvedValue({ messageId: 'test-123' });
    mockPostMessage.mockResolvedValue({ ok: true });

    alertingService = new AlertingService();
  });

  afterEach(() => {
    process.env = originalEnv;
    alertingService.removeAllListeners();
  });

  describe('constructor', () => {
    it('should be an EventEmitter', () => {
      expect(alertingService.on).toBeDefined();
      expect(alertingService.emit).toBeDefined();
    });

    it('should setup email transporter when SMTP_HOST is configured', () => {
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'testuser',
          pass: 'testpass',
        },
      });
    });

    it('should not setup email transporter when SMTP_HOST is not configured', () => {
      jest.clearAllMocks();
      delete process.env.SMTP_HOST;

      new AlertingService();

      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it('should define default alerts', () => {
      // Access private alerts map via checkAlert behavior
      expect((alertingService as any).alerts.size).toBeGreaterThan(0);
    });
  });

  describe('default alerts', () => {
    it('should have high_refund_rate alert', () => {
      const alert = (alertingService as any).alerts.get('high_refund_rate');
      expect(alert).toBeDefined();
      expect(alert.name).toBe('High Refund Rate');
      expect(alert.threshold).toBe(0.1);
      expect(alert.severity).toBe('warning');
    });

    it('should have payment_failure_spike alert', () => {
      const alert = (alertingService as any).alerts.get('payment_failure_spike');
      expect(alert).toBeDefined();
      expect(alert.name).toBe('Payment Failure Spike');
      expect(alert.threshold).toBe(0.2);
      expect(alert.severity).toBe('error');
      expect(alert.channels).toContain('pagerduty');
    });

    it('should have database_slow alert', () => {
      const alert = (alertingService as any).alerts.get('database_slow');
      expect(alert).toBeDefined();
      expect(alert.threshold).toBe(1000);
    });

    it('should have api_error_rate_high alert', () => {
      const alert = (alertingService as any).alerts.get('api_error_rate_high');
      expect(alert).toBeDefined();
      expect(alert.threshold).toBe(0.05);
    });

    it('should have solana_network_issues alert', () => {
      const alert = (alertingService as any).alerts.get('solana_network_issues');
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('critical');
    });

    it('should have queue_backup alert', () => {
      const alert = (alertingService as any).alerts.get('queue_backup');
      expect(alert).toBeDefined();
      expect(alert.threshold).toBe(1000);
    });

    it('should have revenue_drop alert', () => {
      const alert = (alertingService as any).alerts.get('revenue_drop');
      expect(alert).toBeDefined();
      expect(alert.threshold).toBe(-0.5);
    });

    it('should have concurrent_users_spike alert', () => {
      const alert = (alertingService as any).alerts.get('concurrent_users_spike');
      expect(alert).toBeDefined();
      expect(alert.threshold).toBe(10000);
    });
  });

  describe('checkAlert', () => {
    it('should not fire if alert does not exist', async () => {
      await alertingService.checkAlert('nonexistent', 100);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should not fire if value is below threshold (> condition)', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.05);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should fire if value exceeds threshold (> condition)', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(logger.warn).toHaveBeenCalledWith(
        'Alert fired: High Refund Rate',
        expect.objectContaining({ value: 0.15, threshold: 0.1 })
      );
    });

    it('should fire if value is below threshold (< condition)', async () => {
      await alertingService.checkAlert('revenue_drop', -0.6);

      expect(logger.warn).toHaveBeenCalledWith(
        'Alert fired: Significant Revenue Drop',
        expect.any(Object)
      );
    });

    it('should not fire if value is above threshold (< condition)', async () => {
      await alertingService.checkAlert('revenue_drop', -0.3);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should respect cooldown period', async () => {
      // Fire first alert
      await alertingService.checkAlert('high_refund_rate', 0.15);
      expect(logger.warn).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Try to fire again immediately - should be blocked by cooldown
      await alertingService.checkAlert('high_refund_rate', 0.15);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should emit alert_fired event', async () => {
      const eventHandler = jest.fn();
      alertingService.on('alert_fired', eventHandler);

      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 0.15,
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send email when transporter is configured', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[WARNING] High Refund Rate',
        })
      );
    });

    it('should use default from email if not configured', async () => {
      delete process.env.ALERT_FROM_EMAIL;

      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'alerts@tickettoken.com',
        })
      );
    });

    it('should use default to email if not configured', async () => {
      delete process.env.ALERT_TO_EMAIL;

      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@tickettoken.com',
        })
      );
    });

    it('should log error if email send fails', async () => {
      const error = new Error('SMTP error');
      mockSendMail.mockRejectedValueOnce(error);

      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(logger.error).toHaveBeenCalledWith('Failed to send email alert:', error);
    });

    it('should not send email if transporter is not configured', async () => {
      jest.clearAllMocks();
      delete process.env.SMTP_HOST;
      const service = new AlertingService();

      await service.checkAlert('high_refund_rate', 0.15);

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendSlack', () => {
    it('should send slack message when client is configured', async () => {
      await alertingService.checkAlert('database_slow', 1500);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#alerts',
        })
      );
    });

    it('should use configured slack channel', async () => {
      process.env.SLACK_ALERTS_CHANNEL = '#custom-alerts';
      const service = new AlertingService();

      await service.checkAlert('database_slow', 1500);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: '#custom-alerts',
        })
      );
    });

    it('should set danger color for critical alerts', async () => {
      await alertingService.checkAlert('solana_network_issues', 0.15);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'danger',
            }),
          ]),
        })
      );
    });

    it('should set warning color for error alerts', async () => {
      await alertingService.checkAlert('payment_failure_spike', 0.25);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'warning',
            }),
          ]),
        })
      );
    });

    it('should log error if slack send fails', async () => {
      const error = new Error('Slack API error');
      mockPostMessage.mockRejectedValueOnce(error);

      await alertingService.checkAlert('database_slow', 1500);

      expect(logger.error).toHaveBeenCalledWith('Failed to send Slack alert:', error);
    });

    it('should not send slack if client is not configured', async () => {
      jest.clearAllMocks();
      delete process.env.SLACK_TOKEN;
      const service = new AlertingService();

      await service.checkAlert('database_slow', 1500);

      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendPagerDuty', () => {
    it('should log pagerduty alert info', async () => {
      await alertingService.checkAlert('payment_failure_spike', 0.25);

      expect(logger.info).toHaveBeenCalledWith(
        'PagerDuty alert would be sent:',
        expect.objectContaining({ alert: 'Payment Failure Spike' })
      );
    });
  });

  describe('formatAlertMessage', () => {
    it('should include correct emoji for warning severity', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('⚠️'),
        })
      );
    });

    it('should include correct emoji for error severity', async () => {
      await alertingService.checkAlert('api_error_rate_high', 0.1);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('🚨'),
        })
      );
    });

    it('should include correct emoji for critical severity', async () => {
      await alertingService.checkAlert('solana_network_issues', 0.15);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('🔥'),
        })
      );
    });

    it('should include alert name in message', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.15);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('High Refund Rate'),
        })
      );
    });

    it('should include value and threshold in message', async () => {
      await alertingService.checkAlert('high_refund_rate', 0.15);

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.text).toContain('0.15');
      expect(call.text).toContain('0.1');
    });
  });

  describe('exported instance', () => {
    it('should export alertingService instance', () => {
      const { alertingService: exported } = require('../../src/alerting.service');
      expect(exported).toBeInstanceOf(AlertingService);
    });
  });
});
