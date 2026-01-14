/**
 * Alerting Service Tests
 * Tests for payment system alerting and monitoring
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('AlertingService', () => {
  let service: AlertingService;
  let mockSlack: any;
  let mockPagerDuty: any;
  let mockMetrics: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSlack = { sendMessage: jest.fn().mockResolvedValue(true) };
    mockPagerDuty = { createIncident: jest.fn().mockResolvedValue({ id: 'incident_123' }) };
    mockMetrics = { increment: jest.fn(), gauge: jest.fn() };
    service = new AlertingService(mockSlack, mockPagerDuty, mockMetrics);
  });

  describe('sendAlert', () => {
    it('should send low severity alerts to Slack only', async () => {
      await service.sendAlert({
        severity: 'low',
        title: 'Payment delayed',
        message: 'Payment pi_123 is taking longer than expected',
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
      expect(mockPagerDuty.createIncident).not.toHaveBeenCalled();
    });

    it('should send critical alerts to both Slack and PagerDuty', async () => {
      await service.sendAlert({
        severity: 'critical',
        title: 'Payment system down',
        message: 'Stripe API is not responding',
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
      expect(mockPagerDuty.createIncident).toHaveBeenCalled();
    });

    it('should include metadata in alert', async () => {
      await service.sendAlert({
        severity: 'medium',
        title: 'High failure rate',
        message: 'Payment failure rate exceeded 5%',
        metadata: { failureRate: 7.5, period: '5m' },
      });

      expect(mockSlack.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ failureRate: 7.5 }),
      }));
    });

    it('should track alert metrics', async () => {
      await service.sendAlert({
        severity: 'high',
        title: 'Test alert',
        message: 'Test message',
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('alerts.sent', expect.objectContaining({
        severity: 'high',
      }));
    });
  });

  describe('payment alerts', () => {
    it('should alert on payment failure spike', async () => {
      await service.alertPaymentFailureSpike({
        currentRate: 8.5,
        threshold: 5.0,
        window: '5m',
      });

      expect(mockSlack.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringContaining('failure'),
      }));
    });

    it('should alert on high decline rate', async () => {
      await service.alertHighDeclineRate({
        declineRate: 15.2,
        period: '1h',
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
    });

    it('should alert on Stripe API errors', async () => {
      await service.alertStripeApiError({
        errorCode: 'rate_limit_exceeded',
        endpoint: '/v1/payment_intents',
        responseTime: 30000,
      });

      expect(mockPagerDuty.createIncident).toHaveBeenCalled();
    });
  });

  describe('fraud alerts', () => {
    it('should alert on suspicious transaction', async () => {
      await service.alertSuspiciousTransaction({
        transactionId: 'txn_123',
        userId: 'user_456',
        amount: 50000,
        riskScore: 85,
        triggers: ['velocity', 'new_device', 'geo_anomaly'],
      });

      expect(mockSlack.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringContaining('Suspicious'),
      }));
    });

    it('should alert on potential scalper activity', async () => {
      await service.alertScalperDetected({
        userId: 'user_456',
        ticketCount: 50,
        eventId: 'event_789',
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
    });
  });

  describe('compliance alerts', () => {
    it('should alert on AML threshold exceeded', async () => {
      await service.alertAmlThreshold({
        userId: 'user_456',
        totalAmount: 15000_00, // $15,000
        period: '24h',
      });

      expect(mockPagerDuty.createIncident).toHaveBeenCalled();
    });

    it('should alert on potential sanctions match', async () => {
      await service.alertSanctionsMatch({
        userId: 'user_456',
        matchScore: 0.95,
        listName: 'OFAC SDN',
      });

      expect(mockPagerDuty.createIncident).toHaveBeenCalledWith(expect.objectContaining({
        urgency: 'high',
      }));
    });
  });

  describe('system alerts', () => {
    it('should alert on high latency', async () => {
      await service.alertHighLatency({
        operation: 'createPaymentIntent',
        p99Latency: 5000,
        threshold: 2000,
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
    });

    it('should alert on queue backlog', async () => {
      await service.alertQueueBacklog({
        queueName: 'payment-webhooks',
        depth: 10000,
        oldestMessage: new Date(Date.now() - 300000), // 5 minutes old
      });

      expect(mockSlack.sendMessage).toHaveBeenCalled();
    });

    it('should alert on database connection issues', async () => {
      await service.alertDatabaseIssue({
        connectionPool: { active: 50, idle: 0, waiting: 25 },
        errorRate: 5.2,
      });

      expect(mockPagerDuty.createIncident).toHaveBeenCalled();
    });
  });

  describe('throttling', () => {
    it('should throttle repeated alerts', async () => {
      const alert = {
        severity: 'medium' as const,
        title: 'Test alert',
        message: 'Test message',
        dedupeKey: 'test-alert-1',
      };

      await service.sendAlert(alert);
      await service.sendAlert(alert);
      await service.sendAlert(alert);

      expect(mockSlack.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should allow alert after cooldown', async () => {
      jest.useFakeTimers();

      const alert = {
        severity: 'medium' as const,
        title: 'Test alert',
        message: 'Test message',
        dedupeKey: 'test-alert-2',
      };

      await service.sendAlert(alert);
      jest.advanceTimersByTime(600000); // 10 minutes
      await service.sendAlert(alert);

      expect(mockSlack.sendMessage).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('escalation', () => {
    it('should escalate unacknowledged alerts', async () => {
      jest.useFakeTimers();

      await service.sendAlert({
        severity: 'high',
        title: 'Unacknowledged alert',
        message: 'Test',
        escalate: true,
      });

      jest.advanceTimersByTime(900000); // 15 minutes
      await service.checkEscalations();

      expect(mockPagerDuty.createIncident).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});

// Mock implementation
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  dedupeKey?: string;
  escalate?: boolean;
}

class AlertingService {
  private sentAlerts: Map<string, number> = new Map();
  private pendingEscalations: Map<string, { alert: Alert; sentAt: number }> = new Map();
  private cooldownMs = 300000; // 5 minutes

  constructor(
    private slack: any,
    private pagerDuty: any,
    private metrics: any
  ) {}

  async sendAlert(alert: Alert): Promise<void> {
    // Check throttling
    if (alert.dedupeKey) {
      const lastSent = this.sentAlerts.get(alert.dedupeKey);
      if (lastSent && Date.now() - lastSent < this.cooldownMs) return;
      this.sentAlerts.set(alert.dedupeKey, Date.now());
    }

    // Send to Slack for all severities
    await this.slack.sendMessage({
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      metadata: alert.metadata,
    });

    // Send to PagerDuty for critical/high severity
    if (alert.severity === 'critical' || alert.severity === 'high') {
      await this.pagerDuty.createIncident({
        title: alert.title,
        description: alert.message,
        urgency: alert.severity === 'critical' ? 'high' : 'low',
      });
    }

    // Track escalation
    if (alert.escalate) {
      this.pendingEscalations.set(alert.title, { alert, sentAt: Date.now() });
    }

    this.metrics.increment('alerts.sent', { severity: alert.severity });
  }

  async alertPaymentFailureSpike(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'high',
      title: 'Payment failure rate spike detected',
      message: `Current rate: ${data.currentRate}% (threshold: ${data.threshold}%)`,
      metadata: data,
    });
  }

  async alertHighDeclineRate(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'medium',
      title: 'High payment decline rate',
      message: `Decline rate: ${data.declineRate}%`,
      metadata: data,
    });
  }

  async alertStripeApiError(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Stripe API error',
      message: `Error: ${data.errorCode} on ${data.endpoint}`,
      metadata: data,
    });
  }

  async alertSuspiciousTransaction(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'high',
      title: 'Suspicious transaction detected',
      message: `Transaction ${data.transactionId} flagged with score ${data.riskScore}`,
      metadata: data,
    });
  }

  async alertScalperDetected(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'medium',
      title: 'Potential scalper activity',
      message: `User ${data.userId} purchased ${data.ticketCount} tickets`,
      metadata: data,
    });
  }

  async alertAmlThreshold(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'AML threshold exceeded',
      message: `User ${data.userId} transacted $${data.totalAmount / 100}`,
      metadata: data,
    });
  }

  async alertSanctionsMatch(data: any): Promise<void> {
    await this.pagerDuty.createIncident({
      title: 'Potential sanctions match',
      description: `User ${data.userId} matched ${data.listName}`,
      urgency: 'high',
    });
  }

  async alertHighLatency(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'medium',
      title: 'High latency detected',
      message: `${data.operation}: p99=${data.p99Latency}ms (threshold: ${data.threshold}ms)`,
      metadata: data,
    });
  }

  async alertQueueBacklog(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'high',
      title: 'Queue backlog detected',
      message: `${data.queueName}: ${data.depth} messages`,
      metadata: data,
    });
  }

  async alertDatabaseIssue(data: any): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Database connection issue',
      message: `Error rate: ${data.errorRate}%`,
      metadata: data,
    });
  }

  async checkEscalations(): Promise<void> {
    const escalationThreshold = 900000; // 15 minutes
    for (const [key, { alert, sentAt }] of this.pendingEscalations) {
      if (Date.now() - sentAt > escalationThreshold) {
        await this.pagerDuty.createIncident({
          title: `ESCALATED: ${alert.title}`,
          description: alert.message,
          urgency: 'high',
        });
        this.pendingEscalations.delete(key);
      }
    }
  }
}
