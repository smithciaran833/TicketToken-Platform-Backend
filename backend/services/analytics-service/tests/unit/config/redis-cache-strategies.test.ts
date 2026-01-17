/**
 * Redis Cache Strategies Tests
 */

import Redis from 'ioredis';
import { CacheManager, cacheStrategies, CacheStrategy } from '../../../src/config/redis-cache-strategies';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    mget: jest.fn().mockResolvedValue([]),
    info: jest.fn().mockResolvedValue('stats\nkey1:value1'),
    dbsize: jest.fn().mockResolvedValue(100),
  }));
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('cacheStrategies', () => {
  it('should have realTimeMetrics strategy', () => {
    expect(cacheStrategies.realTimeMetrics).toBeDefined();
    expect(cacheStrategies.realTimeMetrics.ttl).toBe(5);
    expect(cacheStrategies.realTimeMetrics.keyPrefix).toBe('rtm');
    expect(cacheStrategies.realTimeMetrics.version).toBe(1);
  });

  it('should have aggregatedMetrics strategy', () => {
    expect(cacheStrategies.aggregatedMetrics).toBeDefined();
    expect(cacheStrategies.aggregatedMetrics.ttl).toBe(300);
    expect(cacheStrategies.aggregatedMetrics.keyPrefix).toBe('agg');
  });

  it('should have customerProfile strategy', () => {
    expect(cacheStrategies.customerProfile).toBeDefined();
    expect(cacheStrategies.customerProfile.ttl).toBe(3600);
    expect(cacheStrategies.customerProfile.keyPrefix).toBe('cust');
  });

  it('should have dashboardConfig strategy', () => {
    expect(cacheStrategies.dashboardConfig).toBeDefined();
    expect(cacheStrategies.dashboardConfig.ttl).toBe(86400);
    expect(cacheStrategies.dashboardConfig.keyPrefix).toBe('dash');
  });

  it('should have widgetData strategy', () => {
    expect(cacheStrategies.widgetData).toBeDefined();
    expect(cacheStrategies.widgetData.ttl).toBe(60);
    expect(cacheStrategies.widgetData.keyPrefix).toBe('widget');
  });

  it('should have sessionData strategy', () => {
    expect(cacheStrategies.sessionData).toBeDefined();
    expect(cacheStrategies.sessionData.ttl).toBe(1800);
    expect(cacheStrategies.sessionData.keyPrefix).toBe('sess');
  });

  it('all strategies should have required properties', () => {
    Object.values(cacheStrategies).forEach((strategy: CacheStrategy) => {
      expect(strategy).toHaveProperty('ttl');
      expect(strategy).toHaveProperty('keyPrefix');
      expect(strategy).toHaveProperty('version');
      expect(typeof strategy.ttl).toBe('number');
      expect(typeof strategy.keyPrefix).toBe('string');
      expect(typeof strategy.version).toBe('number');
    });
  });
});

describe('CacheManager', () => {
  let mockRedis: jest.Mocked<Redis>;
  let cacheManager: CacheManager;

  beforeEach(() => {
    mockRedis = new Redis() as jest.Mocked<Redis>;
    cacheManager = new CacheManager(mockRedis, 'test-analytics');
    jest.clearAllMocks();
  });

  describe('set', () => {
    it('should set cache with strategy TTL', async () => {
      const data = { value: 'test' };
      await cacheManager.set('realTimeMetrics', 'key1', data);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test-analytics:rtm:v1:key1',
        5,
        JSON.stringify(data)
      );
    });

    it('should use custom TTL when provided', async () => {
      const data = { value: 'test' };
      await cacheManager.set('realTimeMetrics', 'key1', data, 30);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test-analytics:rtm:v1:key1',
        30,
        JSON.stringify(data)
      );
    });

    it('should handle unknown strategy gracefully', async () => {
      await cacheManager.set('unknownStrategy', 'key1', { data: 'test' });
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValueOnce(new Error('Redis error'));
      
      await expect(
        cacheManager.set('realTimeMetrics', 'key1', { data: 'test' })
      ).resolves.toBeUndefined();
    });
  });

  describe('get', () => {
    it('should return parsed data on cache hit', async () => {
      const cachedData = { value: 'cached' };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await cacheManager.get('realTimeMetrics', 'key1');

      expect(result).toEqual(cachedData);
      expect(mockRedis.get).toHaveBeenCalledWith('test-analytics:rtm:v1:key1');
    });

    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cacheManager.get('realTimeMetrics', 'key1');

      expect(result).toBeNull();
    });

    it('should return null for unknown strategy', async () => {
      const result = await cacheManager.get('unknownStrategy', 'key1');
      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await cacheManager.get('realTimeMetrics', 'key1');

      expect(result).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should delete keys matching pattern', async () => {
      mockRedis.keys.mockResolvedValueOnce(['key1', 'key2', 'key3']);

      await cacheManager.invalidate('realTimeMetrics', 'pattern');

      expect(mockRedis.keys).toHaveBeenCalledWith('test-analytics:rtm:v1:pattern*');
      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should delete all keys when no pattern provided', async () => {
      mockRedis.keys.mockResolvedValueOnce(['key1']);

      await cacheManager.invalidate('realTimeMetrics');

      expect(mockRedis.keys).toHaveBeenCalledWith('test-analytics:rtm:v1:*');
    });

    it('should not call del when no keys found', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);

      await cacheManager.invalidate('realTimeMetrics');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle unknown strategy gracefully', async () => {
      await cacheManager.invalidate('unknownStrategy');
      expect(mockRedis.keys).not.toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('should return cached data if exists', async () => {
      const cachedData = { cached: true };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));
      const fetchFn = jest.fn().mockResolvedValue({ fresh: true });

      const result = await cacheManager.getOrSet('realTimeMetrics', 'key1', fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache data if not cached', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const freshData = { fresh: true };
      const fetchFn = jest.fn().mockResolvedValue(freshData);

      const result = await cacheManager.getOrSet('realTimeMetrics', 'key1', fetchFn);

      expect(result).toEqual(freshData);
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should use custom TTL when provided', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const fetchFn = jest.fn().mockResolvedValue({ data: 'test' });

      await cacheManager.getOrSet('realTimeMetrics', 'key1', fetchFn, 120);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        120,
        expect.any(String)
      );
    });
  });

  describe('mget', () => {
    it('should return map of cached values', async () => {
      const values = [
        JSON.stringify({ id: 1 }),
        null,
        JSON.stringify({ id: 3 }),
      ];
      mockRedis.mget.mockResolvedValueOnce(values);

      const result = await cacheManager.mget('realTimeMetrics', ['id1', 'id2', 'id3']);

      expect(result.size).toBe(2);
      expect(result.get('id1')).toEqual({ id: 1 });
      expect(result.get('id3')).toEqual({ id: 3 });
      expect(result.has('id2')).toBe(false);
    });

    it('should return empty map for unknown strategy', async () => {
      const result = await cacheManager.mget('unknownStrategy', ['id1']);
      expect(result.size).toBe(0);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.mget.mockRejectedValueOnce(new Error('Redis error'));

      const result = await cacheManager.mget('realTimeMetrics', ['id1']);

      expect(result.size).toBe(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedis.mget.mockResolvedValueOnce(['invalid json', JSON.stringify({ valid: true })]);

      const result = await cacheManager.mget('realTimeMetrics', ['id1', 'id2']);

      expect(result.size).toBe(1);
      expect(result.get('id2')).toEqual({ valid: true });
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.info.mockResolvedValueOnce('keyspace_hits:100\nkeyspace_misses:50');
      mockRedis.dbsize.mockResolvedValueOnce(500);

      const stats = await cacheManager.getStats();

      expect(stats).toHaveProperty('dbSize', 500);
      expect(stats).toHaveProperty('info');
    });
  });
});
