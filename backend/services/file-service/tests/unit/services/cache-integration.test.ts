const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  flush: jest.fn(),
  getStats: jest.fn().mockReturnValue({
    local: { size: 10, max: 100, calculatedSize: 1024 },
    metrics: { hits: { L1: 80, L2: 20 }, misses: 20, errors: 0, hitRate: 83.33, avgLatency: 5, total: 120 },
    locks: 0
  })
};

const mockCacheSystem = {
  service: mockCache,
  middleware: { rateLimit: jest.fn() },
  strategies: { LRU: jest.fn() },
  invalidator: { invalidatePattern: jest.fn() }
};

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => mockCacheSystem)
}));

import { cache, cacheMiddleware, cacheStrategies, cacheInvalidator, getCacheStats, serviceCache } from '../../../src/services/cache-integration';

describe('services/cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export cache service', () => {
      expect(cache).toBeDefined();
    });

    it('should export cacheMiddleware', () => {
      expect(cacheMiddleware).toBeDefined();
    });

    it('should export cacheStrategies', () => {
      expect(cacheStrategies).toBeDefined();
    });

    it('should export cacheInvalidator', () => {
      expect(cacheInvalidator).toBeDefined();
    });

    it('should export getCacheStats function', () => {
      expect(getCacheStats).toBeDefined();
      expect(typeof getCacheStats).toBe('function');
    });

    it('should export serviceCache object', () => {
      expect(serviceCache).toBeDefined();
      expect(serviceCache.get).toBeDefined();
      expect(serviceCache.set).toBeDefined();
      expect(serviceCache.delete).toBeDefined();
      expect(serviceCache.flush).toBeDefined();
    });
  });

  describe('serviceCache.get', () => {
    it('should call cache.get with correct params', async () => {
      mockCache.get.mockResolvedValue({ data: 'cached' });
      await serviceCache.get('test-key');
      expect(mockCache.get).toHaveBeenCalledWith('test-key', undefined, { ttl: 300, level: 'BOTH' });
    });

    it('should use fetcher when provided', async () => {
      const fetcher = jest.fn().mockResolvedValue({ data: 'fetched' });
      mockCache.get.mockResolvedValue({ data: 'cached' });
      await serviceCache.get('test-key', fetcher);
      expect(mockCache.get).toHaveBeenCalledWith('test-key', fetcher, { ttl: 300, level: 'BOTH' });
    });

    it('should use default TTL (300)', async () => {
      mockCache.get.mockResolvedValue(null);
      await serviceCache.get('test-key');
      expect(mockCache.get).toHaveBeenCalledWith('test-key', undefined, { ttl: 300, level: 'BOTH' });
    });

    it('should use custom TTL', async () => {
      mockCache.get.mockResolvedValue(null);
      await serviceCache.get('test-key', undefined, 600);
      expect(mockCache.get).toHaveBeenCalledWith('test-key', undefined, { ttl: 600, level: 'BOTH' });
    });

    it('should use level BOTH', async () => {
      mockCache.get.mockResolvedValue(null);
      await serviceCache.get('test-key');
      expect(mockCache.get).toHaveBeenCalledWith('test-key', undefined, expect.objectContaining({ level: 'BOTH' }));
    });
  });

  describe('serviceCache.set', () => {
    it('should call cache.set with correct params', async () => {
      mockCache.set.mockResolvedValue(undefined);
      await serviceCache.set('test-key', { data: 'value' });
      expect(mockCache.set).toHaveBeenCalledWith('test-key', { data: 'value' }, { ttl: 300, level: 'BOTH' });
    });

    it('should use default TTL (300)', async () => {
      mockCache.set.mockResolvedValue(undefined);
      await serviceCache.set('test-key', 'value');
      expect(mockCache.set).toHaveBeenCalledWith('test-key', 'value', { ttl: 300, level: 'BOTH' });
    });

    it('should use custom TTL', async () => {
      mockCache.set.mockResolvedValue(undefined);
      await serviceCache.set('test-key', 'value', 1800);
      expect(mockCache.set).toHaveBeenCalledWith('test-key', 'value', { ttl: 1800, level: 'BOTH' });
    });

    it('should use level BOTH', async () => {
      mockCache.set.mockResolvedValue(undefined);
      await serviceCache.set('test-key', 'value');
      expect(mockCache.set).toHaveBeenCalledWith('test-key', 'value', expect.objectContaining({ level: 'BOTH' }));
    });
  });

  describe('serviceCache.delete', () => {
    it('should delete single key', async () => {
      mockCache.delete.mockResolvedValue(undefined);
      await serviceCache.delete('test-key');
      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
    });

    it('should delete multiple keys', async () => {
      mockCache.delete.mockResolvedValue(undefined);
      await serviceCache.delete(['key1', 'key2', 'key3']);
      expect(mockCache.delete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });
  });

  describe('serviceCache.flush', () => {
    it('should call cache.flush', async () => {
      mockCache.flush.mockResolvedValue(undefined);
      await serviceCache.flush();
      expect(mockCache.flush).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should call cache.getStats', () => {
      const stats = getCacheStats();
      expect(mockCache.getStats).toHaveBeenCalled();
      expect(stats.metrics.hitRate).toBe(83.33);
    });

    it('should return stats object with correct structure', () => {
      const stats = getCacheStats();
      expect(stats).toBeDefined();
      expect(stats.metrics).toBeDefined();
      expect(stats.metrics.hits).toBeDefined();
      expect(stats.metrics.misses).toBeDefined();
      expect(stats.metrics.hitRate).toBeDefined();
    });
  });
});
