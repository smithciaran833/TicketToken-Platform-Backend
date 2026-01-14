/**
 * Comprehensive Unit Tests for src/utils/cache.ts
 *
 * Tests cache manager, metrics, invalidation, and warming strategies
 */

// Mock ioredis
const mockRedisMethods = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  mget: jest.fn(),
  pipeline: jest.fn(),
  quit: jest.fn(),
  info: jest.fn(),
  on: jest.fn(),
};

const mockPipeline = {
  setex: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

mockRedisMethods.pipeline.mockReturnValue(mockPipeline);

const mockRedis = jest.fn(() => mockRedisMethods);
jest.mock('ioredis', () => mockRedis);

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock prom-client
const mockCounter = {
  inc: jest.fn(),
};
const mockHistogram = {
  startTimer: jest.fn(() => jest.fn()),
};
const mockGauge = {
  set: jest.fn(),
};

jest.mock('prom-client', () => ({
  Counter: jest.fn(() => mockCounter),
  Histogram: jest.fn(() => mockHistogram),
  Gauge: jest.fn(() => mockGauge),
}));

// Mock metrics register
const mockRegister = {};
jest.mock('../../../src/utils/metrics', () => ({
  register: mockRegister,
}));

import {
  CacheManager,
  initializeCache,
  getCache,
  CacheKeys,
  buildTenantCacheKey,
  CacheInvalidation,
  CacheWarming,
  updateCacheMetrics,
  startCacheMetricsUpdates,
  stopCacheMetricsUpdates,
  cacheHits,
  cacheMisses,
  cacheErrors,
  cacheOperationDuration,
  cacheSize,
  cacheMemoryUsage,
} from '../../../src/utils/cache';

describe('src/utils/cache.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (global as any).cacheInstance = null;
  });

  // =============================================================================
  // CACHE MANAGER - CONSTRUCTOR
  // =============================================================================

  describe('CacheManager - Constructor', () => {
    it('should create Redis client with provided config', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        password: 'secret',
        db: 1,
        keyPrefix: 'test:',
        defaultTTL: 600,
      };

      new CacheManager(config);

      expect(mockRedis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: 'secret',
        db: 1,
        keyPrefix: 'test:',
        retryStrategy: expect.any(Function),
      });
    });

    it('should use default values when optional fields not provided', () => {
      const config = {
        host: 'redis',
        port: 6379,
      };

      new CacheManager(config);

      expect(mockRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          db: 0,
          keyPrefix: 'blockchain-indexer:',
        })
      );
    });

    it('should register connect event handler', () => {
      const config = { host: 'localhost', port: 6379 };
      new CacheManager(config);

      expect(mockRedisMethods.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register error event handler', () => {
      const config = { host: 'localhost', port: 6379 };
      new CacheManager(config);

      expect(mockRedisMethods.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log on connect event', () => {
      const config = { host: 'test-host', port: 6380 };
      new CacheManager(config);

      const connectHandler = mockRedisMethods.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { host: 'test-host', port: 6380 },
        'Redis cache connected'
      );
    });

    it('should log on error event', () => {
      const config = { host: 'localhost', port: 6379 };
      new CacheManager(config);

      const errorHandler = mockRedisMethods.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      const testError = new Error('Connection failed');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError },
        'Redis cache error'
      );
    });

    it('should configure retry strategy', () => {
      const config = { host: 'localhost', port: 6379 };
      new CacheManager(config);

      const calls: any[] = mockRedis.mock.calls;
      const redisConfig = calls[calls.length - 1]?.[0];
      expect(redisConfig).toBeDefined();
      
      const retryStrategy = redisConfig.retryStrategy;
      expect(retryStrategy).toBeDefined();

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(50)).toBe(2000);
    });
  });

  // =============================================================================
  // CACHE MANAGER - GET
  // =============================================================================

  describe('CacheManager - get()', () => {
    it('should return parsed value on cache hit', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const testData = { foo: 'bar', count: 42 };
      mockRedisMethods.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cache.get('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisMethods.get).toHaveBeenCalledWith('test-key');
      expect(mockCounter.inc).toHaveBeenCalledWith({ operation: 'get' });
    });

    it('should return null on cache miss', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.get.mockResolvedValue(null);

      const result = await cache.get('missing-key');

      expect(result).toBeNull();
      expect(mockCounter.inc).toHaveBeenCalledWith({ operation: 'get' });
    });

    it('should return null and log error on parse failure', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.get.mockResolvedValue('invalid json');

      const result = await cache.get('bad-key');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'get',
        error_type: 'parse_error',
      });
    });

    it('should handle Redis errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('error-key');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should record operation duration', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const mockTimer = jest.fn();
      mockHistogram.startTimer.mockReturnValue(mockTimer);
      mockRedisMethods.get.mockResolvedValue('"value"');

      await cache.get('test-key');

      expect(mockHistogram.startTimer).toHaveBeenCalledWith({ operation: 'get' });
      expect(mockTimer).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - SET
  // =============================================================================

  describe('CacheManager - set()', () => {
    it('should serialize and store value with TTL', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const testData = { foo: 'bar' };

      await cache.set('test-key', testData, 600);

      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        'test-key',
        600,
        JSON.stringify(testData)
      );
    });

    it('should use default TTL when not provided', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379, defaultTTL: 300 });
      await cache.set('test-key', 'value');

      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        'test-key',
        300,
        '"value"'
      );
    });

    it('should handle errors and log them', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.setex.mockRejectedValue(new Error('Write error'));

      await cache.set('test-key', 'value');

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'set',
        error_type: 'write_error',
      });
    });

    it('should record operation duration', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const mockTimer = jest.fn();
      mockHistogram.startTimer.mockReturnValue(mockTimer);

      await cache.set('test-key', 'value');

      expect(mockHistogram.startTimer).toHaveBeenCalledWith({ operation: 'set' });
      expect(mockTimer).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - DEL
  // =============================================================================

  describe('CacheManager - del()', () => {
    it('should delete key', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.del.mockResolvedValue(1);

      await cache.del('test-key');

      expect(mockRedisMethods.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.del.mockRejectedValue(new Error('Delete error'));

      await cache.del('test-key');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - DEL PATTERN
  // =============================================================================

  describe('CacheManager - delPattern()', () => {
    it('should delete all keys matching pattern', async () => {
      const cache = new CacheManager({
        host: 'localhost',
        port: 6379,
        keyPrefix: 'prefix:',
      });
      mockRedisMethods.keys.mockResolvedValue([
        'prefix:key1',
        'prefix:key2',
        'prefix:key3',
      ]);

      await cache.delPattern('key*');

      expect(mockRedisMethods.keys).toHaveBeenCalledWith('key*');
      expect(mockRedisMethods.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should not call del if no keys found', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.keys.mockResolvedValue([]);

      await cache.delPattern('missing*');

      expect(mockRedisMethods.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.keys.mockRejectedValue(new Error('Keys error'));

      await cache.delPattern('pattern*');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - EXISTS
  // =============================================================================

  describe('CacheManager - exists()', () => {
    it('should return true when key exists', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.exists.mockResolvedValue(1);

      const result = await cache.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedisMethods.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.exists.mockResolvedValue(0);

      const result = await cache.exists('missing-key');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.exists.mockRejectedValue(new Error('Exists error'));

      const result = await cache.exists('error-key');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - GET OR SET
  // =============================================================================

  describe('CacheManager - getOrSet()', () => {
    it('should return cached value if exists', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const cachedValue = { data: 'cached' };
      mockRedisMethods.get.mockResolvedValue(JSON.stringify(cachedValue));

      const fetchFn = jest.fn();
      const result = await cache.getOrSet('test-key', fetchFn);

      expect(result).toEqual(cachedValue);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith({ key: 'test-key' }, 'Cache hit');
    });

    it('should fetch and cache value on miss', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const fetchedValue = { data: 'fetched' };
      mockRedisMethods.get.mockResolvedValue(null);

      const fetchFn = jest.fn().mockResolvedValue(fetchedValue);
      const result = await cache.getOrSet('test-key', fetchFn, 600);

      expect(result).toEqual(fetchedValue);
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        'test-key',
        600,
        JSON.stringify(fetchedValue)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith({ key: 'test-key' }, 'Cache miss');
    });
  });

  // =============================================================================
  // CACHE MANAGER - INCR
  // =============================================================================

  describe('CacheManager - incr()', () => {
    it('should increment counter and return new value', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.incr.mockResolvedValue(5);

      const result = await cache.incr('counter');

      expect(result).toBe(5);
      expect(mockRedisMethods.incr).toHaveBeenCalledWith('counter');
    });

    it('should return 0 on error', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.incr.mockRejectedValue(new Error('Incr error'));

      const result = await cache.incr('counter');

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - EXPIRE
  // =============================================================================

  describe('CacheManager - expire()', () => {
    it('should set expiration on key', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.expire.mockResolvedValue(1);

      await cache.expire('test-key', 600);

      expect(mockRedisMethods.expire).toHaveBeenCalledWith('test-key', 600);
    });

    it('should handle errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.expire.mockRejectedValue(new Error('Expire error'));

      await cache.expire('test-key', 600);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - MGET
  // =============================================================================

  describe('CacheManager - mget()', () => {
    it('should return multiple values', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.mget.mockResolvedValue([
        JSON.stringify({ a: 1 }),
        JSON.stringify({ b: 2 }),
        null,
      ]);

      const result = await cache.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual([{ a: 1 }, { b: 2 }, null]);
      expect(mockRedisMethods.mget).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should return nulls on error', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.mget.mockRejectedValue(new Error('Mget error'));

      const result = await cache.mget(['key1', 'key2']);

      expect(result).toEqual([null, null]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - MSET
  // =============================================================================

  describe('CacheManager - mset()', () => {
    it('should set multiple keys with pipeline', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      const entries = [
        { key: 'key1', value: { a: 1 }, ttl: 600 },
        { key: 'key2', value: { b: 2 } },
      ];

      await cache.mset(entries);

      expect(mockRedisMethods.pipeline).toHaveBeenCalled();
      expect(mockPipeline.setex).toHaveBeenCalledWith('key1', 600, JSON.stringify({ a: 1 }));
      expect(mockPipeline.setex).toHaveBeenCalledWith('key2', 300, JSON.stringify({ b: 2 }));
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockPipeline.exec.mockRejectedValue(new Error('Mset error'));

      await cache.mset([{ key: 'key1', value: 'val1' }]);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - CLEAR
  // =============================================================================

  describe('CacheManager - clear()', () => {
    it('should delete all keys with prefix', async () => {
      const cache = new CacheManager({
        host: 'localhost',
        port: 6379,
        keyPrefix: 'test:',
      });
      mockRedisMethods.keys.mockResolvedValue(['test:key1', 'test:key2']);

      await cache.clear();

      expect(mockRedisMethods.keys).toHaveBeenCalledWith('*');
      expect(mockRedisMethods.del).toHaveBeenCalledWith('key1', 'key2');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should not call del if no keys found', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.keys.mockResolvedValue([]);

      await cache.clear();

      expect(mockRedisMethods.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.keys.mockRejectedValue(new Error('Clear error'));

      await cache.clear();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE MANAGER - DISCONNECT
  // =============================================================================

  describe('CacheManager - disconnect()', () => {
    it('should quit Redis connection', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.quit.mockResolvedValue('OK');

      await cache.disconnect();

      expect(mockRedisMethods.quit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Redis cache disconnected');
    });
  });

  // =============================================================================
  // CACHE MANAGER - GET STATS
  // =============================================================================

  describe('CacheManager - getStats()', () => {
    it('should return cache statistics', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.info.mockResolvedValue('used_memory_human:1.5M\nother_stat:value');
      mockRedisMethods.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      const stats = await cache.getStats();

      expect(stats).toEqual({
        keyCount: 3,
        memoryUsed: '1.5M',
      });
    });

    it('should handle info parsing errors', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.info.mockResolvedValue('no_memory_info');
      mockRedisMethods.keys.mockResolvedValue([]);

      const stats = await cache.getStats();

      expect(stats).toEqual({
        keyCount: 0,
        memoryUsed: 'unknown',
      });
    });

    it('should return defaults on error', async () => {
      const cache = new CacheManager({ host: 'localhost', port: 6379 });
      mockRedisMethods.info.mockRejectedValue(new Error('Info error'));

      const stats = await cache.getStats();

      expect(stats).toEqual({
        keyCount: 0,
        memoryUsed: 'unknown',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // SINGLETON FUNCTIONS
  // =============================================================================

  describe('Singleton Functions', () => {
    it('should initialize cache and return instance', () => {
      const config = { host: 'localhost', port: 6379 };
      const cache = initializeCache(config);

      expect(cache).toBeInstanceOf(CacheManager);
      expect(mockRedis).toHaveBeenCalled();
    });

    it('should return existing instance if already initialized', () => {
      const config = { host: 'localhost', port: 6379 };
      const cache1 = initializeCache(config);
      const cache2 = initializeCache(config);

      expect(cache1).toBe(cache2);
      expect(mockLogger.warn).toHaveBeenCalledWith('Cache manager already initialized');
    });

    it('should get cache instance', () => {
      const config = { host: 'localhost', port: 6379 };
      initializeCache(config);

      const cache = getCache();
      expect(cache).toBeInstanceOf(CacheManager);
    });

    it('should throw error if cache not initialized', () => {
      expect(() => getCache()).toThrow(
        'Cache manager not initialized. Call initializeCache() first.'
      );
    });
  });

  // =============================================================================
  // CACHE KEYS
  // =============================================================================

  describe('CacheKeys', () => {
    it('should build transaction key without tenant', () => {
      const key = CacheKeys.transaction('sig123');
      expect(key).toBe('tx:sig123');
    });

    it('should build transaction key with tenant', () => {
      const key = CacheKeys.transaction('sig123', 'tenant1');
      expect(key).toBe('tenant:tenant1:tx:sig123');
    });

    it('should build wallet activity key without tenant', () => {
      const key = CacheKeys.walletActivity('addr123', 0, 10);
      expect(key).toBe('wallet:addr123:activity:0:10');
    });

    it('should build wallet activity key with tenant', () => {
      const key = CacheKeys.walletActivity('addr123', 0, 10, 'tenant1');
      expect(key).toBe('tenant:tenant1:wallet:addr123:activity:0:10');
    });

    it('should build nft history key', () => {
      const key1 = CacheKeys.nftHistory('token123');
      const key2 = CacheKeys.nftHistory('token123', 'tenant1');
      
      expect(key1).toBe('nft:token123:history');
      expect(key2).toBe('tenant:tenant1:nft:token123:history');
    });

    it('should build marketplace activity key', () => {
      const key1 = CacheKeys.marketplaceActivity('mp1', 0, 10);
      const key2 = CacheKeys.marketplaceActivity(undefined, 0, 10, 'tenant1');
      
      expect(key1).toBe('marketplace:mp1:0:10');
      expect(key2).toBe('tenant:tenant1:marketplace:all:0:10');
    });

    it('should build sync status key', () => {
      const key = CacheKeys.syncStatus();
      expect(key).toBe('sync:status');
    });

    it('should build slot transactions key', () => {
      const key = CacheKeys.slotTransactions(12345);
      expect(key).toBe('slot:12345:transactions');
    });

    it('should build tenant pattern key', () => {
      const key = CacheKeys.tenantPattern('tenant1');
      expect(key).toBe('tenant:tenant1:*');
    });
  });

  // =============================================================================
  // BUILD TENANT CACHE KEY
  // =============================================================================

  describe('buildTenantCacheKey()', () => {
    it('should return base key when no tenant', () => {
      const key = buildTenantCacheKey('user:123');
      expect(key).toBe('user:123');
    });

    it('should prefix with tenant when provided', () => {
      const key = buildTenantCacheKey('user:123', 'tenant1');
      expect(key).toBe('tenant:tenant1:user:123');
    });
  });

  // =============================================================================
  // CACHE INVALIDATION
  // =============================================================================

  describe('CacheInvalidation', () => {
    beforeEach(() => {
      initializeCache({ host: 'localhost', port: 6379 });
    });

    it('should invalidate transaction cache', async () => {
      await CacheInvalidation.onTransactionProcessed('sig123', 'tenant1');

      expect(mockRedisMethods.del).toHaveBeenCalledWith('tenant:tenant1:tx:sig123');
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should invalidate wallet activity cache', async () => {
      mockRedisMethods.keys.mockResolvedValue([]);
      await CacheInvalidation.onWalletActivityChanged('addr123', 'tenant1');

      expect(mockRedisMethods.keys).toHaveBeenCalledWith('tenant:tenant1:wallet:addr123:*');
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should invalidate NFT history cache', async () => {
      await CacheInvalidation.onNFTOwnershipChanged('token123', 'tenant1');

      expect(mockRedisMethods.del).toHaveBeenCalledWith('tenant:tenant1:nft:token123:history');
    });

    it('should invalidate marketplace cache', async () => {
      mockRedisMethods.keys.mockResolvedValue([]);
      await CacheInvalidation.onMarketplaceEvent('mp1', 'tenant1');

      expect(mockRedisMethods.keys).toHaveBeenCalledWith('tenant:tenant1:marketplace:*');
    });

    it('should invalidate sync status cache', async () => {
      await CacheInvalidation.onSyncStatusChanged();

      expect(mockRedisMethods.del).toHaveBeenCalledWith('sync:status');
    });

    it('should invalidate all tenant cache', async () => {
      mockRedisMethods.keys.mockResolvedValue([]);
      await CacheInvalidation.onTenantDataChanged('tenant1');

      expect(mockRedisMethods.keys).toHaveBeenCalledWith('tenant:tenant1:*');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should batch invalidate cache keys', async () => {
      await CacheInvalidation.batchInvalidate(['key1', 'key2', 'key3']);

      expect(mockRedisMethods.del).toHaveBeenCalledTimes(3);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle invalidation errors gracefully', async () => {
      mockRedisMethods.del.mockRejectedValue(new Error('Del error'));
      await CacheInvalidation.onTransactionProcessed('sig123');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // CACHE WARMING
  // =============================================================================

  describe('CacheWarming', () => {
    beforeEach(() => {
      initializeCache({ host: 'localhost', port: 6379 });
    });

    it('should warm sync status cache', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ slot: 12345 });
      await CacheWarming.warmSyncStatus(fetchFn);

      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedisMethods.setex).toHaveBeenCalledWith(
        'sync:status',
        60,
        JSON.stringify({ slot: 12345 })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Warmed sync status cache');
    });

    it('should handle warm sync status errors', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Fetch error'));
      await CacheWarming.warmSyncStatus(fetchFn);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should warm multiple entries in parallel', async () => {
      const entries = [
        { key: 'key1', fetchFn: jest.fn().mockResolvedValue({ data: 1 }), ttl: 600 },
        { key: 'key2', fetchFn: jest.fn().mockResolvedValue({ data: 2 }) },
        { key: 'key3', fetchFn: jest.fn().mockRejectedValue(new Error('Fetch error')) },
      ];

      const result = await CacheWarming.warmMultiple(entries);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should warm recent slots cache', async () => {
      const fetchSlotTransactions = jest.fn()
        .mockResolvedValueOnce([{ tx: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tx: 2 }]);

      await CacheWarming.warmRecentSlots(12347, 2, fetchSlotTransactions);

      expect(fetchSlotTransactions).toHaveBeenCalledTimes(3);
      expect(mockRedisMethods.setex).toHaveBeenCalledTimes(2); // Only for non-empty slots
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle slot warming errors gracefully', async () => {
      const fetchSlotTransactions = jest.fn().mockRejectedValue(new Error('Fetch error'));
      await CacheWarming.warmRecentSlots(12345, 1, fetchSlotTransactions);

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should schedule periodic cache warming', () => {
      jest.useFakeTimers();
      const warmingFn = jest.fn().mockResolvedValue(undefined);

      const intervalId = CacheWarming.scheduleWarming(60000, warmingFn);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { intervalMs: 60000 },
        'Scheduled periodic cache warming'
      );

      jest.advanceTimersByTime(60000);
      expect(warmingFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60000);
      expect(warmingFn).toHaveBeenCalledTimes(2);

      clearInterval(intervalId);
      jest.useRealTimers();
    });

    it('should stop scheduled cache warming', () => {
      jest.useFakeTimers();
      const warmingFn = jest.fn().mockResolvedValue(undefined);
      const intervalId = CacheWarming.scheduleWarming(60000, warmingFn);

      CacheWarming.stopScheduledWarming(intervalId);

      expect(mockLogger.info).toHaveBeenCalledWith('Stopped scheduled cache warming');

      jest.advanceTimersByTime(120000);
      expect(warmingFn).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle warming function errors in scheduled warming', async () => {
      jest.useFakeTimers();
      const warmingFn = jest.fn().mockRejectedValue(new Error('Warming error'));

      CacheWarming.scheduleWarming(60000, warmingFn);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockLogger.error).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // =============================================================================
  // CACHE METRICS
  // =============================================================================

  describe('Cache Metrics', () => {
    beforeEach(() => {
      initializeCache({ host: 'localhost', port: 6379 });
    });

    it('should update cache metrics', async () => {
      mockRedisMethods.info.mockResolvedValue('used_memory_human:2.5M');
      mockRedisMethods.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      await updateCacheMetrics();

      expect(mockGauge.set).toHaveBeenCalledWith(3);
      expect(mockGauge.set).toHaveBeenCalledWith(2.5 * 1024 * 1024);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should parse different memory units', async () => {
      mockRedisMethods.keys.mockResolvedValue([]);
      
      // Test K
      mockRedisMethods.info.mockResolvedValue('used_memory_human:512K');
      await updateCacheMetrics();
      expect(mockGauge.set).toHaveBeenCalledWith(512 * 1024);

      // Test G
      mockRedisMethods.info.mockResolvedValue('used_memory_human:1.5G');
      await updateCacheMetrics();
      expect(mockGauge.set).toHaveBeenCalledWith(1.5 * 1024 * 1024 * 1024);
    });

    it('should handle metrics update errors', async () => {
      mockRedisMethods.info.mockRejectedValue(new Error('Info error'));

      await updateCacheMetrics();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should start periodic metrics updates', () => {
      jest.useFakeTimers();
      startCacheMetricsUpdates(30000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { intervalMs: 30000 },
        'Started cache metrics updates'
      );

      jest.useRealTimers();
      stopCacheMetricsUpdates();
    });

    it('should not start if already running', () => {
      jest.useFakeTimers();
      startCacheMetricsUpdates(30000);
      mockLogger.info.mockClear();
      
      startCacheMetricsUpdates(30000);
      
      expect(mockLogger.info).not.toHaveBeenCalled();

      jest.useRealTimers();
      stopCacheMetricsUpdates();
    });

    it('should stop periodic metrics updates', () => {
      jest.useFakeTimers();
      startCacheMetricsUpdates(30000);
      
      stopCacheMetricsUpdates();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopped cache metrics updates');

      jest.useRealTimers();
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export all metrics', () => {
      expect(cacheHits).toBeDefined();
      expect(cacheMisses).toBeDefined();
      expect(cacheErrors).toBeDefined();
      expect(cacheOperationDuration).toBeDefined();
      expect(cacheSize).toBeDefined();
      expect(cacheMemoryUsage).toBeDefined();
    });

    it('should export CacheManager class', () => {
      expect(CacheManager).toBeDefined();
      expect(typeof CacheManager).toBe('function');
    });

    it('should export singleton functions', () => {
      expect(typeof initializeCache).toBe('function');
      expect(typeof getCache).toBe('function');
    });

    it('should export CacheKeys', () => {
      expect(CacheKeys).toBeDefined();
      expect(typeof CacheKeys.transaction).toBe('function');
    });

    it('should export CacheInvalidation', () => {
      expect(CacheInvalidation).toBeDefined();
      expect(typeof CacheInvalidation.onTransactionProcessed).toBe('function');
    });

    it('should export CacheWarming', () => {
      expect(CacheWarming).toBeDefined();
      expect(typeof CacheWarming.warmSyncStatus).toBe('function');
    });
  });
});
