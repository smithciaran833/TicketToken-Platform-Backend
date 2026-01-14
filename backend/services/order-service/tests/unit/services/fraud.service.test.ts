/**
 * Unit Tests: Fraud Service
 * Tests fraud detection and risk assessment
 */

const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/rabbitmq', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { FraudService } from '../../../src/services/fraud.service';
import { publishEvent } from '../../../src/config/rabbitmq';
import { logger } from '../../../src/utils/logger';

describe('FraudService', () => {
  let service: FraudService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });
    service = new FraudService();
  });

  describe('assessOrder', () => {
    const orderDetails = { totalCents: 5000, itemCount: 2 };

    it('should return low risk for normal order', async () => {
      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBeLessThan(25);
      expect(result.requiresReview).toBe(false);
      expect(result.blockRefund).toBe(false);
    });

    it('should detect high velocity hourly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // hourly count
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // daily count
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // chargebacks
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // disputes

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.signals.some(s => s.type === 'HIGH_VELOCITY_HOURLY')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should detect high velocity daily', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // hourly - normal
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // daily - high
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.signals.some(s => s.type === 'HIGH_VELOCITY_DAILY')).toBe(true);
    });

    it('should detect chargeback history', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // chargebacks
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.signals.some(s => s.type === 'CHARGEBACK_HISTORY' && s.severity === 'critical')).toBe(true);
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('should detect single chargeback with medium severity', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.signals.some(s => s.type === 'CHARGEBACK_HISTORY' && s.severity === 'medium')).toBe(true);
    });

    it('should detect high value order', async () => {
      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', { totalCents: 150000, itemCount: 5 });

      expect(result.signals.some(s => s.type === 'HIGH_VALUE_ORDER')).toBe(true);
    });

    it('should detect frequent disputes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // disputes

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.signals.some(s => s.type === 'FREQUENT_DISPUTES')).toBe(true);
    });

    it('should require review at score >= 50', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // high velocity hourly (30)
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // high velocity daily (20)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.riskScore).toBeGreaterThanOrEqual(50);
      expect(result.requiresReview).toBe(true);
      expect(result.riskLevel).toBe('high');
    });

    it('should block refund at score >= 80', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // 30
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // 20
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // 40
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(result.riskScore).toBeGreaterThanOrEqual(80);
      expect(result.blockRefund).toBe(true);
      expect(result.riskLevel).toBe('critical');
    });

    it('should alert fraud team on high risk', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.assessOrder('order-123', 'user-456', 'tenant-789', orderDetails);

      expect(publishEvent).toHaveBeenCalledWith('alert.fraud', expect.any(Object));
      expect(logger.warn).toHaveBeenCalledWith('HIGH FRAUD RISK DETECTED', expect.any(Object));
    });

    it('should cap risk score at 100', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] });

      const result = await service.assessOrder('order-123', 'user-456', 'tenant-789', { totalCents: 500000, itemCount: 10 });

      expect(result.riskScore).toBeLessThanOrEqual(100);
    });
  });

  describe('shouldBlockRefund', () => {
    it('should return blocked when assessment blocks refund', async () => {
      mockQuery.mockResolvedValue({ rows: [{ order_id: 'order-123', user_id: 'user-456', risk_score: 85, risk_level: 'critical', signals: [], requires_review: true, block_refund: true, block_order: false }] });

      const result = await service.shouldBlockRefund('order-123', 'user-456');

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('fraud review');
    });

    it('should return not blocked when no assessment', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.shouldBlockRefund('order-123', 'user-456');

      expect(result.blocked).toBe(false);
    });

    it('should return not blocked when assessment allows', async () => {
      mockQuery.mockResolvedValue({ rows: [{ block_refund: false }] });

      const result = await service.shouldBlockRefund('order-123', 'user-456');

      expect(result.blocked).toBe(false);
    });
  });

  describe('markAsReviewed', () => {
    it('should update assessment with review decision', async () => {
      await service.markAsReviewed('order-123', 'admin-1', 'approved', 'Verified legitimate');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE fraud_assessments'), expect.arrayContaining(['order-123', 'admin-1', 'approved', 'Verified legitimate']));
    });

    it('should clear blocks when approved', async () => {
      await service.markAsReviewed('order-123', 'admin-1', 'approved');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHEN $3 = 'approved' THEN false"), expect.any(Array));
    });
  });
});
