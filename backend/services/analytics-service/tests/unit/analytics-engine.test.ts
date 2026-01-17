/**
 * Analytics Engine Unit Tests
 * 
 * Note: The source uses dynamic imports which require --experimental-vm-modules.
 * We test what we can without triggering those paths.
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

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockHget = jest.fn().mockResolvedValue('100');

jest.mock('../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    hget: mockHget,
  })),
}));

jest.mock('../../src/config/redis-cache-strategies', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
  }));
});

import { AnalyticsEngine, AnalyticsQuery } from '../../src/analytics-engine/analytics-engine';
import { logger } from '../../src/utils/logger';

describe('AnalyticsEngine', () => {
  let engine: AnalyticsEngine;

  const baseQuery: AnalyticsQuery = {
    venueId: 'venue-123',
    metrics: ['conversionRate'], // Use metric that doesn't use dynamic import
    timeRange: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-05'),
      granularity: 'day',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    engine = new AnalyticsEngine();
  });

  describe('query', () => {
    it('should return cached results if available', async () => {
      const cachedData = { conversionRate: [{ date: '2024-01-01', rate: '5.00' }] };
      mockGet.mockResolvedValueOnce(cachedData);

      const result = await engine.query(baseQuery);

      expect(result).toEqual(cachedData);
      expect(mockGet).toHaveBeenCalledWith('analyticsQuery', expect.any(String));
    });

    it('should cache results after query execution', async () => {
      mockGet.mockResolvedValueOnce(null);

      await engine.query(baseQuery);

      expect(mockSet).toHaveBeenCalledWith(
        'analyticsQuery',
        expect.any(String),
        expect.any(Object),
        300
      );
    });

    it('should generate cache key containing query params', async () => {
      mockGet.mockResolvedValueOnce({ cached: true });

      await engine.query(baseQuery);

      expect(mockGet).toHaveBeenCalledWith(
        'analyticsQuery',
        expect.stringContaining('venue-123')
      );
    });
  });

  describe('executeQuery - conversionRate metric', () => {
    it('should calculate conversion rate from Redis data', async () => {
      mockGet.mockResolvedValueOnce(null);
      mockHget.mockResolvedValue('100');

      const result = await engine.query(baseQuery);

      expect(result.conversionRate).toBeDefined();
      expect(Array.isArray(result.conversionRate)).toBe(true);
    });

    it('should return data for each day in range', async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await engine.query(baseQuery);

      // 5 days from Jan 1 to Jan 5
      expect(result.conversionRate).toHaveLength(5);
    });

    it('should include date, pageViews, conversions and rate', async () => {
      mockGet.mockResolvedValueOnce(null);
      mockHget.mockResolvedValue('50');

      const result = await engine.query(baseQuery);

      expect(result.conversionRate[0]).toHaveProperty('date');
      expect(result.conversionRate[0]).toHaveProperty('pageViews');
      expect(result.conversionRate[0]).toHaveProperty('conversions');
      expect(result.conversionRate[0]).toHaveProperty('rate');
    });

    it('should handle zero page views', async () => {
      mockGet.mockResolvedValueOnce(null);
      mockHget.mockResolvedValue('0');

      const result = await engine.query(baseQuery);

      expect(result.conversionRate[0].rate).toBe('0.00');
    });
  });

  describe('executeQuery - unknown metric', () => {
    it('should log warning for unknown metrics', async () => {
      const query = { ...baseQuery, metrics: ['unknownMetric'] };
      mockGet.mockResolvedValueOnce(null);

      await engine.query(query);

      expect(logger.warn).toHaveBeenCalledWith('Unknown metric requested: unknownMetric');
    });

    it('should not include unknown metrics in results', async () => {
      const query = { ...baseQuery, metrics: ['unknownMetric'] };
      mockGet.mockResolvedValueOnce(null);

      const result = await engine.query(query);

      expect(result.unknownMetric).toBeUndefined();
    });
  });

  describe('getDateRange', () => {
    it('should generate correct date range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-05');

      const dates = (engine as any).getDateRange(start, end);

      expect(dates).toHaveLength(5);
      expect(dates[0].toISOString().split('T')[0]).toBe('2024-01-01');
      expect(dates[4].toISOString().split('T')[0]).toBe('2024-01-05');
    });

    it('should handle single day range', () => {
      const date = new Date('2024-01-15');

      const dates = (engine as any).getDateRange(date, date);

      expect(dates).toHaveLength(1);
    });

    it('should return empty array when start is after end', () => {
      const start = new Date('2024-01-10');
      const end = new Date('2024-01-05');

      const dates = (engine as any).getDateRange(start, end);

      expect(dates).toHaveLength(0);
    });
  });

  describe('generateCacheKey', () => {
    it('should include venue ID in cache key', () => {
      const key = (engine as any).generateCacheKey(baseQuery);

      expect(key).toContain('venue-123');
    });

    it('should include metrics in cache key', () => {
      const key = (engine as any).generateCacheKey(baseQuery);

      expect(key).toContain('conversionRate');
    });

    it('should include time range in cache key', () => {
      const key = (engine as any).generateCacheKey(baseQuery);

      expect(key).toContain('2024-01-01');
      expect(key).toContain('2024-01-05');
    });

    it('should generate different keys for different metrics', () => {
      const query2 = { ...baseQuery, metrics: ['ticketSales'] };

      const key1 = (engine as any).generateCacheKey(baseQuery);
      const key2 = (engine as any).generateCacheKey(query2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different venues', () => {
      const query2 = { ...baseQuery, venueId: 'venue-456' };

      const key1 = (engine as any).generateCacheKey(baseQuery);
      const key2 = (engine as any).generateCacheKey(query2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different time ranges', () => {
      const query2 = {
        ...baseQuery,
        timeRange: {
          start: new Date('2024-02-01'),
          end: new Date('2024-02-28'),
        },
      };

      const key1 = (engine as any).generateCacheKey(baseQuery);
      const key2 = (engine as any).generateCacheKey(query2);

      expect(key1).not.toBe(key2);
    });
  });
});
