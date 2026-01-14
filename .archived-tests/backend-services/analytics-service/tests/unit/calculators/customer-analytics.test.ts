import { CustomerAnalytics } from '../../../src/analytics-engine/calculators/customer-analytics';

// Mock the database functions
const mockMainDb = {
  select: jest.fn().mockReturnThis(),
  raw: jest.fn(),
  join: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereNotNull: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  havingRaw: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockMainDb),
}));

describe('CustomerAnalytics', () => {
  let analytics: CustomerAnalytics;
  const validVenueId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(() => {
    analytics = new CustomerAnalytics();
    jest.clearAllMocks();
  });

  describe('calculateCustomerLifetimeValue', () => {
    it('should calculate CLV correctly with valid data', async () => {
      mockMainDb.groupBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          purchase_count: 5,
          total_revenue: '1000.00',
          first_purchase: new Date('2024-01-01'),
          last_purchase: new Date('2024-06-01')
        },
        {
          user_id: 'user2',
          purchase_count: 10,
          total_revenue: '2000.00',
          first_purchase: new Date('2024-01-01'),
          last_purchase: new Date('2024-12-01')
        }
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(2);
      expect(result.averageClv).toBe(1500); // (1000 + 2000) / 2
      expect(result.segments.high.count).toBeGreaterThanOrEqual(0);
      expect(result.segments.medium.count).toBeGreaterThanOrEqual(0);
      expect(result.segments.low.count).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty customer data', async () => {
      mockMainDb.groupBy.mockResolvedValueOnce([]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(0);
      expect(result.averageClv).toBe(0);
      expect(result.segments.high.count).toBe(0);
      expect(result.segments.medium.count).toBe(0);
      expect(result.segments.low.count).toBe(0);
    });

    it('should throw error for invalid venue ID', async () => {
      await expect(
        analytics.calculateCustomerLifetimeValue('invalid')
      ).rejects.toThrow('Invalid venue ID');
    });

    it('should throw error for empty venue ID', async () => {
      await expect(
        analytics.calculateCustomerLifetimeValue('')
      ).rejects.toThrow('Invalid venue ID');
    });

    it('should handle single customer correctly', async () => {
      mockMainDb.groupBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          purchase_count: 3,
          total_revenue: '500.00',
          first_purchase: new Date('2024-01-01'),
          last_purchase: new Date('2024-03-01')
        }
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(1);
      expect(result.averageClv).toBe(500);
    });

    it('should handle customers with same day purchases (zero lifespan)', async () => {
      mockMainDb.groupBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          purchase_count: 2,
          total_revenue: '200.00',
          first_purchase: new Date('2024-01-01'),
          last_purchase: new Date('2024-01-01') // Same day
        }
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      // Should handle minimum lifespan of 1 day
      expect(result.totalCustomers).toBe(1);
      expect(result.averageClv).toBe(200);
    });
  });

  describe('identifyChurnRisk', () => {
    it('should identify at-risk customers correctly', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      mockMainDb.orderBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          last_purchase: pastDate,
          total_purchases: 3,
          avg_order_value: '50.00'
        },
        {
          user_id: 'user2',
          last_purchase: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000),
          total_purchases: 10,
          avg_order_value: '200.00'
        }
      ]);

      const result = await analytics.identifyChurnRisk(validVenueId, 90);

      expect(result.totalAtRisk).toBe(2);
      expect(result.highRisk.length + result.mediumRisk.length + result.lowRisk.length).toBe(2);
    });

    it('should throw error for invalid days threshold', async () => {
      await expect(
        analytics.identifyChurnRisk(validVenueId, 0)
      ).rejects.toThrow('Invalid days threshold');
    });

    it('should throw error for days threshold over 730', async () => {
      await expect(
        analytics.identifyChurnRisk(validVenueId, 731)
      ).rejects.toThrow('Invalid days threshold');
    });

    it('should throw error for non-integer days threshold', async () => {
      await expect(
        analytics.identifyChurnRisk(validVenueId, 90.5)
      ).rejects.toThrow('Invalid days threshold: must be an integer');
    });

    it('should calculate risk scores correctly', async () => {
      const now = new Date();
      
      mockMainDb.orderBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          last_purchase: new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000),
          total_purchases: 15, // High purchase history
          avg_order_value: '150.00' // High order value
        }
      ]);

      const result = await analytics.identifyChurnRisk(validVenueId, 90);

      // Customer with many purchases and high value should have lower risk
      expect(result.highRisk.length).toBeLessThanOrEqual(result.lowRisk.length + result.mediumRisk.length);
    });

    it('should clamp risk scores between 0 and 100', async () => {
      const now = new Date();
      
      mockMainDb.orderBy.mockResolvedValueOnce([
        {
          user_id: 'user1',
          last_purchase: new Date(now.getTime() - 1000 * 24 * 60 * 60 * 1000), // Very old
          total_purchases: 1,
          avg_order_value: '10.00'
        }
      ]);

      const result = await analytics.identifyChurnRisk(validVenueId, 90);

      result.highRisk.forEach((customer: any) => {
        expect(customer.riskScore).toBeGreaterThanOrEqual(0);
        expect(customer.riskScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('calculateCustomerSegmentation', () => {
    it('should segment customers using RFM analysis', async () => {
      mockMainDb.raw.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user1',
            recency_days: 5,
            purchase_frequency: 10,
            monetary_value: '1000.00',
            recency_score: 5,
            frequency_score: 5,
            monetary_score: 5,
            rfm_segment: '555' // Champion
          },
          {
            user_id: 'user2',
            recency_days: 30,
            purchase_frequency: 3,
            monetary_value: '200.00',
            recency_score: 3,
            frequency_score: 3,
            monetary_score: 3,
            rfm_segment: '333' // Loyal customer
          },
          {
            user_id: 'user3',
            recency_days: 200,
            purchase_frequency: 1,
            monetary_value: '50.00',
            recency_score: 1,
            frequency_score: 1,
            monetary_score: 1,
            rfm_segment: '111' // Hibernating
          }
        ]
      });

      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      
      // Check that segments have correct structure
      result.forEach((segment: any) => {
        expect(segment).toHaveProperty('segment');
        expect(segment).toHaveProperty('count');
        expect(segment).toHaveProperty('avgValue');
        expect(segment).toHaveProperty('characteristics');
      });
    });

    it('should handle empty customer data', async () => {
      mockMainDb.raw.mockResolvedValueOnce({
        rows: []
      });

      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      expect(result).toEqual([]);
    });

    it('should throw error for invalid venue ID', async () => {
      await expect(
        analytics.calculateCustomerSegmentation('invalid')
      ).rejects.toThrow('Invalid venue ID');
    });

    it('should validate RFM scores are within 1-5 range', async () => {
      mockMainDb.raw.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user1',
            recency_days: 5,
            purchase_frequency: 10,
            monetary_value: '1000.00',
            recency_score: 6, // Invalid - should trigger warning
            frequency_score: 5,
            monetary_score: 5,
            rfm_segment: '655'
          }
        ]
      });

      // Should not throw, but should log warning
      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      expect(result).toBeDefined();
    });

    it('should handle NaN monetary values', async () => {
      mockMainDb.raw.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user1',
            recency_days: 5,
            purchase_frequency: 10,
            monetary_value: 'invalid', // Will become NaN
            recency_score: 5,
            frequency_score: 5,
            monetary_score: 5,
            rfm_segment: '555'
          }
        ]
      });

      const result = await analytics.calculateCustomerSegmentation(validVenueId);

      // Should handle gracefully with safe parsing
      result.forEach((segment: any) => {
        expect(segment.avgValue).toBeGreaterThanOrEqual(0);
        expect(isFinite(segment.avgValue)).toBe(true);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very large customer counts', async () => {
      const largeCustomerSet = Array.from({ length: 10000 }, (_, i) => ({
        user_id: `user${i}`,
        purchase_count: Math.floor(Math.random() * 20) + 1,
        total_revenue: (Math.random() * 5000).toFixed(2),
        first_purchase: new Date('2024-01-01'),
        last_purchase: new Date('2024-12-01')
      }));

      mockMainDb.groupBy.mockResolvedValueOnce(largeCustomerSet);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.totalCustomers).toBe(10000);
      expect(result.averageClv).toBeGreaterThan(0);
    });

    it('should handle customers with extreme revenue values', async () => {
      mockMainDb.groupBy.mockResolvedValueOnce([
        {
          user_id: 'whale',
          purchase_count: 100,
          total_revenue: '999999.99',
          first_purchase: new Date('2024-01-01'),
          last_purchase: new Date('2024-12-01')
        }
      ]);

      const result = await analytics.calculateCustomerLifetimeValue(validVenueId);

      expect(result.averageClv).toBe(999999.99);
      expect(result.segments.high.count).toBe(1);
    });
  });
});
