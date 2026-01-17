/**
 * Customer Analytics Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockSelect = jest.fn().mockReturnThis();
const mockJoin = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockWhereNotNull = jest.fn().mockReturnThis();
const mockGroupBy = jest.fn().mockReturnThis();
const mockHavingRaw = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn();
const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  select: mockSelect,
  join: mockJoin,
  where: mockWhere,
  whereNotNull: mockWhereNotNull,
  groupBy: mockGroupBy,
  havingRaw: mockHavingRaw,
  orderBy: mockOrderBy,
}));

mockDb.raw = mockRaw;

jest.mock('../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

import { CustomerAnalytics } from '../../src/analytics-engine/calculators/customer-analytics';
import { logger } from '../../src/utils/logger';

describe('CustomerAnalytics', () => {
  let analytics: CustomerAnalytics;
  const validVenueId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    analytics = new CustomerAnalytics();

    // Reset mock chain - make everything chainable
    mockSelect.mockReturnThis();
    mockJoin.mockReturnThis();
    mockWhere.mockReturnThis();
    mockWhereNotNull.mockReturnThis();
    mockGroupBy.mockReturnThis();
    mockHavingRaw.mockReturnThis();
    mockOrderBy.mockResolvedValue([]);
  });

  describe('validateVenueId', () => {
    it('should throw for empty venue ID', () => {
      expect(() => (analytics as any).validateVenueId('')).toThrow('Invalid venue ID');
    });

    it('should throw for null venue ID', () => {
      expect(() => (analytics as any).validateVenueId(null)).toThrow('Invalid venue ID');
    });

    it('should throw for short venue ID', () => {
      expect(() => (analytics as any).validateVenueId('short')).toThrow('must be at least');
    });

    it('should accept valid venue ID', () => {
      expect(() => (analytics as any).validateVenueId(validVenueId)).not.toThrow();
    });
  });

  describe('validateDaysThreshold', () => {
    it('should throw for non-integer', () => {
      expect(() => (analytics as any).validateDaysThreshold(30.5)).toThrow('must be an integer');
    });

    it('should throw for value below minimum', () => {
      expect(() => (analytics as any).validateDaysThreshold(0)).toThrow('must be between');
    });

    it('should throw for value above maximum', () => {
      expect(() => (analytics as any).validateDaysThreshold(1000)).toThrow('must be between');
    });

    it('should accept valid days threshold', () => {
      expect(() => (analytics as any).validateDaysThreshold(90)).not.toThrow();
    });
  });

  describe('safeDivide', () => {
    it('should return default for zero denominator', () => {
      expect((analytics as any).safeDivide(100, 0)).toBe(0);
    });

    it('should return default for infinite denominator', () => {
      expect((analytics as any).safeDivide(100, Infinity)).toBe(0);
    });

    it('should perform normal division', () => {
      expect((analytics as any).safeDivide(100, 4)).toBe(25);
    });

    it('should use custom default value', () => {
      expect((analytics as any).safeDivide(100, 0, -1)).toBe(-1);
    });
  });

  describe('clamp', () => {
    it('should clamp value below minimum', () => {
      expect((analytics as any).clamp(-10, 0, 100)).toBe(0);
    });

    it('should clamp value above maximum', () => {
      expect((analytics as any).clamp(150, 0, 100)).toBe(100);
    });

    it('should return value within range', () => {
      expect((analytics as any).clamp(50, 0, 100)).toBe(50);
    });
  });

  describe('calculateCustomerLifetimeValue', () => {
    it('should return empty result when no customers found', async () => {
      mockGroupBy.mockResolvedValueOnce([]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(0);
      expect(result.averageClv).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('No customer data found for venue', { venueId: validVenueId });
    });

    it('should calculate CLV metrics correctly', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      mockGroupBy.mockResolvedValueOnce([
        { user_id: 'u1', purchase_count: 5, total_revenue: '500', first_purchase: thirtyDaysAgo, last_purchase: now },
        { user_id: 'u2', purchase_count: 3, total_revenue: '300', first_purchase: thirtyDaysAgo, last_purchase: now },
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(2);
      expect(result.averageClv).toBe(400); // (500 + 300) / 2
    });

    it('should segment customers correctly', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      mockGroupBy.mockResolvedValueOnce([
        { user_id: 'u1', purchase_count: 10, total_revenue: '1000', first_purchase: pastDate, last_purchase: now },
        { user_id: 'u2', purchase_count: 2, total_revenue: '100', first_purchase: pastDate, last_purchase: now },
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.segments.high.count).toBeGreaterThanOrEqual(0);
      expect(result.segments.medium.count).toBeGreaterThanOrEqual(0);
      expect(result.segments.low.count).toBeGreaterThanOrEqual(0);
    });

    it('should log calculation completion', async () => {
      mockGroupBy.mockResolvedValueOnce([
        { user_id: 'u1', purchase_count: 1, total_revenue: '100', first_purchase: new Date(), last_purchase: new Date() },
      ]);

      await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(logger.info).toHaveBeenCalledWith('CLV calculation completed', expect.any(Object));
    });
  });

  describe('identifyChurnRisk', () => {
    it('should validate venue ID', async () => {
      await expect(analytics.identifyChurnRisk('short')).rejects.toThrow('Invalid venue ID');
    });

    it('should validate days threshold', async () => {
      await expect(analytics.identifyChurnRisk(validVenueId, 0)).rejects.toThrow('must be between');
    });

    it('should categorize risk levels correctly', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);

      mockOrderBy.mockResolvedValueOnce([
        { user_id: 'u1', last_purchase: oldDate, total_purchases: '2', avg_order_value: '50' },
        { user_id: 'u2', last_purchase: oldDate, total_purchases: '10', avg_order_value: '150' },
      ]);

      const result = await analytics.identifyChurnRisk(validVenueId, 90);

      expect(result.totalAtRisk).toBe(2);
      expect(result.highRisk).toBeDefined();
      expect(result.mediumRisk).toBeDefined();
      expect(result.lowRisk).toBeDefined();
    });

    it('should calculate risk score within bounds', async () => {
      const now = new Date();
      const veryOldDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      mockOrderBy.mockResolvedValueOnce([
        { user_id: 'u1', last_purchase: veryOldDate, total_purchases: '1', avg_order_value: '10' },
      ]);

      const result = await analytics.identifyChurnRisk(validVenueId, 90);

      result.highRisk.concat(result.mediumRisk, result.lowRisk).forEach((customer: any) => {
        expect(customer.riskScore).toBeGreaterThanOrEqual(0);
        expect(customer.riskScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('calculateCustomerSegmentation', () => {
    it('should return empty array when no customers found', async () => {
      mockRaw.mockResolvedValueOnce({ rows: [] });

      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith('No customer data found for segmentation', { venueId: validVenueId });
    });

    it('should categorize RFM segments', async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', rfm_segment: '555', monetary_value: '1000', recency_score: 5 },
          { user_id: 'u2', rfm_segment: '111', monetary_value: '50', recency_score: 1 },
          { user_id: 'u3', rfm_segment: '345', monetary_value: '300', recency_score: 3 },
        ],
      });

      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((segment: any) => {
        expect(segment).toHaveProperty('segment');
        expect(segment).toHaveProperty('count');
        expect(segment).toHaveProperty('avgValue');
        expect(segment).toHaveProperty('characteristics');
      });
    });

    it('should log completion with customer count', async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', rfm_segment: '555', monetary_value: '1000', recency_score: 5 },
        ],
      });

      await analytics.calculateCustomerSegmentation(validVenueId);

      expect(logger.info).toHaveBeenCalledWith('Customer segmentation completed', expect.objectContaining({
        venueId: validVenueId,
        totalCustomers: 1,
      }));
    });
  });

  describe('getSegmentCharacteristics', () => {
    it('should return characteristics for known segments', () => {
      const segments = ['champions', 'loyalCustomers', 'potentialLoyalists', 'newCustomers', 'atRisk', 'cantLose', 'hibernating'];

      segments.forEach((segment) => {
        const chars = (analytics as any).getSegmentCharacteristics(segment);
        expect(chars).not.toBe('Unknown segment');
      });
    });

    it('should return unknown for undefined segment', () => {
      const chars = (analytics as any).getSegmentCharacteristics('nonexistent');
      expect(chars).toBe('Unknown segment');
    });
  });
});
