/**
 * Unit Tests for Redis Service
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock ioredis before imports
jest.mock('ioredis');

describe('RedisService', () => {
  let mockRedisInstance: any;
  let RedisMock: jest.Mock;
  let redis: any;
  let redisService: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mock Redis instance with all methods
    mockRedisInstance = {
      connect: jest.fn<any>().mockResolvedValue(undefined),
      ping: jest.fn<any>().mockResolvedValue('PONG'),
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockResolvedValue('OK'),
      setex: jest.fn<any>().mockResolvedValue('OK'),
      del: jest.fn<any>().mockResolvedValue(1),
      exists: jest.fn<any>().mockResolvedValue(1),
      incr: jest.fn<any>().mockResolvedValue(1),
      expire: jest.fn<any>().mockResolvedValue(1),
      keys: jest.fn<any>().mockResolvedValue([]),
      scan: jest.fn<any>().mockResolvedValue(['0', []]),
      hset: jest.fn<any>().mockResolvedValue(1),
      hget: jest.fn<any>().mockResolvedValue(null),
      hgetall: jest.fn<any>().mockResolvedValue({}),
      sadd: jest.fn<any>().mockResolvedValue(1),
      sismember: jest.fn<any>().mockResolvedValue(0),
      disconnect: jest.fn(),
      eval: jest.fn<any>().mockResolvedValue(null)
    };

    // Mock Redis constructor
    RedisMock = jest.fn().mockImplementation(() => mockRedisInstance);
    jest.doMock('ioredis', () => RedisMock);

    // Import after mocking
    const redisModule = await import('../../../src/services/redis.service');
    redis = redisModule.redis;
    redisService = redisModule.redisService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      await redis.connect();

      expect(RedisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          retryStrategy: expect.any(Function),
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true
        })
      );
      expect(mockRedisInstance.connect).toHaveBeenCalled();
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should handle connection failure gracefully', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(redis.connect()).resolves.not.toThrow();
    });

    it('should use environment variables for config', async () => {
      process.env.REDIS_HOST = 'custom-host';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'secret';
      process.env.REDIS_TLS = 'true';

      jest.resetModules();
      const { redis: freshRedis } = await import('../../../src/services/redis.service');
      await freshRedis.connect();

      expect(RedisMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'custom-host',
          port: 6380,
          password: 'secret',
          tls: {}
        })
      );

      // Cleanup
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
      delete process.env.REDIS_TLS;
    });
  });

  describe('getClient', () => {
    it('should return null before connect', () => {
      expect(redis.getClient()).toBeNull();
    });

    it('should return client after connect', async () => {
      await redis.connect();
      expect(redis.getClient()).toBe(mockRedisInstance);
    });
  });

  describe('buildKey (via public methods)', () => {
    beforeEach(async () => {
      await redis.connect();
    });

    it('should build tenant-prefixed key', async () => {
      await redis.get('tenant-123', 'mykey');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('compliance:tenant-123:mykey');
    });

    it('should build global key when tenantId is null', async () => {
      await redis.get(null, 'mykey');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('compliance:global:mykey');
    });
  });

  describe('get', () => {
    it('should return null when client not connected', async () => {
      const result = await redis.get('tenant-123', 'key');
      expect(result).toBeNull();
    });

    it('should get value with tenant isolation', async () => {
      await redis.connect();
      mockRedisInstance.get.mockResolvedValue('stored-value');

      const result = await redis.get('tenant-123', 'key');

      expect(mockRedisInstance.get).toHaveBeenCalledWith('compliance:tenant-123:key');
      expect(result).toBe('stored-value');
    });
  });

  describe('set', () => {
    it('should return early when client not connected', async () => {
      await redis.set('tenant-123', 'key', 'value');
      expect(mockRedisInstance.set).not.toHaveBeenCalled();
    });

    it('should set value without TTL', async () => {
      await redis.connect();

      await redis.set('tenant-123', 'key', 'value');

      expect(mockRedisInstance.set).toHaveBeenCalledWith('compliance:tenant-123:key', 'value');
    });

    it('should set value with TTL using setex', async () => {
      await redis.connect();

      await redis.set('tenant-123', 'key', 'value', 3600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith('compliance:tenant-123:key', 3600, 'value');
    });
  });

  describe('del', () => {
    it('should return early when client not connected', async () => {
      await redis.del('tenant-123', 'key');
      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('should delete key with tenant isolation', async () => {
      await redis.connect();

      await redis.del('tenant-123', 'key');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('compliance:tenant-123:key');
    });
  });

  describe('getJson', () => {
    beforeEach(async () => {
      await redis.connect();
    });

    it('should return null when key not found', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await redis.getJson('tenant-123', 'key');

      expect(result).toBeNull();
    });

    it('should parse valid JSON', async () => {
      mockRedisInstance.get.mockResolvedValue('{"name":"test","count":42}');

      const result = await redis.getJson('tenant-123', 'key');

      expect(result).toEqual({ name: 'test', count: 42 });
    });

    it('should return null for invalid JSON', async () => {
      mockRedisInstance.get.mockResolvedValue('not-valid-json');

      const result = await redis.getJson('tenant-123', 'key');

      expect(result).toBeNull();
    });
  });

  describe('setJson', () => {
    it('should serialize object to JSON', async () => {
      await redis.connect();

      await redis.setJson('tenant-123', 'key', { name: 'test', count: 42 });

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'compliance:tenant-123:key',
        '{"name":"test","count":42}'
      );
    });

    it('should set JSON with TTL', async () => {
      await redis.connect();

      await redis.setJson('tenant-123', 'key', { data: 'value' }, 600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'compliance:tenant-123:key',
        600,
        '{"data":"value"}'
      );
    });
  });

  describe('exists', () => {
    it('should return false when client not connected', async () => {
      const result = await redis.exists('tenant-123', 'key');
      expect(result).toBe(false);
    });

    it('should return true when key exists', async () => {
      await redis.connect();
      mockRedisInstance.exists.mockResolvedValue(1);

      const result = await redis.exists('tenant-123', 'key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      await redis.connect();
      mockRedisInstance.exists.mockResolvedValue(0);

      const result = await redis.exists('tenant-123', 'key');

      expect(result).toBe(false);
    });
  });

  describe('incr', () => {
    it('should return 0 when client not connected', async () => {
      const result = await redis.incr('tenant-123', 'counter');
      expect(result).toBe(0);
    });

    it('should increment counter with tenant isolation', async () => {
      await redis.connect();
      mockRedisInstance.incr.mockResolvedValue(5);

      const result = await redis.incr('tenant-123', 'counter');

      expect(mockRedisInstance.incr).toHaveBeenCalledWith('compliance:tenant-123:counter');
      expect(result).toBe(5);
    });
  });

  describe('expire', () => {
    it('should return early when client not connected', async () => {
      await redis.expire('tenant-123', 'key', 3600);
      expect(mockRedisInstance.expire).not.toHaveBeenCalled();
    });

    it('should set expiry with tenant isolation', async () => {
      await redis.connect();

      await redis.expire('tenant-123', 'key', 3600);

      expect(mockRedisInstance.expire).toHaveBeenCalledWith('compliance:tenant-123:key', 3600);
    });
  });

  describe('keys', () => {
    it('should return empty array when client not connected', async () => {
      const result = await redis.keys('tenant-123', 'pattern*');
      expect(result).toEqual([]);
    });

    it('should return matching keys with tenant isolation', async () => {
      await redis.connect();
      mockRedisInstance.keys.mockResolvedValue([
        'compliance:tenant-123:session:1',
        'compliance:tenant-123:session:2'
      ]);

      const result = await redis.keys('tenant-123', 'session:*');

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('compliance:tenant-123:session:*');
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteAllForTenant', () => {
    it('should return 0 when client not connected', async () => {
      const result = await redis.deleteAllForTenant('tenant-123');
      expect(result).toBe(0);
    });

    it('should delete all keys for tenant using SCAN', async () => {
      await redis.connect();

      // First scan returns keys, second scan returns cursor 0 (done)
      mockRedisInstance.scan
        .mockResolvedValueOnce(['100', ['key1', 'key2', 'key3']])
        .mockResolvedValueOnce(['0', ['key4']]);

      const result = await redis.deleteAllForTenant('tenant-123');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith('0', 'MATCH', 'compliance:tenant-123:*', 'COUNT', 100);
      expect(mockRedisInstance.del).toHaveBeenCalledTimes(2);
      expect(result).toBe(4);
    });

    it('should handle empty tenant gracefully', async () => {
      await redis.connect();
      mockRedisInstance.scan.mockResolvedValue(['0', []]);

      const result = await redis.deleteAllForTenant('empty-tenant');

      expect(result).toBe(0);
      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });
  });

  describe('hash operations', () => {
    beforeEach(async () => {
      await redis.connect();
    });

    describe('hset', () => {
      it('should return early when client not connected', async () => {
        jest.resetModules();
        const { redis: freshRedis } = await import('../../../src/services/redis.service');

        await freshRedis.hset('tenant-123', 'hash', 'field', 'value');
        expect(mockRedisInstance.hset).not.toHaveBeenCalled();
      });

      it('should set hash field with tenant isolation', async () => {
        await redis.hset('tenant-123', 'hash', 'field', 'value');

        expect(mockRedisInstance.hset).toHaveBeenCalledWith(
          'compliance:tenant-123:hash',
          'field',
          'value'
        );
      });
    });

    describe('hget', () => {
      it('should return null when client not connected', async () => {
        jest.resetModules();
        const { redis: freshRedis } = await import('../../../src/services/redis.service');

        const result = await freshRedis.hget('tenant-123', 'hash', 'field');
        expect(result).toBeNull();
      });

      it('should get hash field with tenant isolation', async () => {
        mockRedisInstance.hget.mockResolvedValue('field-value');

        const result = await redis.hget('tenant-123', 'hash', 'field');

        expect(mockRedisInstance.hget).toHaveBeenCalledWith('compliance:tenant-123:hash', 'field');
        expect(result).toBe('field-value');
      });
    });

    describe('hgetall', () => {
      it('should return null when client not connected', async () => {
        jest.resetModules();
        const { redis: freshRedis } = await import('../../../src/services/redis.service');

        const result = await freshRedis.hgetall('tenant-123', 'hash');
        expect(result).toBeNull();
      });

      it('should get all hash fields with tenant isolation', async () => {
        mockRedisInstance.hgetall.mockResolvedValue({ field1: 'value1', field2: 'value2' });

        const result = await redis.hgetall('tenant-123', 'hash');

        expect(mockRedisInstance.hgetall).toHaveBeenCalledWith('compliance:tenant-123:hash');
        expect(result).toEqual({ field1: 'value1', field2: 'value2' });
      });
    });
  });

  describe('set operations', () => {
    describe('sadd', () => {
      it('should return 0 when client not connected', async () => {
        const result = await redis.sadd('tenant-123', 'set', 'member1', 'member2');
        expect(result).toBe(0);
      });

      it('should add members to set with tenant isolation', async () => {
        await redis.connect();
        mockRedisInstance.sadd.mockResolvedValue(2);

        const result = await redis.sadd('tenant-123', 'set', 'member1', 'member2');

        expect(mockRedisInstance.sadd).toHaveBeenCalledWith(
          'compliance:tenant-123:set',
          'member1',
          'member2'
        );
        expect(result).toBe(2);
      });
    });

    describe('sismember', () => {
      it('should return false when client not connected', async () => {
        const result = await redis.sismember('tenant-123', 'set', 'member');
        expect(result).toBe(false);
      });

      it('should check set membership with tenant isolation', async () => {
        await redis.connect();
        mockRedisInstance.sismember.mockResolvedValue(1);

        const result = await redis.sismember('tenant-123', 'set', 'member');

        expect(mockRedisInstance.sismember).toHaveBeenCalledWith(
          'compliance:tenant-123:set',
          'member'
        );
        expect(result).toBe(true);
      });

      it('should return false when member not in set', async () => {
        await redis.connect();
        mockRedisInstance.sismember.mockResolvedValue(0);

        const result = await redis.sismember('tenant-123', 'set', 'nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('distributed lock', () => {
    describe('acquireLock', () => {
      it('should return true when client not connected (allow operation)', async () => {
        const result = await redis.acquireLock('tenant-123', 'resource', 5000);
        expect(result).toBe(true);
      });

      it('should acquire lock successfully', async () => {
        await redis.connect();
        mockRedisInstance.set.mockResolvedValue('OK');

        const result = await redis.acquireLock('tenant-123', 'resource', 5000);

        expect(mockRedisInstance.set).toHaveBeenCalledWith(
          'compliance:tenant-123:lock:resource',
          '1',
          'PX',
          5000,
          'NX'
        );
        expect(result).toBe(true);
      });

      it('should fail to acquire lock when already held', async () => {
        await redis.connect();
        mockRedisInstance.set.mockResolvedValue(null);

        const result = await redis.acquireLock('tenant-123', 'resource', 5000);

        expect(result).toBe(false);
      });
    });

    describe('releaseLock', () => {
      it('should return early when client not connected', async () => {
        await redis.releaseLock('tenant-123', 'resource');
        expect(mockRedisInstance.del).not.toHaveBeenCalled();
      });

      it('should release lock', async () => {
        await redis.connect();

        await redis.releaseLock('tenant-123', 'resource');

        expect(mockRedisInstance.del).toHaveBeenCalledWith('compliance:tenant-123:lock:resource');
      });
    });
  });

  describe('close', () => {
    it('should handle close when not connected', async () => {
      await expect(redis.close()).resolves.not.toThrow();
    });

    it('should disconnect client', async () => {
      await redis.connect();

      await redis.close();

      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('should return false when client not connected', async () => {
      const result = await redis.ping();
      expect(result).toBe(false);
    });

    it('should return true on successful ping', async () => {
      await redis.connect();
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const result = await redis.ping();

      expect(result).toBe(true);
    });

    it('should return false on ping failure', async () => {
      await redis.connect();
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection lost'));

      const result = await redis.ping();

      expect(result).toBe(false);
    });

    it('should return false on wrong ping response', async () => {
      await redis.connect();
      mockRedisInstance.ping.mockResolvedValue('WRONG');

      const result = await redis.ping();

      expect(result).toBe(false);
    });
  });

  describe('redisService (backwards compatibility alias)', () => {
    beforeEach(async () => {
      await redis.connect();
    });

    describe('get', () => {
      it('should return parsed JSON when valid', async () => {
        mockRedisInstance.get.mockResolvedValue('{"key":"value"}');

        const result = await redisService.get('testkey');

        expect(mockRedisInstance.get).toHaveBeenCalledWith('compliance:global:testkey');
        expect(result).toEqual({ key: 'value' });
      });

      it('should return raw string when not valid JSON', async () => {
        mockRedisInstance.get.mockResolvedValue('plain-string');

        const result = await redisService.get('testkey');

        expect(result).toBe('plain-string');
      });

      it('should return null when key not found', async () => {
        mockRedisInstance.get.mockResolvedValue(null);

        const result = await redisService.get('testkey');

        expect(result).toBeNull();
      });
    });

    describe('setWithTTL', () => {
      it('should set string value with TTL', async () => {
        await redisService.setWithTTL('key', 'string-value', 300);

        expect(mockRedisInstance.setex).toHaveBeenCalledWith(
          'compliance:global:key',
          300,
          'string-value'
        );
      });

      it('should serialize object value with TTL', async () => {
        await redisService.setWithTTL('key', { data: 'test' }, 300);

        expect(mockRedisInstance.setex).toHaveBeenCalledWith(
          'compliance:global:key',
          300,
          '{"data":"test"}'
        );
      });
    });

    describe('setNX', () => {
      it('should return false when client not connected', async () => {
        jest.resetModules();
        const { redisService: freshService } = await import('../../../src/services/redis.service');

        const result = await freshService.setNX('key', 'value', 60);

        expect(result).toBe(false);
      });

      it('should set value only if not exists', async () => {
        mockRedisInstance.set.mockResolvedValue('OK');

        const result = await redisService.setNX('key', 'value', 60);

        expect(mockRedisInstance.set).toHaveBeenCalledWith('key', 'value', 'EX', 60, 'NX');
        expect(result).toBe(true);
      });

      it('should return false when key already exists', async () => {
        mockRedisInstance.set.mockResolvedValue(null);

        const result = await redisService.setNX('key', 'value', 60);

        expect(result).toBe(false);
      });
    });

    describe('eval', () => {
      it('should return null when client not connected', async () => {
        jest.resetModules();
        const { redisService: freshService } = await import('../../../src/services/redis.service');

        const result = await freshService.eval('return 1', [], []);

        expect(result).toBeNull();
      });

      it('should execute Lua script', async () => {
        mockRedisInstance.eval.mockResolvedValue('result');

        const result = await redisService.eval(
          'return redis.call("GET", KEYS[1])',
          ['key1'],
          ['arg1']
        );

        expect(mockRedisInstance.eval).toHaveBeenCalledWith(
          'return redis.call("GET", KEYS[1])',
          1,
          'key1',
          'arg1'
        );
        expect(result).toBe('result');
      });
    });
  });
});
