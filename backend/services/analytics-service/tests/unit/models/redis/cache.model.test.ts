/**
 * Cache Model Unit Tests
 */

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDelete = jest.fn();
const mockCacheInvalidate = jest.fn();

const mockCacheManager = {
  get: mockCacheGet,
  set: mockCacheSet,
  delete: mockCacheDelete,
  invalidate: mockCacheInvalidate,
};

const mockRedisIncrby = jest.fn();
const mockRedisDecrby = jest.fn();

const mockRedisClient = {
  incrby: mockRedisIncrby,
  decrby: mockRedisDecrby,
};

jest.mock('@tickettoken/shared', () => ({
  getCacheManager: () => mockCacheManager,
  getRedisClient: () => Promise.resolve(mockRedisClient),
}));

jest.mock('../../../../src/config/constants', () => ({
  CONSTANTS: {
    CACHE_TTL: {
      METRICS: 300,
      DASHBOARD: 600,
    },
  },
}));

import { CacheModel } from '../../../../src/models/redis/cache.model';

describe('CacheModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const cachedValue = { foo: 'bar' };
      mockCacheGet.mockResolvedValue(cachedValue);

      const result = await CacheModel.get<typeof cachedValue>('test-key');

      expect(result).toEqual(cachedValue);
      expect(mockCacheGet).toHaveBeenCalledWith('test-key');
    });

    it('should return null if key not found', async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await CacheModel.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.set('test-key', { data: 'value' }, 300);

      expect(mockCacheSet).toHaveBeenCalledWith('test-key', { data: 'value' }, 300);
    });

    it('should set value without TTL', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.set('test-key', 'value');

      expect(mockCacheSet).toHaveBeenCalledWith('test-key', 'value', undefined);
    });
  });

  describe('delete', () => {
    it('should delete key from cache', async () => {
      mockCacheDelete.mockResolvedValue(undefined);

      await CacheModel.delete('test-key');

      expect(mockCacheDelete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('deletePattern', () => {
    it('should invalidate keys matching pattern', async () => {
      mockCacheInvalidate.mockResolvedValue(undefined);

      const result = await CacheModel.deletePattern('analytics:*');

      expect(result).toBe(1);
      expect(mockCacheInvalidate).toHaveBeenCalledWith('analytics:*');
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      mockCacheGet.mockResolvedValue({ data: 'exists' });

      const result = await CacheModel.exists('test-key');

      expect(result).toBe(true);
      expect(mockCacheGet).toHaveBeenCalledWith('test-key');
    });

    it('should return false if key does not exist', async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await CacheModel.exists('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('expire', () => {
    it('should re-set value with new TTL', async () => {
      const value = { data: 'test' };
      mockCacheGet.mockResolvedValue(value);
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.expire('test-key', 600);

      expect(mockCacheGet).toHaveBeenCalledWith('test-key');
      expect(mockCacheSet).toHaveBeenCalledWith('test-key', value, 600);
    });

    it('should not set if key does not exist', async () => {
      mockCacheGet.mockResolvedValue(null);

      await CacheModel.expire('non-existent', 600);

      expect(mockCacheGet).toHaveBeenCalledWith('non-existent');
      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  describe('increment', () => {
    it('should increment value by default amount', async () => {
      mockRedisIncrby.mockResolvedValue(5);

      const result = await CacheModel.increment('counter-key');

      expect(result).toBe(5);
      expect(mockRedisIncrby).toHaveBeenCalledWith('counter-key', 1);
    });

    it('should increment by specified amount', async () => {
      mockRedisIncrby.mockResolvedValue(15);

      const result = await CacheModel.increment('counter-key', 10);

      expect(result).toBe(15);
      expect(mockRedisIncrby).toHaveBeenCalledWith('counter-key', 10);
    });
  });

  describe('decrement', () => {
    it('should decrement value by default amount', async () => {
      mockRedisDecrby.mockResolvedValue(4);

      const result = await CacheModel.decrement('counter-key');

      expect(result).toBe(4);
      expect(mockRedisDecrby).toHaveBeenCalledWith('counter-key', 1);
    });

    it('should decrement by specified amount', async () => {
      mockRedisDecrby.mockResolvedValue(0);

      const result = await CacheModel.decrement('counter-key', 5);

      expect(result).toBe(0);
      expect(mockRedisDecrby).toHaveBeenCalledWith('counter-key', 5);
    });
  });

  describe('getCacheKey', () => {
    it('should generate cache key with parts', () => {
      const key = CacheModel.getCacheKey('metric', 'venue-1', 'revenue');

      expect(key).toBe('analytics:metric:venue-1:revenue');
    });

    it('should handle single part', () => {
      const key = CacheModel.getCacheKey('dashboard', 'dash-1');

      expect(key).toBe('analytics:dashboard:dash-1');
    });
  });

  describe('cacheMetric', () => {
    it('should cache metric with default TTL', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.cacheMetric('venue-1', 'revenue', { value: 1000 });

      expect(mockCacheSet).toHaveBeenCalledWith(
        'analytics:metric:venue-1:revenue',
        { value: 1000 },
        300 // CONSTANTS.CACHE_TTL.METRICS
      );
    });

    it('should cache metric with custom TTL', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.cacheMetric('venue-1', 'sales', { value: 500 }, 600);

      expect(mockCacheSet).toHaveBeenCalledWith(
        'analytics:metric:venue-1:sales',
        { value: 500 },
        600
      );
    });
  });

  describe('getCachedMetric', () => {
    it('should get cached metric', async () => {
      const metric = { value: 1000, timestamp: new Date() };
      mockCacheGet.mockResolvedValue(metric);

      const result = await CacheModel.getCachedMetric<typeof metric>('venue-1', 'revenue');

      expect(result).toEqual(metric);
      expect(mockCacheGet).toHaveBeenCalledWith('analytics:metric:venue-1:revenue');
    });

    it('should return null if metric not cached', async () => {
      mockCacheGet.mockResolvedValue(null);

      const result = await CacheModel.getCachedMetric('venue-1', 'unknown');

      expect(result).toBeNull();
    });
  });

  describe('cacheWidget', () => {
    it('should cache widget with default TTL', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.cacheWidget('widget-1', { chartData: [] });

      expect(mockCacheSet).toHaveBeenCalledWith(
        'analytics:widget:widget-1',
        { chartData: [] },
        600 // CONSTANTS.CACHE_TTL.DASHBOARD
      );
    });

    it('should cache widget with custom TTL', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await CacheModel.cacheWidget('widget-2', { data: 'test' }, 1200);

      expect(mockCacheSet).toHaveBeenCalledWith(
        'analytics:widget:widget-2',
        { data: 'test' },
        1200
      );
    });
  });

  describe('getCachedWidget', () => {
    it('should get cached widget', async () => {
      const widget = { chartData: [1, 2, 3] };
      mockCacheGet.mockResolvedValue(widget);

      const result = await CacheModel.getCachedWidget<typeof widget>('widget-1');

      expect(result).toEqual(widget);
      expect(mockCacheGet).toHaveBeenCalledWith('analytics:widget:widget-1');
    });
  });

  describe('invalidateVenueCache', () => {
    it('should invalidate all cache for venue', async () => {
      mockCacheInvalidate.mockResolvedValue(undefined);

      await CacheModel.invalidateVenueCache('venue-1');

      expect(mockCacheInvalidate).toHaveBeenCalledWith('analytics:*:venue-1:*');
    });
  });
});
