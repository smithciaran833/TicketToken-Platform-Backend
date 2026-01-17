// Mock the shared package before imports
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockFlush = jest.fn();
const mockGetStats = jest.fn();
const mockMiddleware = jest.fn();
const mockStrategies = { write: 'through', read: 'through' };
const mockInvalidator = { invalidate: jest.fn() };

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => ({
    service: {
      get: mockGet,
      set: mockSet,
      delete: mockDelete,
      flush: mockFlush,
      getStats: mockGetStats,
    },
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
  serviceCache,
  getCacheStats,
} from '../../../src/services/cache-integration';

describe('Cache Integration', () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockSet.mockClear();
    mockDelete.mockClear();
    mockFlush.mockClear();
    mockGetStats.mockClear();
  });

  describe('Exported Cache Service', () => {
    it('should export cache service', () => {
      expect(cache).toBeDefined();
      expect(cache.get).toBeDefined();
      expect(cache.set).toBeDefined();
      expect(cache.delete).toBeDefined();
      expect(cache.flush).toBeDefined();
      expect(cache.getStats).toBeDefined();
    });

    it('should export cache middleware', () => {
      expect(cacheMiddleware).toBeDefined();
      expect(typeof cacheMiddleware).toBe('function');
    });

    it('should export cache strategies', () => {
      expect(cacheStrategies).toBeDefined();
      expect(typeof cacheStrategies).toBe('object');
    });

    it('should export cache invalidator', () => {
      expect(cacheInvalidator).toBeDefined();
      expect(typeof cacheInvalidator).toBe('object');
    });

    it('should export getCacheStats function', () => {
      expect(getCacheStats).toBeDefined();
      expect(typeof getCacheStats).toBe('function');
    });

    it('should export serviceCache object', () => {
      expect(serviceCache).toBeDefined();
      expect(typeof serviceCache).toBe('object');
      expect(serviceCache.get).toBeDefined();
      expect(serviceCache.set).toBeDefined();
      expect(serviceCache.delete).toBeDefined();
      expect(serviceCache.flush).toBeDefined();
    });
  });

  describe('serviceCache.get', () => {
    it('should get value from cache', async () => {
      mockGet.mockResolvedValue({ data: 'cached' });

      const result = await serviceCache.get('test-key');

      expect(mockGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        { ttl: 300, level: 'BOTH' }
      );
      expect(result).toEqual({ data: 'cached' });
    });

    it('should get value with custom TTL', async () => {
      mockGet.mockResolvedValue('value');

      await serviceCache.get('test-key', undefined, 600);

      expect(mockGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        { ttl: 600, level: 'BOTH' }
      );
    });

    it('should get value with fetcher function', async () => {
      const fetcher = jest.fn().mockResolvedValue('fresh-data');
      mockGet.mockResolvedValue('fresh-data');

      const result = await serviceCache.get('test-key', fetcher);

      expect(mockGet).toHaveBeenCalledWith(
        'test-key',
        fetcher,
        { ttl: 300, level: 'BOTH' }
      );
      expect(result).toBe('fresh-data');
    });

    it('should use BOTH cache level', async () => {
      mockGet.mockResolvedValue('value');

      await serviceCache.get('test-key');

      const callArgs = mockGet.mock.calls[0];
      expect(callArgs[2]).toHaveProperty('level', 'BOTH');
    });

    it('should handle fetcher returning null', async () => {
      const fetcher = jest.fn().mockResolvedValue(null);
      mockGet.mockResolvedValue(null);

      const result = await serviceCache.get('test-key', fetcher, 120);

      expect(mockGet).toHaveBeenCalledWith('test-key', fetcher, { ttl: 120, level: 'BOTH' });
      expect(result).toBeNull();
    });
  });

  describe('serviceCache.set', () => {
    it('should set value in cache', async () => {
      await serviceCache.set('test-key', { data: 'value' });

      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        { data: 'value' },
        { ttl: 300, level: 'BOTH' }
      );
    });

    it('should set value with custom TTL', async () => {
      await serviceCache.set('test-key', 'value', 1800);

      expect(mockSet).toHaveBeenCalledWith(
        'test-key',
        'value',
        { ttl: 1800, level: 'BOTH' }
      );
    });

    it('should use BOTH cache level', async () => {
      await serviceCache.set('test-key', 'value');

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ level: 'BOTH' })
      );
    });

    it('should set null values', async () => {
      await serviceCache.set('test-key', null, 600);

      expect(mockSet).toHaveBeenCalledWith('test-key', null, { ttl: 600, level: 'BOTH' });
    });

    it('should set complex objects', async () => {
      const complexObj = {
        id: '123',
        nested: { data: [1, 2, 3] },
        timestamp: new Date(),
      };

      await serviceCache.set('complex-key', complexObj);

      expect(mockSet).toHaveBeenCalledWith('complex-key', complexObj, { ttl: 300, level: 'BOTH' });
    });
  });

  describe('serviceCache.delete', () => {
    it('should delete single key', async () => {
      await serviceCache.delete('test-key');

      expect(mockDelete).toHaveBeenCalledWith('test-key');
    });

    it('should delete multiple keys', async () => {
      await serviceCache.delete(['key1', 'key2', 'key3']);

      expect(mockDelete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should delete empty array', async () => {
      await serviceCache.delete([]);

      expect(mockDelete).toHaveBeenCalledWith([]);
    });
  });

  describe('serviceCache.flush', () => {
    it('should flush entire cache', async () => {
      await serviceCache.flush();

      expect(mockFlush).toHaveBeenCalled();
    });

    it('should call flush without arguments', async () => {
      await serviceCache.flush();

      expect(mockFlush).toHaveBeenCalledWith();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const mockStats = {
        hits: 100,
        misses: 20,
        keys: 50,
        hitRate: 0.83,
      };
      mockGetStats.mockReturnValue(mockStats);

      const stats = getCacheStats();

      expect(mockGetStats).toHaveBeenCalled();
      expect(stats).toEqual(mockStats);
    });

    it('should return empty stats object', () => {
      mockGetStats.mockReturnValue({});

      const stats = getCacheStats();

      expect(stats).toEqual({});
    });
  });

  describe('Default TTL Values', () => {
    it('should use 300 seconds as default TTL for get', async () => {
      mockGet.mockResolvedValue('value');

      await serviceCache.get('key');

      const callArgs = mockGet.mock.calls[0];
      expect(callArgs[2]).toHaveProperty('ttl', 300);
    });

    it('should use 300 seconds as default TTL for set', async () => {
      await serviceCache.set('key', 'value');

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ ttl: 300 })
      );
    });
  });

  describe('Cache Level', () => {
    it('should always use BOTH level for get operations', async () => {
      mockGet.mockResolvedValue('value');

      await serviceCache.get('key1');
      await serviceCache.get('key2', undefined, 600);

      expect(mockGet).toHaveBeenCalledTimes(2);
      mockGet.mock.calls.forEach(call => {
        expect(call[2]).toHaveProperty('level', 'BOTH');
      });
    });

    it('should always use BOTH level for set operations', async () => {
      await serviceCache.set('key1', 'value1');
      await serviceCache.set('key2', 'value2', 600);

      expect(mockSet).toHaveBeenCalledTimes(2);
      mockSet.mock.calls.forEach(call => {
        expect(call[2]).toHaveProperty('level', 'BOTH');
      });
    });
  });
});
