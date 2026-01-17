/**
 * Cache Integration Unit Tests
 */

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  flush: jest.fn(),
  getStats: jest.fn().mockReturnValue({ hits: 10, misses: 5 }),
};

const mockCacheMiddleware = jest.fn();
const mockCacheStrategies = {};
const mockCacheInvalidator = {};

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => ({
    service: mockCacheService,
    middleware: mockCacheMiddleware,
    strategies: mockCacheStrategies,
    invalidator: mockCacheInvalidator,
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

describe('Cache Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    it('should export cache service', () => {
      expect(cache).toBe(mockCacheService);
    });

    it('should export cacheMiddleware', () => {
      expect(cacheMiddleware).toBe(mockCacheMiddleware);
    });

    it('should export cacheStrategies', () => {
      expect(cacheStrategies).toBe(mockCacheStrategies);
    });

    it('should export cacheInvalidator', () => {
      expect(cacheInvalidator).toBe(mockCacheInvalidator);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = getCacheStats();
      expect(stats).toEqual({ hits: 10, misses: 5 });
      expect(mockCacheService.getStats).toHaveBeenCalled();
    });
  });

  describe('serviceCache', () => {
    describe('get', () => {
      it('should get value from cache with fetcher', async () => {
        const fetcher = jest.fn().mockResolvedValue({ data: 'test' });
        mockCacheService.get.mockResolvedValue({ data: 'test' });

        const result = await serviceCache.get('key:123', fetcher, 600);

        expect(mockCacheService.get).toHaveBeenCalledWith('key:123', fetcher, { ttl: 600, level: 'BOTH' });
        expect(result).toEqual({ data: 'test' });
      });

      it('should use default TTL of 300 seconds', async () => {
        mockCacheService.get.mockResolvedValue(null);
        await serviceCache.get('key:123');
        expect(mockCacheService.get).toHaveBeenCalledWith('key:123', undefined, { ttl: 300, level: 'BOTH' });
      });

      it('should work without fetcher', async () => {
        mockCacheService.get.mockResolvedValue({ cached: true });
        const result = await serviceCache.get('key:456');
        expect(result).toEqual({ cached: true });
      });
    });

    describe('set', () => {
      it('should set value in cache', async () => {
        await serviceCache.set('key:123', { data: 'value' }, 900);
        expect(mockCacheService.set).toHaveBeenCalledWith('key:123', { data: 'value' }, { ttl: 900, level: 'BOTH' });
      });

      it('should use default TTL of 300 seconds', async () => {
        await serviceCache.set('key:123', { data: 'value' });
        expect(mockCacheService.set).toHaveBeenCalledWith('key:123', { data: 'value' }, { ttl: 300, level: 'BOTH' });
      });
    });

    describe('delete', () => {
      it('should delete single key', async () => {
        await serviceCache.delete('key:123');
        expect(mockCacheService.delete).toHaveBeenCalledWith('key:123');
      });

      it('should delete multiple keys', async () => {
        await serviceCache.delete(['key:1', 'key:2', 'key:3']);
        expect(mockCacheService.delete).toHaveBeenCalledWith(['key:1', 'key:2', 'key:3']);
      });
    });

    describe('flush', () => {
      it('should flush all cache', async () => {
        await serviceCache.flush();
        expect(mockCacheService.flush).toHaveBeenCalled();
      });
    });
  });
});
