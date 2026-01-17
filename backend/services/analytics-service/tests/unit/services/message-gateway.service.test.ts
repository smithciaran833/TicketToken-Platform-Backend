/**
 * Message Gateway Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const mockPublish = jest.fn();
jest.mock('../../../src/config/rabbitmq', () => ({
  getChannel: jest.fn(() => ({
    publish: mockPublish,
  })),
}));

import { MessageGatewayService, Message, MessageTemplate } from '../../../src/services/message-gateway.service';
import { AlertInstance } from '../../../src/types';

describe('MessageGatewayService', () => {
  let service: MessageGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get fresh instance
    service = MessageGatewayService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MessageGatewayService.getInstance();
      const instance2 = MessageGatewayService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('constructor', () => {
    it('should initialize templates', () => {
      const templates = (service as any).templates;

      expect(templates.has('alert-email')).toBe(true);
      expect(templates.has('alert-sms')).toBe(true);
      expect(templates.has('alert-slack')).toBe(true);
      expect(templates.has('report-ready-email')).toBe(true);
      expect(templates.has('customer-insight-email')).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should create message with interpolated template', async () => {
      const result = await service.sendMessage(
        'email',
        'test@example.com',
        'alert-email',
        {
          alertName: 'High Traffic Alert',
          alertDescription: 'Traffic exceeded threshold',
          severity: 'warning',
          triggeredAt: '2024-01-15T10:00:00Z',
          currentValue: '1500',
          threshold: '1000',
          dashboardUrl: 'https://example.com/dashboard',
        }
      );

      expect(result.id).toMatch(/^msg-/);
      expect(result.channel).toBe('email');
      expect(result.recipient).toBe('test@example.com');
      expect(result.status).toBe('pending');
      expect(result.subject).toContain('High Traffic Alert');
      expect(result.body).toContain('High Traffic Alert');
      expect(result.body).toContain('warning');
    });

    it('should throw for unknown template', async () => {
      await expect(
        service.sendMessage('email', 'test@example.com', 'unknown-template', {})
      ).rejects.toThrow('Template unknown-template not found');
    });

    it('should queue message via RabbitMQ', async () => {
      await service.sendMessage('email', 'test@example.com', 'alert-email', {
        alertName: 'Test',
        alertDescription: 'Test',
        severity: 'info',
        triggeredAt: new Date().toISOString(),
        currentValue: '100',
        threshold: '50',
        dashboardUrl: 'https://example.com',
      });

      expect(mockPublish).toHaveBeenCalledWith(
        'tickettoken_events',
        'messages.email',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should include metadata in message', async () => {
      const result = await service.sendMessage(
        'sms',
        '+1234567890',
        'alert-sms',
        { alertName: 'Test Alert', severity: 'critical', currentValue: '500' }
      );

      expect(result.metadata).toEqual({
        templateId: 'alert-sms',
        variables: expect.objectContaining({ alertName: 'Test Alert' }),
      });
    });
  });

  describe('sendAlertNotification', () => {
    const mockAlert: AlertInstance = {
      id: 'instance-1',
      alertId: 'alert-123',
      message: 'High Revenue Alert',
      severity: 'critical',
      triggeredAt: new Date(),
      triggerValues: { revenue: 50000 },
      status: 'active',
      acknowledged: false,
    };

    it('should send email notification', async () => {
      await service.sendAlertNotification(mockAlert, 'email', 'admin@example.com');

      expect(mockPublish).toHaveBeenCalledWith(
        'tickettoken_events',
        'messages.email',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should send SMS notification', async () => {
      await service.sendAlertNotification(mockAlert, 'sms', '+1234567890');

      expect(mockPublish).toHaveBeenCalledWith(
        'tickettoken_events',
        'messages.sms',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should send Slack notification', async () => {
      await service.sendAlertNotification(mockAlert, 'slack', '#alerts');

      expect(mockPublish).toHaveBeenCalledWith(
        'tickettoken_events',
        'messages.slack',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should set color based on severity - critical', async () => {
      const sendSpy = jest.spyOn(service, 'sendMessage');

      await service.sendAlertNotification(
        { ...mockAlert, severity: 'critical' },
        'slack',
        '#alerts'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        'slack',
        '#alerts',
        'alert-slack',
        expect.objectContaining({ color: '#ff0000' })
      );
    });

    it('should set color based on severity - warning', async () => {
      const sendSpy = jest.spyOn(service, 'sendMessage');

      await service.sendAlertNotification(
        { ...mockAlert, severity: 'warning' },
        'slack',
        '#alerts'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        'slack',
        '#alerts',
        'alert-slack',
        expect.objectContaining({ color: '#ffcc00' })
      );
    });

    it('should set color based on severity - error', async () => {
      const sendSpy = jest.spyOn(service, 'sendMessage');

      await service.sendAlertNotification(
        { ...mockAlert, severity: 'error' },
        'slack',
        '#alerts'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        'slack',
        '#alerts',
        'alert-slack',
        expect.objectContaining({ color: '#ff6600' })
      );
    });

    it('should include dashboard URL', async () => {
      const sendSpy = jest.spyOn(service, 'sendMessage');

      await service.sendAlertNotification(mockAlert, 'email', 'test@example.com');

      expect(sendSpy).toHaveBeenCalledWith(
        'email',
        'test@example.com',
        'alert-email',
        expect.objectContaining({
          dashboardUrl: expect.stringContaining('/dashboard/alerts/alert-123'),
        })
      );
    });
  });

  describe('sendBulkMessages', () => {
    it('should send multiple messages', async () => {
      const messages = [
        { channel: 'email' as const, recipient: 'a@example.com', templateId: 'alert-email', variables: { alertName: 'A', alertDescription: 'A', severity: 'info', triggeredAt: '', currentValue: '', threshold: '', dashboardUrl: '' } },
        { channel: 'email' as const, recipient: 'b@example.com', templateId: 'alert-email', variables: { alertName: 'B', alertDescription: 'B', severity: 'info', triggeredAt: '', currentValue: '', threshold: '', dashboardUrl: '' } },
      ];

      const results = await service.sendBulkMessages(messages);

      expect(results).toHaveLength(2);
      expect(mockPublish).toHaveBeenCalledTimes(2);
    });

    it('should return successful messages even with failures', async () => {
      mockPublish.mockImplementationOnce(() => {
        throw new Error('Queue error');
      });

      const messages = [
        { channel: 'email' as const, recipient: 'a@example.com', templateId: 'alert-email', variables: { alertName: 'A', alertDescription: 'A', severity: 'info', triggeredAt: '', currentValue: '', threshold: '', dashboardUrl: '' } },
        { channel: 'email' as const, recipient: 'b@example.com', templateId: 'alert-email', variables: { alertName: 'B', alertDescription: 'B', severity: 'info', triggeredAt: '', currentValue: '', threshold: '', dashboardUrl: '' } },
      ];

      const results = await service.sendBulkMessages(messages);

      expect(results).toHaveLength(1);
    });
  });

  describe('interpolateTemplate', () => {
    it('should replace single variable', () => {
      const result = (service as any).interpolateTemplate(
        'Hello {{name}}!',
        { name: 'World' }
      );

      expect(result).toBe('Hello World!');
    });

    it('should replace multiple variables', () => {
      const result = (service as any).interpolateTemplate(
        '{{greeting}} {{name}}, your score is {{score}}',
        { greeting: 'Hi', name: 'Alice', score: 100 }
      );

      expect(result).toBe('Hi Alice, your score is 100');
    });

    it('should replace same variable multiple times', () => {
      const result = (service as any).interpolateTemplate(
        '{{name}} is {{name}}',
        { name: 'Bob' }
      );

      expect(result).toBe('Bob is Bob');
    });

    it('should handle missing variables', () => {
      const result = (service as any).interpolateTemplate(
        'Hello {{name}}!',
        {}
      );

      expect(result).toBe('Hello {{name}}!');
    });
  });

  describe('maskRecipient', () => {
    it('should mask email address', () => {
      const result = (service as any).maskRecipient('john.doe@example.com');

      expect(result).toBe('jo***@example.com');
    });

    it('should mask phone number with +', () => {
      const result = (service as any).maskRecipient('+12345678901');

      expect(result).toBe('***8901');
    });

    it('should mask numeric phone', () => {
      const result = (service as any).maskRecipient('5551234567');

      expect(result).toBe('***4567');
    });

    it('should return *** for unknown format', () => {
      const result = (service as any).maskRecipient('#slack-channel');

      expect(result).toBe('***');
    });

    it('should handle short email usernames', () => {
      const result = (service as any).maskRecipient('ab@example.com');

      expect(result).toBe('ab***@example.com');
    });
  });

  describe('getMessageStatus', () => {
    it('should return null (not implemented)', async () => {
      const result = await service.getMessageStatus('msg-123');

      expect(result).toBeNull();
    });
  });

  describe('retryFailedMessages', () => {
    it('should return 0 (not implemented)', async () => {
      const result = await service.retryFailedMessages(new Date());

      expect(result).toBe(0);
    });
  });
});
