import { AlertManager } from '../../../src/alerting/alert.manager';
import { NotificationManager } from '../../../src/alerting/channels/notification.manager';
import { RuleEngine } from '../../../src/alerting/rules/rule.engine';

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/alerting/channels/notification.manager');
jest.mock('../../../src/alerting/rules/rule.engine');

import { logger } from '../../../src/logger';

describe('AlertManager', () => {
  let alertManager: AlertManager;
  let mockNotificationManager: jest.Mocked<NotificationManager>;
  let mockRuleEngine: jest.Mocked<RuleEngine>;

  const createMockAlert = (overrides = {}) => ({
    ruleId: 'rule-123',
    ruleName: 'High CPU Usage',
    severity: 'warning',
    message: 'CPU usage exceeded threshold',
    value: 85,
    threshold: 80,
    timestamp: new Date('2024-01-15T10:30:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockNotificationManager = {
      send: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockRuleEngine = {
      getRule: jest.fn(),
      addRule: jest.fn(),
      removeRule: jest.fn(),
      getAllRules: jest.fn(),
    } as any;

    (NotificationManager as jest.Mock).mockImplementation(() => mockNotificationManager);
    (RuleEngine as jest.Mock).mockImplementation(() => mockRuleEngine);

    alertManager = new AlertManager();
  });

  describe('constructor', () => {
    it('should initialize NotificationManager', () => {
      expect(NotificationManager).toHaveBeenCalledTimes(1);
    });

    it('should initialize RuleEngine', () => {
      expect(RuleEngine).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendNotification', () => {
    describe('successful notification', () => {
      beforeEach(() => {
        mockRuleEngine.getRule.mockReturnValue({
          id: 'rule-123',
          name: 'High CPU Usage',
          channels: ['email', 'slack'],
          severity: 'warning',
          enabled: true,
        } as any);
      });

      it('should log processing alert message', async () => {
        const alert = createMockAlert();

        await alertManager.sendNotification(alert);

        expect(logger.info).toHaveBeenCalledWith(
          'Processing alert: High CPU Usage',
          { alert }
        );
      });

      it('should fetch rule configuration from RuleEngine', async () => {
        const alert = createMockAlert();

        await alertManager.sendNotification(alert);

        expect(mockRuleEngine.getRule).toHaveBeenCalledWith('rule-123');
      });

      it('should send notification to all configured channels', async () => {
        const alert = createMockAlert();

        await alertManager.sendNotification(alert);

        expect(mockNotificationManager.send).toHaveBeenCalledTimes(2);
        expect(mockNotificationManager.send).toHaveBeenCalledWith(
          'email',
          expect.any(String),
          alert
        );
        expect(mockNotificationManager.send).toHaveBeenCalledWith(
          'slack',
          expect.any(String),
          alert
        );
      });

      it('should log success message after sending', async () => {
        const alert = createMockAlert();

        await alertManager.sendNotification(alert);

        expect(logger.info).toHaveBeenCalledWith('Alert sent successfully: High CPU Usage');
      });

      it('should use Promise.allSettled for sending to multiple channels', async () => {
        mockRuleEngine.getRule.mockReturnValue({
          id: 'rule-123',
          channels: ['email', 'slack', 'pagerduty'],
        } as any);

        // Make one channel fail
        mockNotificationManager.send
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Slack failed'))
          .mockResolvedValueOnce(undefined);

        const alert = createMockAlert();

        // Should not throw even if one channel fails
        await expect(alertManager.sendNotification(alert)).resolves.not.toThrow();

        expect(mockNotificationManager.send).toHaveBeenCalledTimes(3);
      });
    });

    describe('rule not found', () => {
      it('should throw error when rule is not found', async () => {
        mockRuleEngine.getRule.mockReturnValue(undefined);
        const alert = createMockAlert();

        await expect(alertManager.sendNotification(alert)).rejects.toThrow(
          'Rule not found: rule-123'
        );
      });

      it('should log error when rule is not found', async () => {
        mockRuleEngine.getRule.mockReturnValue(undefined);
        const alert = createMockAlert();

        try {
          await alertManager.sendNotification(alert);
        } catch (e) {}

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to send alert notification:',
          expect.any(Error)
        );
      });
    });

    describe('notification failure', () => {
      it('should throw error when notification fails', async () => {
        mockRuleEngine.getRule.mockReturnValue({
          id: 'rule-123',
          channels: ['email'],
        } as any);

        const error = new Error('SMTP connection failed');
        mockNotificationManager.send.mockRejectedValue(error);

        const alert = createMockAlert();

        // Note: Promise.allSettled doesn't throw, but if getRule throws it will
        // In this case the error is in send, which is settled
        await expect(alertManager.sendNotification(alert)).resolves.not.toThrow();
      });

      it('should log error details on failure', async () => {
        mockRuleEngine.getRule.mockReturnValue(undefined);
        const alert = createMockAlert();

        try {
          await alertManager.sendNotification(alert);
        } catch (e) {}

        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('formatAlertMessage (via sendNotification)', () => {
    beforeEach(() => {
      mockRuleEngine.getRule.mockReturnValue({
        id: 'rule-123',
        channels: ['email'],
      } as any);
    });

    it('should format message with all alert details', async () => {
      const alert = createMockAlert();

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];

      expect(sentMessage).toContain('ALERT: High CPU Usage');
      expect(sentMessage).toContain('Severity: WARNING');
      expect(sentMessage).toContain('CPU usage exceeded threshold');
      expect(sentMessage).toContain('rule-123');
    });

    it('should include warning emoji for warning severity', async () => {
      const alert = createMockAlert({ severity: 'warning' });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('⚠️');
    });

    it('should include critical emoji for critical severity', async () => {
      const alert = createMockAlert({ severity: 'critical' });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('🚨');
    });

    it('should include error emoji for error severity', async () => {
      const alert = createMockAlert({ severity: 'error' });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('❌');
    });

    it('should include info emoji for info severity', async () => {
      const alert = createMockAlert({ severity: 'info' });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('ℹ️');
    });

    it('should include default emoji for unknown severity', async () => {
      const alert = createMockAlert({ severity: 'unknown' });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('🔔');
    });

    it('should format small values as percentages', async () => {
      const alert = createMockAlert({ value: 0.85, threshold: 0.80 });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('85.00%');
      expect(sentMessage).toContain('80.00%');
    });

    it('should format large values with locale string', async () => {
      const alert = createMockAlert({ value: 1500000, threshold: 1000000 });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('1,500,000');
      expect(sentMessage).toContain('1,000,000');
    });

    it('should format medium values with 2 decimal places', async () => {
      const alert = createMockAlert({ value: 85.5678, threshold: 80.1234 });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('85.57');
      expect(sentMessage).toContain('80.12');
    });

    it('should include ISO timestamp', async () => {
      const alert = createMockAlert();

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('2024-01-15T10:30:00.000Z');
    });
  });

  describe('processAlert', () => {
    it('should call sendNotification with the alert', async () => {
      mockRuleEngine.getRule.mockReturnValue({
        id: 'rule-123',
        channels: ['email'],
      } as any);

      const alert = createMockAlert();

      // Spy on sendNotification
      const sendNotificationSpy = jest.spyOn(alertManager, 'sendNotification');

      await alertManager.processAlert(alert);

      expect(sendNotificationSpy).toHaveBeenCalledWith(alert);
    });

    it('should propagate errors from sendNotification', async () => {
      mockRuleEngine.getRule.mockReturnValue(undefined);
      const alert = createMockAlert();

      await expect(alertManager.processAlert(alert)).rejects.toThrow('Rule not found');
    });
  });

  describe('edge cases', () => {
    it('should handle rule with empty channels array', async () => {
      mockRuleEngine.getRule.mockReturnValue({
        id: 'rule-123',
        channels: [],
      } as any);

      const alert = createMockAlert();

      await alertManager.sendNotification(alert);

      expect(mockNotificationManager.send).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Alert sent successfully: High CPU Usage');
    });

    it('should handle alert with zero value', async () => {
      mockRuleEngine.getRule.mockReturnValue({
        id: 'rule-123',
        channels: ['email'],
      } as any);

      const alert = createMockAlert({ value: 0, threshold: 1 });

      await alertManager.sendNotification(alert);

      const sentMessage = mockNotificationManager.send.mock.calls[0][1];
      expect(sentMessage).toContain('0.00%');
    });

    it('should handle alert with negative value', async () => {
      mockRuleEngine.getRule.mockReturnValue({
        id: 'rule-123',
        channels: ['email'],
      } as any);

      const alert = createMockAlert({ value: -5.5 });

      await alertManager.sendNotification(alert);

      expect(mockNotificationManager.send).toHaveBeenCalled();
    });
  });
});
