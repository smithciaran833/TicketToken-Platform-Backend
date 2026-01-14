import { ScalperDetectorService } from '../../../../src/services/fraud/scalper-detector.service';
import { SignalType, FraudDecision } from '../../../../src/types';

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn()
  }))
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';

describe('ScalperDetectorService', () => {
  let service: ScalperDetectorService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new ScalperDetectorService();
  });

  describe('detectScalper', () => {
    const validPurchaseData = {
      ipAddress: '192.168.1.1',
      eventId: 'event_1',
      ticketCount: 2
    };

    it('should detect high-velocity scalper with high score', async () => {
      // Mock purchase velocity check - suspicious
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_count: 12,
          unique_events: 5,
          total_tickets: 30
        }]
      });

      // Mock resale patterns check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_resales: 0,
          avg_markup: 0,
          quick_resales: 0
        }]
      });

      // Mock multiple accounts check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 1,
          total_transactions: 1
        }]
      });

      // Mock high demand targeting
      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 0,
          total_purchases: 0,
          avg_tickets_per_purchase: 0
        }]
      });

      // Mock known scalper database
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      // Mock store fraud check
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_1', validPurchaseData, 'device_fp_1');

      expect(result.decision).toBe(FraudDecision.DECLINE);
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].type).toBe(SignalType.RAPID_PURCHASES);
    });

    it('should approve clean user with low risk', async () => {
      // All checks return clean
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_count: 1,
          unique_events: 1,
          total_tickets: 2
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_resales: 0,
          avg_markup: 0,
          quick_resales: 0
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 1,
          total_transactions: 1
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 0,
          total_purchases: 1,
          avg_tickets_per_purchase: 2
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_2', validPurchaseData, 'device_fp_2');

      expect(result.decision).toBe(FraudDecision.APPROVE);
      expect(result.signals).toHaveLength(0);
      expect(result.score).toBeLessThan(0.4);
    });

    it('should detect known scalper from database', async () => {
      // Clean velocity
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_count: 1,
          unique_events: 1,
          total_tickets: 2
        }]
      });

      // Clean resale
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_resales: 0,
          avg_markup: 0,
          quick_resales: 0
        }]
      });

      // Clean multiple accounts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 1,
          total_transactions: 1
        }]
      });

      // Clean targeting
      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 0,
          total_purchases: 1,
          avg_tickets_per_purchase: 2
        }]
      });

      // Known scalper!
      mockQuery.mockResolvedValueOnce({
        rows: [{
          reason: 'Confirmed scalper from previous investigation',
          confidence_score: 0.95,
          added_at: new Date()
        }]
      });

      // Store check
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_3', validPurchaseData, 'device_fp_3');

      expect(result.decision).toBe(FraudDecision.DECLINE);
      expect(result.signals.some(s => s.type === SignalType.KNOWN_SCALPER)).toBe(true);
      expect(result.signals.some(s => s.severity === 'high')).toBe(true);
    });

    it('should flag suspicious resale patterns', async () => {
      // Clean velocity
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_count: 2,
          unique_events: 2,
          total_tickets: 4
        }]
      });

      // Suspicious resale patterns
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_resales: 15,
          avg_markup: 150, // 150% markup!
          quick_resales: 8
        }]
      });

      // Clean multiple accounts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 1,
          total_transactions: 2
        }]
      });

      // Clean targeting
      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 1,
          total_purchases: 2,
          avg_tickets_per_purchase: 2
        }]
      });

      // Not in database
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      // Store check
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_4', validPurchaseData, 'device_fp_4');

      expect(result.signals.some(s => s.type === SignalType.KNOWN_SCALPER)).toBe(true);
      expect(result.decision).not.toBe(FraudDecision.APPROVE);
    });

    it('should detect multiple accounts from same device', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ purchase_count: 1, unique_events: 1, total_tickets: 2 }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ total_resales: 0, avg_markup: 0, quick_resales: 0 }]
      });

      // Multiple accounts!
      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 6,
          total_transactions: 20
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ high_demand_purchases: 0, total_purchases: 1, avg_tickets_per_purchase: 2 }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_5', validPurchaseData, 'device_fp_5');

      expect(result.signals.some(s => s.type === SignalType.MULTIPLE_ACCOUNTS)).toBe(true);
    });

    it('should detect high-demand event targeting', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ purchase_count: 1, unique_events: 1, total_tickets: 2 }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ total_resales: 0, avg_markup: 0, quick_resales: 0 }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ account_count: 1, total_transactions: 1 }]
      });

      // Only buys high-demand events
      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 9,
          total_purchases: 10,
          avg_tickets_per_purchase: 6
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_6', validPurchaseData, 'device_fp_6');

      expect(result.signals.some(s => s.type === SignalType.BOT_BEHAVIOR)).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      // Simulate database error
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.detectScalper('user_7', validPurchaseData, 'device_fp_7');

      // Should still return a result, just with no signals
      expect(result).toBeDefined();
      expect(result.userId).toBe('user_7');
    });

    it('should calculate correct fraud score', async () => {
      // Multiple risk factors
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_count: 8, // Medium risk
          unique_events: 3,
          total_tickets: 15
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_resales: 12,
          avg_markup: 120,
          quick_resales: 6
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          account_count: 3,
          total_transactions: 10
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          high_demand_purchases: 5,
          total_purchases: 6,
          avg_tickets_per_purchase: 5
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const result = await service.detectScalper('user_8', validPurchaseData, 'device_fp_8');

      expect(result.score).toBeGreaterThan(0);
      expect(result.signals.length).toBeGreaterThan(0);
    });
  });

  describe('determineDecision', () => {
    it('should decline for high score', () => {
      const decision = (service as any).determineDecision(0.85, []);
      expect(decision).toBe(FraudDecision.DECLINE);
    });

    it('should decline for high severity signal', () => {
      const signals = [{
        type: SignalType.KNOWN_SCALPER,
        severity: 'high' as const,
        confidence: 0.5,
        details: {}
      }];
      
      const decision = (service as any).determineDecision(0.3, signals);
      expect(decision).toBe(FraudDecision.DECLINE);
    });

    it('should require review for medium-high score', () => {
      const decision = (service as any).determineDecision(0.65, []);
      expect(decision).toBe(FraudDecision.REVIEW);
    });

    it('should challenge for medium score', () => {
      const decision = (service as any).determineDecision(0.5, []);
      expect(decision).toBe(FraudDecision.CHALLENGE);
    });

    it('should approve for low score', () => {
      const decision = (service as any).determineDecision(0.2, []);
      expect(decision).toBe(FraudDecision.APPROVE);
    });
  });

  describe('reportScalper', () => {
    it('should store scalper report', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert report
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // Get count

      await service.reportScalper('reporter_1', 'suspected_1', {
        reason: 'Selling tickets at 500% markup'
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scalper_reports'),
        expect.arrayContaining(['reporter_1', 'suspected_1'])
      );
    });

    it('should trigger manual review after 3 reports', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert report
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 3 }] }); // Count = 3
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert review

      await service.reportScalper('reporter_2', 'suspected_2', {
        reason: 'Bot behavior detected'
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fraud_review_queue'),
        expect.arrayContaining(['suspected_2'])
      );
    });

    it('should not trigger review for fewer than 3 reports', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });

      await service.reportScalper('reporter_3', 'suspected_3', { reason: 'test' });

      // Should only have 2 queries (insert + count), not 3 (no review trigger)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors when reporting', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        service.reportScalper('reporter_4', 'suspected_4', { reason: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('checkPurchaseVelocity', () => {
    it('should detect rapid purchases', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          purchase_count: 12,
          unique_events: 5,
          total_tickets: 30
        }]
      });

      const signal = await (service as any).checkPurchaseVelocity('user_1');

      expect(signal).not.toBeNull();
      expect(signal.type).toBe(SignalType.RAPID_PURCHASES);
      expect(signal.severity).toBe('high');
    });

    it('should return null for normal purchase patterns', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          purchase_count: 2,
          unique_events: 1,
          total_tickets: 4
        }]
      });

      const signal = await (service as any).checkPurchaseVelocity('user_2');

      expect(signal).toBeNull();
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const signal = await (service as any).checkPurchaseVelocity('user_3');

      expect(signal).toBeNull();
    });
  });

  describe('checkResalePatterns', () => {
    it('should detect high markup resales', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          total_resales: 15,
          avg_markup: 250,
          quick_resales: 8
        }]
      });

      const signal = await (service as any).checkResalePatterns('user_1');

      expect(signal).not.toBeNull();
      expect(signal.type).toBe(SignalType.KNOWN_SCALPER);
      expect(signal.severity).toBe('high');
    });

    it('should return null for reasonable resale behavior', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          total_resales: 2,
          avg_markup: 20,
          quick_resales: 0
        }]
      });

      const signal = await (service as any).checkResalePatterns('user_2');

      expect(signal).toBeNull();
    });
  });

  describe('checkMultipleAccounts', () => {
    it('should detect multiple accounts on same device', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          account_count: 6,
          total_transactions: 25
        }]
      });

      const signal = await (service as any).checkMultipleAccounts('device_fp_1');

      expect(signal).not.toBeNull();
      expect(signal.type).toBe(SignalType.MULTIPLE_ACCOUNTS);
      expect(signal.severity).toBe('high');
    });

    it('should allow reasonable number of accounts', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          account_count: 2,
          total_transactions: 5
        }]
      });

      const signal = await (service as any).checkMultipleAccounts('device_fp_2');

      expect(signal).toBeNull();
    });
  });

  describe('checkHighDemandTargeting', () => {
    it('should detect exclusive high-demand targeting', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          high_demand_purchases: 9,
          total_purchases: 10,
          avg_tickets_per_purchase: 8
        }]
      });

      const signal = await (service as any).checkHighDemandTargeting('user_1');

      expect(signal).not.toBeNull();
      expect(signal.type).toBe(SignalType.BOT_BEHAVIOR);
    });

    it('should allow mixed event purchases', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          high_demand_purchases: 3,
          total_purchases: 10,
          avg_tickets_per_purchase: 2
        }]
      });

      const signal = await (service as any).checkHighDemandTargeting('user_2');

      expect(signal).toBeNull();
    });
  });

  describe('checkKnownScalperDatabase', () => {
    it('should identify known scalpers', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          reason: 'Previous investigation confirmed',
          confidence_score: 0.95,
          added_at: new Date()
        }]
      });

      const signal = await (service as any).checkKnownScalperDatabase('user_1', 'device_1');

      expect(signal).not.toBeNull();
      expect(signal.type).toBe(SignalType.KNOWN_SCALPER);
      expect(signal.severity).toBe('high');
    });

    it('should return null for clean users', async () => {
      mockQuery.mockResolvedValue({
        rows: []
      });

      const signal = await (service as any).checkKnownScalperDatabase('user_2', 'device_2');

      expect(signal).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database responses', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const signal = await (service as any).checkPurchaseVelocity('user_1');

      expect(signal).toBeNull();
    });

    it('should handle null values in database', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          purchase_count: null,
          unique_events: null,
          total_tickets: null
        }]
      });

      const signal = await (service as any).checkPurchaseVelocity('user_1');

      // Should handle gracefully
      expect(signal).toBeNull();
    });

    it('should handle very high confidence scores', async () => {
      const decision = (service as any).determineDecision(1.5, []);
      expect(decision).toBe(FraudDecision.DECLINE);
    });

    it('should handle negative scores', async () => {
      const decision = (service as any).determineDecision(-0.1, []);
      expect(decision).toBe(FraudDecision.APPROVE);
    });
  });
});
