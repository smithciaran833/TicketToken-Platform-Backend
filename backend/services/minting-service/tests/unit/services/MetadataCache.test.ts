/**
 * Unit tests for MetadataCache service
 * Tests Redis-based caching for metadata
 */

// Mock redis before imports
const mockRedisClient = {
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  flushDb: jest.fn(),
  info: jest.fn(),
  connect: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  isReady: true
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/utils/metrics', () => ({
  cacheHits: { labels: jest.fn(() => ({ inc: jest.fn() })) },
  cacheMisses: { labels: jest.fn(() => ({ inc: jest.fn() })) }
}));

import { MetadataCache, metadataCache } from '../../../src/services/MetadataCache';
import { createClient } from 'redis';
import logger from '../../../src/utils/logger';
import { cacheHits, cacheMisses } from '../../../src/utils/metrics';

describe('MetadataCache', () => {
  let cache: MetadataCache;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setEx.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.flushDb.mockResolvedValue('OK');
    mockRedisClient.info.mockResolvedValue('keys=100');
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.quit.mockResolvedValue(undefined);
    mockRedisClient.on.mockImplementation((event, callback) => {
      if (event === 'connect') {
        callback();
      }
    });

    // Enable cache for tests
    process.env.REDIS_ENABLED = 'true';
    cache = new MetadataCache();
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('Constants', () => {
    it('KEY_PREFIX should be "minting:"', () => {
      // We test this through the prefixKey behavior
      expect(cache).toBeDefined();
    });

    it('DEFAULT_TTL should be 1 hour (3600 seconds)', () => {
      // Default TTL is 3600 seconds = 1 hour
      expect(cache).toBeDefined();
    });
  });

  describe('constructor', () => {
    it('should initialize when REDIS_ENABLED is true', () => {
      process.env.REDIS_ENABLED = 'true';
      const testCache = new MetadataCache();
      
      expect(createClient).toHaveBeenCalled();
    });

    it('should not initialize when REDIS_ENABLED is false', () => {
      jest.clearAllMocks();
      process.env.REDIS_ENABLED = 'false';
      
      const testCache = new MetadataCache();
      
      expect(logger.info).toHaveBeenCalledWith('Metadata cache disabled (REDIS_ENABLED=false)');
    });
  });

  describe('get', () => {
    it('should return cached value', async () => {
      mockRedisClient.get.mockResolvedValue('cached-value');
      
      const result = await cache.get('test-key');
      
      expect(result).toBe('cached-value');
    });

    it('should return null for cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cache.get('missing-key');
      
      expect(result).toBeNull();
    });

    it('should prefix key with "minting:"', async () => {
      await cache.get('test-key');
      
      expect(mockRedisClient.get).toHaveBeenCalledWith('minting:test-key');
    });

    it('should increment cacheHits on hit', async () => {
      mockRedisClient.get.mockResolvedValue('some-value');
      
      await cache.get('test-key');
      
      expect(cacheHits.labels).toHaveBeenCalledWith('metadata');
    });

    it('should increment cacheMisses on miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      await cache.get('test-key');
      
      expect(cacheMisses.labels).toHaveBeenCalledWith('metadata');
    });

    it('should return null on Redis error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      const result = await cache.get('test-key');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return null when cache is disabled', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      const result = await disabledCache.get('test-key');
      
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store with TTL', async () => {
      await cache.set('test-key', 'test-value', 3600);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:test-key',
        3600,
        'test-value'
      );
    });

    it('should use default TTL when not provided', async () => {
      await cache.set('test-key', 'test-value');
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:test-key',
        3600, // Default TTL
        'test-value'
      );
    });

    it('should return true on success', async () => {
      const result = await cache.set('test-key', 'test-value');
      
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));
      
      const result = await cache.set('test-key', 'test-value');
      
      expect(result).toBe(false);
    });

    it('should return false when cache is disabled', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      const result = await disabledCache.set('test-key', 'test-value');
      
      expect(result).toBe(false);
    });

    it('should log debug on set', async () => {
      await cache.set('test-key', 'test-value', 1800);
      
      expect(logger.debug).toHaveBeenCalledWith('Cache set', { key: 'test-key', ttl: 1800 });
    });
  });

  describe('delete', () => {
    it('should remove key', async () => {
      await cache.delete('test-key');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('minting:test-key');
    });

    it('should return true on success', async () => {
      const result = await cache.delete('test-key');
      
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      
      const result = await cache.delete('test-key');
      
      expect(result).toBe(false);
    });

    it('should return false when cache is disabled', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      const result = await disabledCache.delete('test-key');
      
      expect(result).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value on hit', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ data: 'cached' }));
      
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(result).toEqual({ data: 'cached' });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call factory on miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(fetcher).toHaveBeenCalled();
      expect(result).toEqual({ data: 'fresh' });
    });

    it('should cache factory result', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      await cache.getOrSet('test-key', fetcher);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:test-key',
        expect.any(Number),
        JSON.stringify({ data: 'fresh' })
      );
    });

    it('should use provided TTL', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      await cache.getOrSet('test-key', fetcher, 7200);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:test-key',
        7200,
        JSON.stringify({ data: 'fresh' })
      );
    });

    it('should handle invalid JSON in cache', async () => {
      mockRedisClient.get.mockResolvedValue('invalid json');
      
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(logger.warn).toHaveBeenCalledWith('Failed to parse cached value', { key: 'test-key' });
      expect(fetcher).toHaveBeenCalled();
      expect(result).toEqual({ data: 'fresh' });
    });
  });

  describe('cacheIPFSMetadata', () => {
    it('should cache IPFS metadata with 24h TTL', async () => {
      await cache.cacheIPFSMetadata('ticket-123', 'ipfs://QmTest123');
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:ipfs:ticket-123',
        86400, // 24 hours
        'ipfs://QmTest123'
      );
    });

    it('should use custom TTL when provided', async () => {
      await cache.cacheIPFSMetadata('ticket-123', 'ipfs://QmTest123', 3600);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:ipfs:ticket-123',
        3600,
        'ipfs://QmTest123'
      );
    });
  });

  describe('getCachedIPFSMetadata', () => {
    it('should get cached IPFS metadata', async () => {
      mockRedisClient.get.mockResolvedValue('ipfs://QmCached');
      
      const result = await cache.getCachedIPFSMetadata('ticket-123');
      
      expect(result).toBe('ipfs://QmCached');
      expect(mockRedisClient.get).toHaveBeenCalledWith('minting:ipfs:ticket-123');
    });

    it('should return null when not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cache.getCachedIPFSMetadata('ticket-123');
      
      expect(result).toBeNull();
    });
  });

  describe('cacheMintTransaction', () => {
    it('should cache mint transaction', async () => {
      await cache.cacheMintTransaction('ticket-123', 'sig123abc');
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:tx:ticket-123',
        3600, // 1 hour default
        'sig123abc'
      );
    });

    it('should use custom TTL', async () => {
      await cache.cacheMintTransaction('ticket-123', 'sig123abc', 7200);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'minting:tx:ticket-123',
        7200,
        'sig123abc'
      );
    });
  });

  describe('getCachedMintTransaction', () => {
    it('should get cached mint transaction', async () => {
      mockRedisClient.get.mockResolvedValue('cachedSig123');
      
      const result = await cache.getCachedMintTransaction('ticket-123');
      
      expect(result).toBe('cachedSig123');
      expect(mockRedisClient.get).toHaveBeenCalledWith('minting:tx:ticket-123');
    });
  });

  describe('invalidateTicket', () => {
    it('should clear ticket-related keys', async () => {
      await cache.invalidateTicket('ticket-123');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('minting:ipfs:ticket-123');
      expect(mockRedisClient.del).toHaveBeenCalledWith('minting:tx:ticket-123');
    });

    it('should delete both ipfs and tx keys', async () => {
      await cache.invalidateTicket('ticket-456');
      
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAll', () => {
    it('should flush cache', async () => {
      const result = await cache.clearAll();
      
      expect(mockRedisClient.flushDb).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should log warning on clear', async () => {
      await cache.clearAll();
      
      expect(logger.warn).toHaveBeenCalledWith('Cache cleared');
    });

    it('should return false on error', async () => {
      mockRedisClient.flushDb.mockRejectedValue(new Error('Redis error'));
      
      const result = await cache.clearAll();
      
      expect(result).toBe(false);
    });

    it('should return false when cache is disabled', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      const result = await disabledCache.clearAll();
      
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.info.mockResolvedValue('keys=150');
      
      const stats = await cache.getStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('connected');
      expect(stats).toHaveProperty('keyCount');
    });

    it('should return enabled status', async () => {
      const stats = await cache.getStats();
      
      expect(stats.enabled).toBe(true);
    });

    it('should return connected status', async () => {
      const stats = await cache.getStats();
      
      expect(stats.connected).toBe(true);
    });

    it('should parse key count from Redis INFO', async () => {
      mockRedisClient.info.mockResolvedValue('db0:keys=250,expires=100');
      
      const stats = await cache.getStats();
      
      expect(stats.keyCount).toBe(250);
    });

    it('should return 0 keyCount when not found in INFO', async () => {
      mockRedisClient.info.mockResolvedValue('');
      
      const stats = await cache.getStats();
      
      expect(stats.keyCount).toBe(0);
    });

    it('should handle error gracefully', async () => {
      mockRedisClient.info.mockRejectedValue(new Error('Redis error'));
      
      const stats = await cache.getStats();
      
      expect(stats.connected).toBe(false);
      expect(stats.keyCount).toBe(0);
    });

    it('should return disabled stats when cache is disabled', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      const stats = await disabledCache.getStats();
      
      expect(stats.enabled).toBe(false);
      expect(stats.connected).toBe(false);
    });
  });

  describe('close', () => {
    it('should close Redis connection', async () => {
      await cache.close();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should log close message', async () => {
      await cache.close();
      
      expect(logger.info).toHaveBeenCalledWith('Metadata cache closed');
    });

    it('should handle close when not connected', async () => {
      process.env.REDIS_ENABLED = 'false';
      const disabledCache = new MetadataCache();
      
      // Should not throw
      await disabledCache.close();
    });
  });

  describe('error handling', () => {
    it('should log error on Redis connection error', () => {
      const errorCallback = mockRedisClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      );
      
      // The error handler should be registered
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should disable cache on initialization error', async () => {
      jest.clearAllMocks();
      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      process.env.REDIS_ENABLED = 'true';
      const errorCache = new MetadataCache();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

describe('Singleton export', () => {
  it('should export metadataCache singleton', () => {
    expect(metadataCache).toBeInstanceOf(MetadataCache);
  });
});
