// Mock @tickettoken/shared BEFORE imports
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockFlush = jest.fn();
const mockGetStats = jest.fn();

const mockCacheService = {
  get: mockGet,
  set: mockSet,
  delete: mockDelete,
  flush: mockFlush,
  getStats: mockGetStats,
};

const mockMiddleware = jest.fn();
const mockStrategies = { lru: jest.fn() };
const mockInvalidator = { invalidate: jest.fn() };

const mockCreateCache = jest.fn(() => ({
  service: mockCacheService,
  middleware: mockMiddleware,
  strategies: mockStrategies,
  invalidator: mockInvalidator,
}));

jest.mock('@tickettoken/shared', () => ({
  createCache: mockCreateCache,
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'test-password',
    },
    server: {
      serviceName: 'integration-service',
    },
  },
}));

import {
  cache,
  cacheMiddleware,
  cacheStrategies,
  cacheInvalidator,
  getCacheStats,
  serviceCache,
} from '../../../src/services/cache-integration';

describe('cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export cache service', () => {
      expect(cache).toBe(mockCacheService);
    });

    it('should export cacheMiddleware', () => {
      expect(cacheMiddleware).toBe(mockMiddleware);
    });

    it('should export cacheStrategies', () => {
      expect(cacheStrategies).toBe(mockStrategies);
    });

    it('should export cacheInvalidator', () => {
      expect(cacheInvalidator).toBe(mockInvalidator);
    });
  });

  describe('getCacheStats', () => {
    it('should call cache.getStats and return result', () => {
      const mockStats = { hits: 100, misses: 20 };
      mockGetStats.mockReturnValue(mockStats);

      const result = getCacheStats();

      expect(mockGetStats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('serviceCache', () => {
    describe('get', () => {
      it('should call cache.get with correct parameters', async () => {
        const mockValue = { data: 'test' };
        mockGet.mockResolvedValue(mockValue);

        const result = await serviceCache.get('test-key');

        expect(mockGet).toHaveBeenCalledWith('test-key', undefined, {
          ttl: 300,
          level: 'BOTH',
        });
        expect(result).toEqual(mockValue);
      });

      it('should call cache.get with fetcher function', async () => {
        const fetcher = jest.fn().mockResolvedValue({ data: 'fetched' });
        mockGet.mockResolvedValue({ data: 'fetched' });

        await serviceCache.get('test-key', fetcher);

        expect(mockGet).toHaveBeenCalledWith('test-key', fetcher, {
          ttl: 300,
          level: 'BOTH',
        });
      });

      it('should call cache.get with custom TTL', async () => {
        mockGet.mockResolvedValue(null);

        await serviceCache.get('test-key', undefined, 600);

        expect(mockGet).toHaveBeenCalledWith('test-key', undefined, {
          ttl: 600,
          level: 'BOTH',
        });
      });

      it('should call cache.get with fetcher and custom TTL', async () => {
        const fetcher = jest.fn();
        mockGet.mockResolvedValue('value');

        await serviceCache.get('test-key', fetcher, 1200);

        expect(mockGet).toHaveBeenCalledWith('test-key', fetcher, {
          ttl: 1200,
          level: 'BOTH',
        });
      });
    });

    describe('set', () => {
      it('should call cache.set with correct parameters', async () => {
        mockSet.mockResolvedValue(undefined);

        await serviceCache.set('test-key', { data: 'value' });

        expect(mockSet).toHaveBeenCalledWith('test-key', { data: 'value' }, {
          ttl: 300,
          level: 'BOTH',
        });
      });

      it('should call cache.set with custom TTL', async () => {
        mockSet.mockResolvedValue(undefined);

        await serviceCache.set('test-key', 'value', 900);

        expect(mockSet).toHaveBeenCalledWith('test-key', 'value', {
          ttl: 900,
          level: 'BOTH',
        });
      });
    });

    describe('delete', () => {
      it('should call cache.delete with single key', async () => {
        mockDelete.mockResolvedValue(undefined);

        await serviceCache.delete('test-key');

        expect(mockDelete).toHaveBeenCalledWith('test-key');
      });

      it('should call cache.delete with array of keys', async () => {
        mockDelete.mockResolvedValue(undefined);

        await serviceCache.delete(['key1', 'key2', 'key3']);

        expect(mockDelete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
      });
    });

    describe('flush', () => {
      it('should call cache.flush', async () => {
        mockFlush.mockResolvedValue(undefined);

        await serviceCache.flush();

        expect(mockFlush).toHaveBeenCalled();
      });
    });
  });
});
