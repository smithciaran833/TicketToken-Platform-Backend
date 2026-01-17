// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/cache-integration.ts
 */

jest.mock('@tickettoken/shared');

describe('src/services/cache-integration.ts - Comprehensive Unit Tests', () => {
  let mockCache: any;
  let mockCreateCache: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock cache service
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      flush: jest.fn(),
      getStats: jest.fn().mockReturnValue({ hits: 10, misses: 5 })
    };

    // Mock createCache
    mockCreateCache = jest.fn().mockReturnValue({
      service: mockCache,
      middleware: jest.fn(),
      strategies: {},
      invalidator: {}
    });

    const shared = require('@tickettoken/shared');
    shared.createCache = mockCreateCache;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // Module Initialization
  // =============================================================================

  describe('Module Initialization', () => {
    it('should call createCache on import', () => {
      require('../../../src/services/cache-integration');

      expect(mockCreateCache).toHaveBeenCalled();
    });

    it('should use default service name', () => {
      delete process.env.SERVICE_NAME;

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.keyPrefix).toBe('search-service:');
    });

    it('should use environment service name', () => {
      process.env.SERVICE_NAME = 'custom-service';

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.keyPrefix).toBe('custom-service:');
    });

    it('should use default Redis host', () => {
      delete process.env.REDIS_HOST;

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.host).toBe('redis');
    });

    it('should use environment Redis host', () => {
      process.env.REDIS_HOST = 'custom-redis';

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.host).toBe('custom-redis');
    });

    it('should use default Redis port', () => {
      delete process.env.REDIS_PORT;

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.port).toBe(6379);
    });

    it('should use environment Redis port', () => {
      process.env.REDIS_PORT = '6380';

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.port).toBe(6380);
    });

    it('should include Redis password if set', () => {
      process.env.REDIS_PASSWORD = 'secret';

      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.redis.password).toBe('secret');
    });

    it('should configure TTLs', () => {
      require('../../../src/services/cache-integration');

      const config = mockCreateCache.mock.calls[0][0];
      expect(config.ttls).toBeDefined();
      expect(config.ttls.session).toBe(300);
      expect(config.ttls.event).toBe(600);
      expect(config.ttls.venue).toBe(1800);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export cache', () => {
      const module = require('../../../src/services/cache-integration');

      expect(module.cache).toBe(mockCache);
    });

    it('should export cacheMiddleware', () => {
      const module = require('../../../src/services/cache-integration');

      expect(module.cacheMiddleware).toBeDefined();
    });

    it('should export cacheStrategies', () => {
      const module = require('../../../src/services/cache-integration');

      expect(module.cacheStrategies).toBeDefined();
    });

    it('should export cacheInvalidator', () => {
      const module = require('../../../src/services/cache-integration');

      expect(module.cacheInvalidator).toBeDefined();
    });

    it('should export getCacheStats', () => {
      const module = require('../../../src/services/cache-integration');

      expect(typeof module.getCacheStats).toBe('function');
    });

    it('should export serviceCache', () => {
      const module = require('../../../src/services/cache-integration');

      expect(module.serviceCache).toBeDefined();
    });
  });

  // =============================================================================
  // getCacheStats()
  // =============================================================================

  describe('getCacheStats()', () => {
    it('should return cache stats', () => {
      const module = require('../../../src/services/cache-integration');

      const stats = module.getCacheStats();

      expect(stats).toEqual({ hits: 10, misses: 5 });
      expect(mockCache.getStats).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // serviceCache.get()
  // =============================================================================

  describe('serviceCache.get()', () => {
    it('should call cache.get with key', async () => {
      mockCache.get.mockResolvedValue('cached-value');

      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.get('test-key');

      expect(mockCache.get).toHaveBeenCalledWith(
        'test-key',
        undefined,
        expect.objectContaining({ ttl: 300, level: 'BOTH' })
      );
    });

    it('should use default TTL of 300', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.get('key');

      const options = mockCache.get.mock.calls[0][2];
      expect(options.ttl).toBe(300);
    });

    it('should use custom TTL', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.get('key', undefined, 600);

      const options = mockCache.get.mock.calls[0][2];
      expect(options.ttl).toBe(600);
    });

    it('should pass fetcher function', async () => {
      const fetcher = jest.fn().mockResolvedValue('fetched');

      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.get('key', fetcher);

      expect(mockCache.get).toHaveBeenCalledWith('key', fetcher, expect.any(Object));
    });

    it('should use BOTH level', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.get('key');

      const options = mockCache.get.mock.calls[0][2];
      expect(options.level).toBe('BOTH');
    });

    it('should return cached value', async () => {
      mockCache.get.mockResolvedValue('result');

      const module = require('../../../src/services/cache-integration');
      const result = await module.serviceCache.get('key');

      expect(result).toBe('result');
    });
  });

  // =============================================================================
  // serviceCache.set()
  // =============================================================================

  describe('serviceCache.set()', () => {
    it('should call cache.set with key and value', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.set('key', 'value');

      expect(mockCache.set).toHaveBeenCalledWith(
        'key',
        'value',
        expect.objectContaining({ ttl: 300, level: 'BOTH' })
      );
    });

    it('should use default TTL of 300', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.set('key', 'value');

      const options = mockCache.set.mock.calls[0][2];
      expect(options.ttl).toBe(300);
    });

    it('should use custom TTL', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.set('key', 'value', 1200);

      const options = mockCache.set.mock.calls[0][2];
      expect(options.ttl).toBe(1200);
    });

    it('should use BOTH level', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.set('key', 'value');

      const options = mockCache.set.mock.calls[0][2];
      expect(options.level).toBe('BOTH');
    });
  });

  // =============================================================================
  // serviceCache.delete()
  // =============================================================================

  describe('serviceCache.delete()', () => {
    it('should call cache.delete with single key', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.delete('key');

      expect(mockCache.delete).toHaveBeenCalledWith('key');
    });

    it('should call cache.delete with array of keys', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.delete(['key1', 'key2']);

      expect(mockCache.delete).toHaveBeenCalledWith(['key1', 'key2']);
    });
  });

  // =============================================================================
  // serviceCache.flush()
  // =============================================================================

  describe('serviceCache.flush()', () => {
    it('should call cache.flush', async () => {
      const module = require('../../../src/services/cache-integration');
      await module.serviceCache.flush();

      expect(mockCache.flush).toHaveBeenCalled();
    });
  });
});
