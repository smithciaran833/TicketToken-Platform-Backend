/**
 * Customer Intelligence Service Unit Tests
 */

import { CustomerSegment, InsightType } from '../../../src/types';

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

const mockEventSchema = {
  getEvents: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  EventSchema: mockEventSchema,
  CacheModel: {
    getCacheKey: jest.fn((...args: string[]) => `cache:${args.join(':')}`),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const mockAnonymizationService = {
  hashCustomerId: jest.fn((id: string) => Promise.resolve(`hashed-${id}`)),
};

jest.mock('../../../src/services/anonymization.service', () => ({
  anonymizationService: mockAnonymizationService,
}));

jest.mock('../../../src/config/constants', () => ({
  CONSTANTS: {
    CACHE_TTL: {
      CUSTOMER_PROFILE: 3600,
    },
  },
}));

import { CustomerIntelligenceService, customerIntelligenceService } from '../../../src/services/customer-intelligence.service';
import { CacheModel } from '../../../src/models';

describe('CustomerIntelligenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CustomerIntelligenceService.getInstance();
      const instance2 = CustomerIntelligenceService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getCustomerProfile', () => {
    it('should return cached profile when available', async () => {
      const cachedProfile = { customerId: 'hashed-cust-123', totalSpent: 500 };
      (CacheModel.get as jest.Mock).mockResolvedValue(cachedProfile);

      const result = await customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123');

      expect(result).toEqual(cachedProfile);
      expect(mockAnonymizationService.hashCustomerId).toHaveBeenCalledWith('cust-123');
    });

    it('should calculate profile from events when not cached', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      const events = [
        { eventType: 'ticket.purchased', timestamp: '2024-01-01T10:00:00Z', properties: { amount: 100, quantity: 2 } },
        { eventType: 'ticket.purchased', timestamp: '2024-01-15T10:00:00Z', properties: { amount: 150, quantity: 1 } },
      ];
      mockEventSchema.getEvents.mockResolvedValue(events);

      const result = await customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123');

      expect(result).toEqual(expect.objectContaining({
        customerId: 'hashed-cust-123',
        venueId: 'venue-123',
        totalSpent: 250,
        totalTickets: 3,
        averageOrderValue: 125,
      }));
      expect(CacheModel.set).toHaveBeenCalled();
    });

    it('should return null when no events found', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      mockEventSchema.getEvents.mockResolvedValue([]);

      const result = await customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123');

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      (CacheModel.get as jest.Mock).mockRejectedValue(new Error('Cache error'));
      await expect(customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123')).rejects.toThrow('Cache error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('generateCustomerInsights', () => {
    it('should generate churn risk insight for high churn probability', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue({
        customerId: 'hashed-cust-123',
        churnProbability: 0.75,
        daysSinceLastPurchase: 100,
        totalSpent: 200,
        totalPurchases: 3,
      });

      const result = await customerIntelligenceService.generateCustomerInsights('venue-123', 'cust-123');

      expect(result).toContainEqual(expect.objectContaining({
        type: InsightType.CHURN_RISK,
        title: 'High Churn Risk',
        impact: 'high',
        actionable: true,
      }));
    });

    it('should generate low engagement insight', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue({
        customerId: 'hashed-cust-123',
        churnProbability: 0.3,
        daysSinceLastPurchase: 120,
        totalSpent: 200,
      });

      const result = await customerIntelligenceService.generateCustomerInsights('venue-123', 'cust-123');

      expect(result).toContainEqual(expect.objectContaining({
        type: InsightType.LOW_ENGAGEMENT,
        title: 'Inactive Customer',
      }));
    });

    it('should generate high value insight', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue({
        customerId: 'hashed-cust-123',
        churnProbability: 0.1,
        daysSinceLastPurchase: 10,
        totalSpent: 1500,
      });

      const result = await customerIntelligenceService.generateCustomerInsights('venue-123', 'cust-123');

      expect(result).toContainEqual(expect.objectContaining({
        type: InsightType.HIGH_VALUE,
        title: 'VIP Customer',
      }));
    });

    it('should return empty array when profile not found', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      mockEventSchema.getEvents.mockResolvedValue([]);

      const result = await customerIntelligenceService.generateCustomerInsights('venue-123', 'cust-123');

      expect(result).toEqual([]);
    });
  });

  describe('performRFMAnalysis', () => {
    it('should calculate RFM scores correctly', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue({
        customerId: 'hashed-cust-123',
        daysSinceLastPurchase: 15,
        purchaseFrequency: 8,
        totalSpent: 800,
        totalTickets: 10,
      });

      const result = await customerIntelligenceService.performRFMAnalysis('venue-123', 'cust-123');

      expect(result).toEqual(expect.objectContaining({
        customerId: 'hashed-cust-123',
        recencyScore: 5,
        frequencyScore: 4,
        monetaryScore: 4,
      }));
    });

    it('should throw error when profile not found', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      mockEventSchema.getEvents.mockResolvedValue([]);

      await expect(customerIntelligenceService.performRFMAnalysis('venue-123', 'cust-123'))
        .rejects.toThrow('Customer profile not found');
    });

    it('should determine correct RFM segment for Champions', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue({
        customerId: 'hashed-cust-123',
        daysSinceLastPurchase: 5,
        purchaseFrequency: 15,
        totalSpent: 2000,
        totalTickets: 20,
      });

      const result = await customerIntelligenceService.performRFMAnalysis('venue-123', 'cust-123');

      expect(result.segment).toBe('Champions');
    });
  });

  describe('getCustomerSegments', () => {
    it('should return customer segment distribution', async () => {
      const result = await customerIntelligenceService.getCustomerSegments('venue-123');

      expect(result).toContainEqual(expect.objectContaining({ segment: CustomerSegment.VIP }));
      expect(result).toContainEqual(expect.objectContaining({ segment: CustomerSegment.REGULAR }));
      expect(result).toContainEqual(expect.objectContaining({ segment: CustomerSegment.NEW }));
    });

    it('should include percentage for each segment', async () => {
      const result = await customerIntelligenceService.getCustomerSegments('venue-123');

      result.forEach(segment => {
        expect(segment).toHaveProperty('percentage');
        expect(typeof segment.percentage).toBe('number');
      });
    });
  });

  describe('customer segment determination', () => {
    it('should identify VIP customers', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      const events = Array(20).fill(null).map((_, i) => ({
        eventType: 'ticket.purchased',
        timestamp: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
        properties: { amount: 200, quantity: 1 },
      }));
      mockEventSchema.getEvents.mockResolvedValue(events);

      const result = await customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123');

      expect(result?.segment).toBe(CustomerSegment.VIP);
    });

    it('should identify LOST customers', async () => {
      (CacheModel.get as jest.Mock).mockResolvedValue(null);
      const events = [{
        eventType: 'ticket.purchased',
        timestamp: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        properties: { amount: 50, quantity: 1 },
      }];
      mockEventSchema.getEvents.mockResolvedValue(events);

      const result = await customerIntelligenceService.getCustomerProfile('venue-123', 'cust-123');

      expect(result?.segment).toBe(CustomerSegment.LOST);
    });
  });
});
