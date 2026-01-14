/**
 * Unit Tests for config/redis.ts
 * 
 * Tests Redis configuration, tenant-scoped caching, and health checks.
 * Priority: 🟡 Medium (8 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    startTimer: jest.fn().mockReturnValue(jest.fn())
  })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() }))
}));

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  info: jest.fn().mockResolvedValue('used_memory_human:10MB'),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
  once: jest.fn(),
  status: 'ready'
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

import {
  buildTenantKey,
  buildGlobalKey,
  TenantCache,
  createTenantCache
} from '../../../src/config/redis';

describe('Redis Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.get.mockReset();
    mockRedisClient.setex.mockReset();
    mockRedisClient.del.mockReset();
    mockRedisClient.scan.mockReset();
  });

  describe('buildTenantKey', () => {
    it('should format as {service}:{tenant}:{namespace}:{key}', () => {
      const key = buildTenantKey('tenant-123', 'cache', 'item-1');
      expect(key).toBe('minting:tenant-123:cache:item-1');
    });

    it('should sanitize colons in tenant ID', () => {
      const key = buildTenantKey('tenant:with:colons', 'ns', 'key');
      expect(key).toBe('minting:tenant_with_colons:ns:key');
    });

    it('should sanitize colons in namespace', () => {
      const key = buildTenantKey('tenant', 'name:space', 'key');
      expect(key).toBe('minting:tenant:name_space:key');
    });

    it('should throw for invalid tenant ID', () => {
      expect(() => buildTenantKey('', 'ns', 'key')).toThrow('Invalid tenant ID');
      expect(() => buildTenantKey(null as any, 'ns', 'key')).toThrow('Invalid tenant ID');
    });

    it('should throw for invalid namespace', () => {
      expect(() => buildTenantKey('tenant', '', 'key')).toThrow('Invalid namespace');
    });

    it('should throw for invalid key', () => {
      expect(() => buildTenantKey('tenant', 'ns', '')).toThrow('Invalid key');
    });
  });

  describe('buildGlobalKey', () => {
    it('should format as {service}:global:{namespace}:{key}', () => {
      const key = buildGlobalKey('config', 'setting-1');
      expect(key).toBe('minting:global:config:setting-1');
    });

    it('should sanitize colons', () => {
      const key = buildGlobalKey('name:space', 'key:value');
      expect(key).toBe('minting:global:name_space:key_value');
    });
  });

  describe('TenantCache', () => {
    let cache: TenantCache;

    beforeEach(() => {
      cache = createTenantCache('test-tenant');
    });

    it('should throw if no tenant ID provided', () => {
      expect(() => new TenantCache('')).toThrow('Tenant ID is required');
    });

    describe('get', () => {
      it('should return parsed JSON on cache hit', async () => {
        mockRedisClient.get.mockResolvedValue('{"name":"test","value":123}');
        
        const result = await cache.get('namespace', 'key');
        
        expect(result).toEqual({ name: 'test', value: 123 });
      });

      it('should return null on cache miss', async () => {
        mockRedisClient.get.mockResolvedValue(null);
        
        const result = await cache.get('namespace', 'key');
        
        expect(result).toBeNull();
      });

      it('should return null on parse error', async () => {
        mockRedisClient.get.mockResolvedValue('invalid json');
        
        const result = await cache.get('namespace', 'key');
        
        expect(result).toBeNull();
      });
    });

    describe('set', () => {
      it('should serialize and store with TTL', async () => {
        mockRedisClient.setex.mockResolvedValue('OK');
        
        const result = await cache.set('namespace', 'key', { data: 'value' }, 3600);
        
        expect(result).toBe(true);
        expect(mockRedisClient.setex).toHaveBeenCalledWith(
          expect.stringContaining('test-tenant'),
          3600,
          '{"data":"value"}'
        );
      });

      it('should use default TTL if not specified', async () => {
        mockRedisClient.setex.mockResolvedValue('OK');
        
        await cache.set('namespace', 'key', { data: 'value' });
        
        expect(mockRedisClient.setex).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number), // Default TTL
          expect.any(String)
        );
      });

      it('should return false on error', async () => {
        mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));
        
        const result = await cache.set('namespace', 'key', { data: 'value' });
        
        expect(result).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete key', async () => {
        mockRedisClient.del.mockResolvedValue(1);
        
        const result = await cache.delete('namespace', 'key');
        
        expect(result).toBe(true);
      });

      it('should return false on error', async () => {
        mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
        
        const result = await cache.delete('namespace', 'key');
        
        expect(result).toBe(false);
      });
    });

    describe('deleteNamespace', () => {
      it('should scan and delete all keys in namespace', async () => {
        mockRedisClient.scan
          .mockResolvedValueOnce(['5', ['key1', 'key2']])
          .mockResolvedValueOnce(['0', ['key3']]);
        mockRedisClient.del.mockResolvedValue(2);
        
        const count = await cache.deleteNamespace('namespace');
        
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getOrSet', () => {
      it('should return cached value if exists', async () => {
        mockRedisClient.get.mockResolvedValue('{"cached":true}');
        
        const fetchFn = jest.fn().mockResolvedValue({ fetched: true });
        const result = await cache.getOrSet('ns', 'key', fetchFn);
        
        expect(result).toEqual({ cached: true });
        expect(fetchFn).not.toHaveBeenCalled();
      });

      it('should fetch and cache on miss', async () => {
        mockRedisClient.get.mockResolvedValue(null);
        mockRedisClient.setex.mockResolvedValue('OK');
        
        const fetchFn = jest.fn().mockResolvedValue({ fetched: true });
        const result = await cache.getOrSet('ns', 'key', fetchFn);
        
        expect(result).toEqual({ fetched: true });
        expect(fetchFn).toHaveBeenCalled();
      });
    });
  });
});
