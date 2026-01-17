// Mock dependencies BEFORE imports
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDelete = jest.fn();
const mockCacheFlush = jest.fn();
const mockCacheGetStats = jest.fn();

const mockCacheService = {
  get: mockCacheGet,
  set: mockCacheSet,
  delete: mockCacheDelete,
  flush: mockCacheFlush,
  getStats: mockCacheGetStats,
};

const mockMiddleware = jest.fn();
const mockStrategies = { default: 'strategy' };
const mockInvalidator = { invalidate: jest.fn() };

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => ({
    service: mockCacheService,
    middleware: mockMiddleware,
    strategies: mockStrategies,
    invalidator: mockInvalidator,
  })),
}));

import {
  cache,
  cacheMiddleware,
  cacheStrategies,
  cacheInvalidator,
  getCacheStats,
  serviceCache,
} from '../../../src/services/cache-integration';

describe('CacheIntegration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('exports', () => {
    it('should export cache service', () => {
      expect(cache).toBe(mockCacheService);
    });

    it('should export cache middleware', () => {
      expect(cacheMiddleware).toBe(mockMiddleware);
    });

    it('should export cache strategies', () => {
      expect(cacheStrategies).toBe(mockStrategies);
    });

    it('should export cache invalidator', () => {
      expect(cacheInvalidator).toBe(mockInvalidator);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache stats from service', () => {
      const mockStats = { hits: 100, misses: 20, hitRate: 0.83 };
      mockCacheGetStats.mockReturnValue(mockStats);

      const stats = getCacheStats();

      expect(mockCacheGetStats).toHaveBeenCalled();
      expect(stats).toEqual(mockStats);
    });

    it('should return empty stats when none available', () => {
      mockCacheGetStats.mockReturnValue({});

      const stats = getCacheStats();

      expect(stats).toEqual({});
    });
  });

  describe('serviceCache', () => {
    describe('get', () => {
      it('should get value with default TTL', async () => {
        const mockValue = { data: 'test' };
        mockCacheGet.mockResolvedValue(mockValue);

        const result = await serviceCache.get('test-key');

        expect(mockCacheGet).toHaveBeenCalledWith('test-key', undefined, {
          ttl: 300,
          level: 'BOTH',
        });
        expect(result).toEqual(mockValue);
      });

      it('should get value with custom TTL', async () => {
        mockCacheGet.mockResolvedValue('cached-value');

        await serviceCache.get('custom-key', undefined, 600);

        expect(mockCacheGet).toHaveBeenCalledWith('custom-key', undefined, {
          ttl: 600,
          level: 'BOTH',
        });
      });

      it('should get value with fetcher function', async () => {
        const fetcher = jest.fn().mockResolvedValue('fetched-value');
        mockCacheGet.mockResolvedValue('fetched-value');

        const result = await serviceCache.get('fetch-key', fetcher, 120);

        expect(mockCacheGet).toHaveBeenCalledWith('fetch-key', fetcher, {
          ttl: 120,
          level: 'BOTH',
        });
        expect(result).toBe('fetched-value');
      });

      it('should handle cache miss with fetcher', async () => {
        const fetcher = jest.fn().mockResolvedValue('new-value');
        mockCacheGet.mockImplementation(async (key, fetcherFn) => {
          return await fetcherFn();
        });

        const result = await serviceCache.get('miss-key', fetcher);

        expect(result).toBe('new-value');
      });

      it('should return null when key not found and no fetcher', async () => {
        mockCacheGet.mockResolvedValue(null);

        const result = await serviceCache.get('nonexistent-key');

        expect(result).toBeNull();
      });

      it('should handle undefined return value', async () => {
        mockCacheGet.mockResolvedValue(undefined);

        const result = await serviceCache.get('undefined-key');

        expect(result).toBeUndefined();
      });
    });

    describe('set', () => {
      it('should set value with default TTL', async () => {
        mockCacheSet.mockResolvedValue(undefined);

        await serviceCache.set('set-key', { data: 'value' });

        expect(mockCacheSet).toHaveBeenCalledWith('set-key', { data: 'value' }, {
          ttl: 300,
          level: 'BOTH',
        });
      });

      it('should set value with custom TTL', async () => {
        mockCacheSet.mockResolvedValue(undefined);

        await serviceCache.set('custom-set', 'value', 900);

        expect(mockCacheSet).toHaveBeenCalledWith('custom-set', 'value', {
          ttl: 900,
          level: 'BOTH',
        });
      });

      it('should handle complex objects', async () => {
        const complexValue = {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          date: new Date(),
        };
        mockCacheSet.mockResolvedValue(undefined);

        await serviceCache.set('complex-key', complexValue, 60);

        expect(mockCacheSet).toHaveBeenCalledWith('complex-key', complexValue, {
          ttl: 60,
          level: 'BOTH',
        });
      });

      it('should handle null values', async () => {
        mockCacheSet.mockResolvedValue(undefined);

        await serviceCache.set('null-key', null, 60);

        expect(mockCacheSet).toHaveBeenCalledWith('null-key', null, {
          ttl: 60,
          level: 'BOTH',
        });
      });

      it('should handle zero TTL', async () => {
        mockCacheSet.mockResolvedValue(undefined);

        await serviceCache.set('zero-ttl', 'value', 0);

        expect(mockCacheSet).toHaveBeenCalledWith('zero-ttl', 'value', {
          ttl: 0,
          level: 'BOTH',
        });
      });
    });

    describe('delete', () => {
      it('should delete single key', async () => {
        mockCacheDelete.mockResolvedValue(undefined);

        await serviceCache.delete('delete-key');

        expect(mockCacheDelete).toHaveBeenCalledWith('delete-key');
      });

      it('should delete multiple keys', async () => {
        mockCacheDelete.mockResolvedValue(undefined);

        await serviceCache.delete(['key1', 'key2', 'key3']);

        expect(mockCacheDelete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
      });

      it('should handle empty array', async () => {
        mockCacheDelete.mockResolvedValue(undefined);

        await serviceCache.delete([]);

        expect(mockCacheDelete).toHaveBeenCalledWith([]);
      });
    });

    describe('flush', () => {
      it('should flush all cache', async () => {
        mockCacheFlush.mockResolvedValue(undefined);

        await serviceCache.flush();

        expect(mockCacheFlush).toHaveBeenCalled();
      });
    });
  });
});
