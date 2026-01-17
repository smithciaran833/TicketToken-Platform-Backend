/**
 * Customer Insights Service Unit Tests
 */

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockDb = { raw: jest.fn() };

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedis));

jest.mock('../../../src/errors', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

import { CustomerInsightsService, customerInsightsService } from '../../../src/services/customer-insights.service';

describe('CustomerInsightsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CustomerInsightsService.getInstance();
      const instance2 = CustomerInsightsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getCustomerProfile', () => {
    it('should return cached profile when available', async () => {
      const cachedProfile = { id: 'user-123', email: 'test@example.com' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedProfile));

      const result = await customerInsightsService.getCustomerProfile('user-123', 'tenant-123');

      expect(result).toEqual(cachedProfile);
      expect(mockLogger.debug).toHaveBeenCalledWith('Customer profile cache hit', { userId: 'user-123' });
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.getCustomerProfile('user-123', ''))
        .rejects.toThrow('Tenant ID is required');
    });

    it('should fetch from database when not cached', async () => {
      mockRedis.get.mockResolvedValue(null);

      const profileData = {
        id: 'user-123', email: 'test@example.com', first_name: 'John', last_name: 'Doe',
        customer_since: new Date(), total_orders: 5, lifetime_value: 500, avg_order_value: 100,
        unique_venues: 2, unique_events: 3, last_purchase_date: new Date(), first_purchase_date: new Date(),
      };
      const rfmData = { recency_score: 4, frequency_score: 3, monetary_score: 5, total_score: 12, segment: 'VIP', churn_risk: 'low', days_since_last_purchase: 15, calculated_at: new Date() };
      const clvData = { clv: 1500, predicted_clv_12_months: 600, predicted_clv_24_months: 1200, churn_probability: 0.1 };

      mockDb.raw
        .mockResolvedValueOnce({ rows: [profileData] })
        .mockResolvedValueOnce({ rows: [rfmData] })
        .mockResolvedValueOnce({ rows: [clvData] });

      const result = await customerInsightsService.getCustomerProfile('user-123', 'tenant-123');

      expect(result).toEqual(expect.objectContaining({ id: 'user-123', email: 'test@example.com', rfm: rfmData, clv: clvData }));
      expect(mockRedis.setex).toHaveBeenCalledWith(expect.stringContaining('tenant-123'), 3600, expect.any(String));
    });

    it('should return null when profile not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.raw.mockResolvedValue({ rows: [] });
      const result = await customerInsightsService.getCustomerProfile('nonexistent', 'tenant-123');
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.raw.mockRejectedValue(new Error('Database error'));
      await expect(customerInsightsService.getCustomerProfile('user-123', 'tenant-123')).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('segmentCustomers', () => {
    it('should return cached segments when available', async () => {
      const cachedSegments = [{ segment: 'VIP', customer_count: 100 }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSegments));

      const result = await customerInsightsService.segmentCustomers('venue-123', 'tenant-123');

      expect(result).toEqual(cachedSegments);
      expect(mockLogger.debug).toHaveBeenCalledWith('Customer segments cache hit', { venueId: 'venue-123' });
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.segmentCustomers('venue-123', '')).rejects.toThrow('Tenant ID is required');
    });

    it('should fetch segments from database and cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      const segments = [{ segment: 'VIP', customer_count: 100, total_lifetime_value: 50000, avg_order_value: 150, avg_lifetime_value: 500, avg_purchase_frequency: 5, last_calculated_at: new Date() }];
      mockDb.raw.mockResolvedValue({ rows: segments });

      const result = await customerInsightsService.segmentCustomers('venue-123', 'tenant-123');

      expect(result).toEqual(segments);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should trigger recalculation when data is stale', async () => {
      mockRedis.get.mockResolvedValue(null);
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const segments = [{ segment: 'VIP', customer_count: 100, last_calculated_at: staleDate }];
      mockDb.raw.mockResolvedValue({ rows: segments });

      await customerInsightsService.segmentCustomers('venue-123', 'tenant-123');

      expect(mockLogger.info).toHaveBeenCalledWith('Segment data is stale, triggering recalculation', expect.any(Object));
    });
  });

  describe('getRFMScores', () => {
    it('should return RFM scores for venue', async () => {
      const rfmScores = [
        { customer_id: 'c-1', total_score: 15, segment: 'Champions' },
        { customer_id: 'c-2', total_score: 12, segment: 'Loyal' },
      ];
      mockDb.raw.mockResolvedValue({ rows: rfmScores });

      const result = await customerInsightsService.getRFMScores('venue-123');
      expect(result).toEqual(rfmScores);
    });

    it('should filter by segment when specified', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });
      await customerInsightsService.getRFMScores('venue-123', { segment: 'VIP' });
      expect(mockDb.raw).toHaveBeenCalledWith(expect.stringContaining('AND segment = ?'), expect.arrayContaining(['venue-123', 'VIP']));
    });

    it('should filter by minScore when specified', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });
      await customerInsightsService.getRFMScores('venue-123', { minScore: 10 });
      expect(mockDb.raw).toHaveBeenCalledWith(expect.stringContaining('AND total_score >= ?'), expect.arrayContaining(['venue-123', 10]));
    });

    it('should apply limit when specified', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });
      await customerInsightsService.getRFMScores('venue-123', { limit: 50 });
      expect(mockDb.raw).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), expect.arrayContaining(['venue-123', 50]));
    });
  });

  describe('getEventPreferences', () => {
    it('should return cached preferences', async () => {
      const cached = [{ category: 'Music', attendance_count: 5 }];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));
      const result = await customerInsightsService.getEventPreferences('user-123', 'tenant-123');
      expect(result).toEqual(cached);
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.getEventPreferences('user-123', '')).rejects.toThrow('Tenant ID is required');
    });

    it('should fetch from database and cache for 6 hours', async () => {
      mockRedis.get.mockResolvedValue(null);
      const preferences = [{ category: 'Sports', attendance_count: 3 }];
      mockDb.raw.mockResolvedValue({ rows: preferences });

      const result = await customerInsightsService.getEventPreferences('user-123', 'tenant-123');

      expect(result).toEqual(preferences);
      expect(mockRedis.setex).toHaveBeenCalledWith(expect.any(String), 21600, expect.any(String));
    });
  });

  describe('getVenueCustomers', () => {
    it('should return customers with RFM and CLV data', async () => {
      const customers = [{ customer_id: 'c-1', email: 'test@example.com', segment: 'VIP', rfm_score: 15 }];
      mockDb.raw.mockResolvedValue({ rows: customers });
      const result = await customerInsightsService.getVenueCustomers('venue-123');
      expect(result).toEqual(customers);
    });

    it('should apply all filters when specified', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });
      await customerInsightsService.getVenueCustomers('venue-123', {
        segment: 'VIP', minSpent: 1000, daysSinceLastPurchase: 30, churnRisk: 'high', minRFMScore: 12, limit: 100,
      });
      expect(mockDb.raw).toHaveBeenCalledWith(expect.stringContaining('AND rfm.segment = ?'), expect.arrayContaining(['venue-123', 'VIP', 1000, 30, 'high', 12, 100]));
    });
  });

  describe('getCohortAnalysis', () => {
    it('should return cohort analysis data', async () => {
      const cohortData = [{ cohort_month: '2024-01', purchase_month: '2024-01', active_customers: 100, revenue: 5000 }];
      mockDb.raw.mockResolvedValue({ rows: cohortData });

      const result = await customerInsightsService.getCohortAnalysis('venue-123', new Date('2024-01-01'), new Date('2024-12-31'));

      expect(result).toEqual(cohortData);
    });

    it('should handle database errors', async () => {
      mockDb.raw.mockRejectedValue(new Error('Query failed'));
      await expect(customerInsightsService.getCohortAnalysis('venue-123', new Date(), new Date())).rejects.toThrow('Query failed');
    });
  });

  describe('getCustomerCLV', () => {
    it('should return cached CLV data', async () => {
      const cachedClv = { clv: 1500, predicted_clv_12_months: 600 };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedClv));
      const result = await customerInsightsService.getCustomerCLV('customer-123', 'tenant-123');
      expect(result).toEqual(cachedClv);
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.getCustomerCLV('customer-123', '')).rejects.toThrow('Tenant ID is required');
    });

    it('should fetch from database and cache for 24 hours', async () => {
      mockRedis.get.mockResolvedValue(null);
      const clvData = { customer_id: 'customer-123', clv: 2000, predicted_clv_12_months: 800 };
      mockDb.raw.mockResolvedValue({ rows: [clvData] });

      const result = await customerInsightsService.getCustomerCLV('customer-123', 'tenant-123');

      expect(result).toEqual(clvData);
      expect(mockRedis.setex).toHaveBeenCalledWith(expect.any(String), 86400, expect.any(String));
    });

    it('should return null when CLV data not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.raw.mockResolvedValue({ rows: [] });
      const result = await customerInsightsService.getCustomerCLV('nonexistent', 'tenant-123');
      expect(result).toBeNull();
    });
  });

  describe('getAtRiskCustomers', () => {
    it('should return at-risk customers', async () => {
      const atRiskCustomers = [{ customer_id: 'c-1', email: 'test@example.com', churn_risk: 'high', days_since_last_purchase: 120 }];
      mockDb.raw.mockResolvedValue({ rows: atRiskCustomers });

      const result = await customerInsightsService.getAtRiskCustomers('venue-123', 50);

      expect(result).toEqual(atRiskCustomers);
    });

    it('should use default limit of 100', async () => {
      mockDb.raw.mockResolvedValue({ rows: [] });
      await customerInsightsService.getAtRiskCustomers('venue-123');
      expect(mockDb.raw).toHaveBeenCalledWith(expect.any(String), ['venue-123', 100]);
    });
  });

  describe('clearCache', () => {
    it('should clear customer cache keys', async () => {
      await customerInsightsService.clearCache('customer', 'user-123', 'tenant-123');
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cache cleared', expect.objectContaining({ type: 'customer', id: 'user-123' }));
    });

    it('should clear venue cache keys', async () => {
      await customerInsightsService.clearCache('venue', 'venue-123', 'tenant-123');
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cache cleared', expect.objectContaining({ type: 'venue', id: 'venue-123' }));
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.clearCache('customer', 'user-123', '')).rejects.toThrow('Tenant ID is required');
    });
  });

  describe('clearTenantCache', () => {
    it('should clear all tenant cache using scan', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['key1', 'key2']]);
      await customerInsightsService.clearTenantCache('tenant-123');
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2');
      expect(mockLogger.info).toHaveBeenCalledWith('Tenant cache cleared', expect.objectContaining({ tenantId: 'tenant-123' }));
    });

    it('should throw BadRequestError when tenantId is missing', async () => {
      await expect(customerInsightsService.clearTenantCache('')).rejects.toThrow('Tenant ID is required');
    });
  });
});
