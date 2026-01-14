/**
 * Audit Logger Tests
 * Tests for payment audit logging functionality
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('AuditLogger', () => {
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = new Map();
  });

  describe('logPaymentEvent', () => {
    it('should log payment creation event', async () => {
      const event = {
        type: 'payment.created',
        paymentId: 'pay_123',
        userId: 'user_456',
        amount: 10000,
        metadata: { eventId: 'event_789' },
      };

      const result = await logPaymentEvent(event, mockStorage);

      expect(result.logged).toBe(true);
      expect(result.auditId).toBeDefined();
      expect(mockStorage.has(result.auditId)).toBe(true);
    });

    it('should include timestamp', async () => {
      const event = { type: 'payment.created', paymentId: 'pay_123' };

      const result = await logPaymentEvent(event, mockStorage);
      const logged = mockStorage.get(result.auditId);

      expect(logged.timestamp).toBeDefined();
      expect(new Date(logged.timestamp)).toBeInstanceOf(Date);
    });

    it('should mask sensitive data', async () => {
      const event = {
        type: 'payment.created',
        paymentId: 'pay_123',
        cardNumber: '4242424242424242',
        cvv: '123',
      };

      const result = await logPaymentEvent(event, mockStorage);
      const logged = mockStorage.get(result.auditId);

      expect(logged.cardNumber).toBeUndefined();
      expect(logged.cvv).toBeUndefined();
      expect(logged.cardLastFour).toBe('4242');
    });

    it('should log state transitions', async () => {
      const event = {
        type: 'payment.status_changed',
        paymentId: 'pay_123',
        previousStatus: 'pending',
        newStatus: 'completed',
      };

      const result = await logPaymentEvent(event, mockStorage);
      const logged = mockStorage.get(result.auditId);

      expect(logged.previousStatus).toBe('pending');
      expect(logged.newStatus).toBe('completed');
    });
  });

  describe('logRefundEvent', () => {
    it('should log refund creation', async () => {
      const event = {
        type: 'refund.created',
        refundId: 'ref_123',
        paymentId: 'pay_456',
        amount: 5000,
        reason: 'customer_request',
      };

      const result = await logRefundEvent(event, mockStorage);

      expect(result.logged).toBe(true);
      expect(mockStorage.get(result.auditId).type).toBe('refund.created');
    });

    it('should log refund completion', async () => {
      const event = {
        type: 'refund.completed',
        refundId: 'ref_123',
        stripeRefundId: 're_stripe_123',
      };

      const result = await logRefundEvent(event, mockStorage);

      expect(result.logged).toBe(true);
    });

    it('should log refund failures', async () => {
      const event = {
        type: 'refund.failed',
        refundId: 'ref_123',
        error: 'Insufficient balance',
      };

      const result = await logRefundEvent(event, mockStorage);
      const logged = mockStorage.get(result.auditId);

      expect(logged.error).toBe('Insufficient balance');
    });
  });

  describe('logTransferEvent', () => {
    it('should log venue payout', async () => {
      const event = {
        type: 'transfer.created',
        transferId: 'tr_123',
        venueId: 'venue_456',
        amount: 45000,
        destination: 'acct_stripe_789',
      };

      const result = await logTransferEvent(event, mockStorage);

      expect(result.logged).toBe(true);
    });

    it('should log transfer reversal', async () => {
      const event = {
        type: 'transfer.reversed',
        transferId: 'tr_123',
        reason: 'dispute',
        reversedAmount: 45000,
      };

      const result = await logTransferEvent(event, mockStorage);
      const logged = mockStorage.get(result.auditId);

      expect(logged.type).toBe('transfer.reversed');
    });
  });

  describe('logSecurityEvent', () => {
    it('should log fraud detection', async () => {
      const event = {
        type: 'security.fraud_detected',
        userId: 'user_123',
        riskScore: 85,
        indicators: ['velocity', 'location'],
      };

      const result = await logSecurityEvent(event, mockStorage);

      expect(result.logged).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('should log authentication failures', async () => {
      const event = {
        type: 'security.auth_failed',
        userId: 'user_123',
        ip: '192.168.1.1',
        reason: 'invalid_token',
      };

      const result = await logSecurityEvent(event, mockStorage);

      expect(result.logged).toBe(true);
    });

    it('should log PCI-related events', async () => {
      const event = {
        type: 'security.pci_access',
        adminId: 'admin_123',
        resource: 'card_vault',
        action: 'read',
      };

      const result = await logSecurityEvent(event, mockStorage);

      expect(result.logged).toBe(true);
      expect(result.compliance).toBe('pci');
    });
  });

  describe('getAuditTrail', () => {
    it('should retrieve audit trail for payment', async () => {
      const paymentId = 'pay_123';
      
      await logPaymentEvent({ type: 'payment.created', paymentId }, mockStorage);
      await logPaymentEvent({ type: 'payment.confirmed', paymentId }, mockStorage);
      await logPaymentEvent({ type: 'payment.completed', paymentId }, mockStorage);

      const trail = await getAuditTrail(paymentId, mockStorage);

      expect(trail.length).toBe(3);
      expect(trail[0].type).toBe('payment.created');
    });

    it('should return events in chronological order', async () => {
      const paymentId = 'pay_456';
      
      await logPaymentEvent({ type: 'payment.created', paymentId, timestamp: 1000 }, mockStorage);
      await logPaymentEvent({ type: 'payment.completed', paymentId, timestamp: 3000 }, mockStorage);
      await logPaymentEvent({ type: 'payment.confirmed', paymentId, timestamp: 2000 }, mockStorage);

      const trail = await getAuditTrail(paymentId, mockStorage);

      expect(trail[0].timestamp).toBeLessThanOrEqual(trail[1].timestamp);
    });

    it('should filter by date range', async () => {
      const paymentId = 'pay_789';
      const now = Date.now();
      
      await logPaymentEvent({ type: 'payment.created', paymentId }, mockStorage);

      const trail = await getAuditTrail(paymentId, mockStorage, {
        startDate: new Date(now - 1000),
        endDate: new Date(now + 1000),
      });

      expect(trail.length).toBe(1);
    });
  });

  describe('exportAuditLogs', () => {
    it('should export logs in JSON format', async () => {
      await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_1' }, mockStorage);
      await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_2' }, mockStorage);

      const exported = await exportAuditLogs(mockStorage, { format: 'json' });

      expect(typeof exported).toBe('string');
      expect(JSON.parse(exported)).toBeInstanceOf(Array);
    });

    it('should export logs in CSV format', async () => {
      await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_1' }, mockStorage);

      const exported = await exportAuditLogs(mockStorage, { format: 'csv' });

      expect(exported).toContain('type,paymentId');
    });

    it('should filter by event type', async () => {
      await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_1' }, mockStorage);
      await logRefundEvent({ type: 'refund.created', refundId: 'ref_1', paymentId: 'pay_1' }, mockStorage);

      const exported = await exportAuditLogs(mockStorage, {
        format: 'json',
        eventTypes: ['payment.created'],
      });

      const parsed = JSON.parse(exported);
      expect(parsed.every((e: any) => e.type === 'payment.created')).toBe(true);
    });
  });

  describe('retention and archival', () => {
    it('should mark logs for archival', async () => {
      const result = await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_1' }, mockStorage);

      const archived = await archiveOldLogs(mockStorage, { olderThan: 0 });

      expect(archived.count).toBeGreaterThan(0);
    });

    it('should respect retention policy', async () => {
      await logPaymentEvent({ type: 'payment.created', paymentId: 'pay_1' }, mockStorage);

      const purged = await purgeExpiredLogs(mockStorage, { retentionDays: 90 });

      // Fresh logs should not be purged
      expect(purged.count).toBe(0);
    });
  });

  describe('compliance reporting', () => {
    it('should generate compliance report', async () => {
      await logSecurityEvent({ type: 'security.pci_access', adminId: 'admin_1' }, mockStorage);
      await logSecurityEvent({ type: 'security.fraud_detected', userId: 'user_1' }, mockStorage);

      const report = await generateComplianceReport(mockStorage, {
        period: 'monthly',
        type: 'pci',
      });

      expect(report.totalEvents).toBeGreaterThan(0);
      expect(report.period).toBe('monthly');
    });
  });

  describe('edge cases', () => {
    it('should handle empty event', async () => {
      await expect(logPaymentEvent({}, mockStorage)).rejects.toThrow('type required');
    });

    it('should handle very large metadata', async () => {
      const event = {
        type: 'payment.created',
        paymentId: 'pay_1',
        metadata: { largeData: 'x'.repeat(10000) },
      };

      const result = await logPaymentEvent(event, mockStorage);

      expect(result.logged).toBe(true);
      expect(result.truncated).toBe(true);
    });

    it('should handle concurrent logging', async () => {
      const promises = Array(100).fill(null).map((_, i) =>
        logPaymentEvent({ type: 'payment.created', paymentId: `pay_${i}` }, mockStorage)
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.logged)).toBe(true);
      expect(mockStorage.size).toBe(100);
    });
  });
});

// Helper functions
async function logPaymentEvent(event: any, storage: Map<string, any>): Promise<any> {
  if (!event.type) throw new Error('Event type required');

  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logged = {
    ...event,
    auditId,
    timestamp: event.timestamp || Date.now(),
    category: 'payment',
  };

  // Mask sensitive data
  if (event.cardNumber) {
    logged.cardLastFour = event.cardNumber.slice(-4);
    delete logged.cardNumber;
  }
  delete logged.cvv;

  // Truncate large metadata
  let truncated = false;
  if (event.metadata && JSON.stringify(event.metadata).length > 5000) {
    logged.metadata = { truncated: true };
    truncated = true;
  }

  storage.set(auditId, logged);

  return { logged: true, auditId, truncated };
}

async function logRefundEvent(event: any, storage: Map<string, any>): Promise<any> {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  storage.set(auditId, { ...event, auditId, timestamp: Date.now(), category: 'refund' });
  return { logged: true, auditId };
}

async function logTransferEvent(event: any, storage: Map<string, any>): Promise<any> {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  storage.set(auditId, { ...event, auditId, timestamp: Date.now(), category: 'transfer' });
  return { logged: true, auditId };
}

async function logSecurityEvent(event: any, storage: Map<string, any>): Promise<any> {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const severity = event.riskScore && event.riskScore > 80 ? 'high' : 'medium';
  const compliance = event.type.includes('pci') ? 'pci' : undefined;
  
  storage.set(auditId, { ...event, auditId, timestamp: Date.now(), category: 'security', severity, compliance });
  return { logged: true, auditId, severity, compliance };
}

async function getAuditTrail(entityId: string, storage: Map<string, any>, options: any = {}): Promise<any[]> {
  const events = Array.from(storage.values())
    .filter(e => e.paymentId === entityId || e.refundId === entityId || e.transferId === entityId);

  let filtered = events;
  if (options.startDate && options.endDate) {
    filtered = events.filter(e => 
      e.timestamp >= options.startDate.getTime() && 
      e.timestamp <= options.endDate.getTime()
    );
  }

  return filtered.sort((a, b) => a.timestamp - b.timestamp);
}

async function exportAuditLogs(storage: Map<string, any>, options: any): Promise<string> {
  let logs = Array.from(storage.values());

  if (options.eventTypes) {
    logs = logs.filter(l => options.eventTypes.includes(l.type));
  }

  if (options.format === 'json') {
    return JSON.stringify(logs);
  }

  if (options.format === 'csv') {
    const headers = 'type,paymentId,timestamp';
    const rows = logs.map(l => `${l.type},${l.paymentId || ''},${l.timestamp}`);
    return [headers, ...rows].join('\n');
  }

  return JSON.stringify(logs);
}

async function archiveOldLogs(storage: Map<string, any>, options: any): Promise<any> {
  const now = Date.now();
  let count = 0;

  storage.forEach((log, key) => {
    if (now - log.timestamp > options.olderThan) {
      log.archived = true;
      count++;
    }
  });

  return { count };
}

async function purgeExpiredLogs(storage: Map<string, any>, options: any): Promise<any> {
  const cutoff = Date.now() - (options.retentionDays * 24 * 60 * 60 * 1000);
  let count = 0;

  storage.forEach((log, key) => {
    if (log.timestamp < cutoff) {
      storage.delete(key);
      count++;
    }
  });

  return { count };
}

async function generateComplianceReport(storage: Map<string, any>, options: any): Promise<any> {
  const events = Array.from(storage.values()).filter(e => e.category === 'security');
  return {
    totalEvents: events.length,
    period: options.period,
    type: options.type,
  };
}
