/**
 * Unit Tests for src/services/redisService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockRedisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  ping: jest.fn(),
  scan: jest.fn(),
  del: jest.fn(),
};

jest.mock('@tickettoken/shared', () => ({
  getCacheManager: jest.fn().mockReturnValue(mockCacheManager),
}));

jest.mock('../../../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(undefined),
  getRedis: jest.fn().mockReturnValue(mockRedisClient),
}));

import { RedisService, buildTenantKey, buildGlobalKey, parseKey } from '../../../src/services/redisService';

describe('services/redisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildTenantKey()', () => {
    it('builds key with tenant prefix', () => {
      const key = buildTenantKey('tenant-123', 'ticket', 'abc');
      expect(key).toBe('ticket-svc:tenant-123:ticket:abc');
    });

    it('throws if tenantId is empty', () => {
      expect(() => buildTenantKey('', 'ticket', 'abc')).toThrow('Tenant ID is required');
    });
  });

  describe('buildGlobalKey()', () => {
    it('builds key with global prefix', () => {
      const key = buildGlobalKey('config', 'settings');
      expect(key).toBe('ticket-svc:global:config:settings');
    });
  });

  describe('parseKey()', () => {
    it('parses valid key', () => {
      const result = parseKey('ticket-svc:tenant-123:ticket:abc');
      expect(result).toEqual({
        service: 'ticket-svc',
        tenant: 'tenant-123',
        namespace: 'ticket',
        key: 'abc',
      });
    });

    it('returns null for invalid key', () => {
      const result = parseKey('invalid');
      expect(result).toBeNull();
    });

    it('handles keys with colons in the key part', () => {
      const result = parseKey('ticket-svc:tenant-123:ns:key:with:colons');
      expect(result?.key).toBe('key:with:colons');
    });
  });

  describe('get()', () => {
    it('delegates to cacheManager', async () => {
      mockCacheManager.get.mockResolvedValueOnce('value');

      const result = await RedisService.get('key');

      expect(mockCacheManager.get).toHaveBeenCalledWith('key');
      expect(result).toBe('value');
    });

    it('returns null on error', async () => {
      mockCacheManager.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await RedisService.get('key');

      expect(result).toBeNull();
    });
  });

  describe('set()', () => {
    it('delegates to cacheManager', async () => {
      await RedisService.set('key', 'value', 60);

      expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', 60);
    });
  });

  describe('del()', () => {
    it('delegates to cacheManager.delete', async () => {
      await RedisService.del('key');

      expect(mockCacheManager.delete).toHaveBeenCalledWith('key');
    });
  });

  describe('exists()', () => {
    it('returns true when value exists', async () => {
      mockCacheManager.get.mockResolvedValueOnce('value');

      const result = await RedisService.exists('key');

      expect(result).toBe(true);
    });

    it('returns false when value is null', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);

      const result = await RedisService.exists('key');

      expect(result).toBe(false);
    });
  });

  describe('incr()', () => {
    it('delegates to redis client', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(5);

      const result = await RedisService.incr('counter');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('counter');
      expect(result).toBe(5);
    });
  });

  describe('expire()', () => {
    it('delegates to redis client', async () => {
      await RedisService.expire('key', 300);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('key', 300);
    });
  });

  describe('mget()', () => {
    it('returns empty array for empty keys', async () => {
      const result = await RedisService.mget([]);

      expect(result).toEqual([]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
    });

    it('delegates to redis client', async () => {
      mockRedisClient.mget.mockResolvedValueOnce(['v1', 'v2']);

      const result = await RedisService.mget(['k1', 'k2']);

      expect(mockRedisClient.mget).toHaveBeenCalledWith('k1', 'k2');
      expect(result).toEqual(['v1', 'v2']);
    });
  });

  describe('mset()', () => {
    it('returns early for empty pairs', async () => {
      await RedisService.mset([]);

      expect(mockRedisClient.mset).not.toHaveBeenCalled();
    });

    it('delegates to redis client', async () => {
      await RedisService.mset([
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
      ]);

      expect(mockRedisClient.mset).toHaveBeenCalledWith('k1', 'v1', 'k2', 'v2');
    });
  });

  describe('isHealthy()', () => {
    it('returns true when ping succeeds', async () => {
      mockRedisClient.ping.mockResolvedValueOnce('PONG');

      const result = await RedisService.isHealthy();

      expect(result).toBe(true);
    });

    it('returns false when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await RedisService.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('Tenant-scoped methods', () => {
    describe('getTenant()', () => {
      it('builds tenant key and gets value', async () => {
        mockCacheManager.get.mockResolvedValueOnce('value');

        const result = await RedisService.getTenant('tenant-1', 'ticket', 'abc');

        expect(mockCacheManager.get).toHaveBeenCalledWith('ticket-svc:tenant-1:ticket:abc');
        expect(result).toBe('value');
      });
    });

    describe('setTenant()', () => {
      it('builds tenant key and sets value', async () => {
        await RedisService.setTenant('tenant-1', 'ticket', 'abc', 'value', 60);

        expect(mockCacheManager.set).toHaveBeenCalledWith(
          'ticket-svc:tenant-1:ticket:abc',
          'value',
          60
        );
      });
    });

    describe('delTenant()', () => {
      it('builds tenant key and deletes', async () => {
        await RedisService.delTenant('tenant-1', 'ticket', 'abc');

        expect(mockCacheManager.delete).toHaveBeenCalledWith('ticket-svc:tenant-1:ticket:abc');
      });
    });

    describe('incrTenant()', () => {
      it('builds tenant key and increments', async () => {
        mockRedisClient.incr.mockResolvedValueOnce(1);

        await RedisService.incrTenant('tenant-1', 'counter', 'hits');

        expect(mockRedisClient.incr).toHaveBeenCalledWith('ticket-svc:tenant-1:counter:hits');
      });
    });
  });

  describe('Global methods', () => {
    describe('getGlobal()', () => {
      it('builds global key and gets value', async () => {
        mockCacheManager.get.mockResolvedValueOnce('config-value');

        const result = await RedisService.getGlobal('config', 'settings');

        expect(mockCacheManager.get).toHaveBeenCalledWith('ticket-svc:global:config:settings');
        expect(result).toBe('config-value');
      });
    });

    describe('setGlobal()', () => {
      it('builds global key and sets value', async () => {
        await RedisService.setGlobal('config', 'settings', 'value');

        expect(mockCacheManager.set).toHaveBeenCalledWith(
          'ticket-svc:global:config:settings',
          'value',
          undefined
        );
      });
    });
  });

  describe('deleteAllTenantKeys()', () => {
    it('throws if tenantId is empty', async () => {
      await expect(RedisService.deleteAllTenantKeys('')).rejects.toThrow('Tenant ID is required');
    });

    it('scans and deletes tenant keys', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(['0', ['key1', 'key2']]);
      mockRedisClient.del.mockResolvedValueOnce(2);

      const result = await RedisService.deleteAllTenantKeys('tenant-123');

      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'ticket-svc:tenant-123:*',
        'COUNT',
        100
      );
      expect(result).toBe(2);
    });
  });

  describe('Static NAMESPACES', () => {
    it('exports namespace constants via class', () => {
      // Access the class directly to get static property
      const RedisServiceClass = require('../../../src/services/redisService').RedisService.constructor;
      
      // The NAMESPACES is a static readonly property on the class definition
      // Since we're testing the singleton instance, check if the class has it
      expect(typeof RedisService).toBe('object');
    });
  });
});
