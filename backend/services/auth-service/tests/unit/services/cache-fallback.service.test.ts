const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../../src/utils/metrics', () => ({
  register: { registerMetric: jest.fn() },
}));
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

import { cacheFallbackService } from '../../../src/services/cache-fallback.service';

describe('CacheFallbackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheUserProfile', () => {
    it('stores profile with 5 minute TTL', async () => {
      const profile = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'customer',
        tenant_id: 'tenant-1',
        email_verified: true,
        mfa_enabled: false,
      };

      await cacheFallbackService.cacheUserProfile('user-123', 'tenant-1', profile);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'cache:user:tenant-1:user-123:profile',
        300, // 5 minutes
        expect.any(String)
      );
    });

    it('handles Redis errors silently', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));

      await expect(
        cacheFallbackService.cacheUserProfile('user-123', 'tenant-1', {})
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getCachedUserProfile', () => {
    it('returns parsed profile on cache hit', async () => {
      const cached = {
        id: 'user-123',
        email: 'test@example.com',
        cached_at: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await cacheFallbackService.getCachedUserProfile('user-123', 'tenant-1');

      expect(result).toEqual(cached);
    });

    it('returns null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheFallbackService.getCachedUserProfile('user-123', 'tenant-1');

      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      const result = await cacheFallbackService.getCachedUserProfile('user-123', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('cacheUserPermissions', () => {
    it('stores permissions with 1 minute TTL (shorter for security)', async () => {
      await cacheFallbackService.cacheUserPermissions(
        'user-123',
        'tenant-1',
        ['read', 'write'],
        'admin'
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'cache:user:tenant-1:user-123:permissions',
        60, // 1 minute
        expect.any(String)
      );
    });
  });

  describe('invalidateUserCache', () => {
    it('deletes both profile and permissions keys', async () => {
      await cacheFallbackService.invalidateUserCache('user-123', 'tenant-1');

      expect(mockRedis.del).toHaveBeenCalledWith('cache:user:tenant-1:user-123:profile');
      expect(mockRedis.del).toHaveBeenCalledWith('cache:user:tenant-1:user-123:permissions');
    });
  });

  describe('withFallback', () => {
    it('returns DB result when available', async () => {
      const dbData = { id: 'user-123', name: 'John' };
      const dbOp = jest.fn().mockResolvedValue(dbData);
      const cacheOp = jest.fn();

      const result = await cacheFallbackService.withFallback('test', dbOp, cacheOp);

      expect(result).toEqual({ data: dbData, fromCache: false });
      expect(cacheOp).not.toHaveBeenCalled();
    });

    it('falls back to cache on ECONNREFUSED', async () => {
      const cachedData = { id: 'user-123', name: 'John' };
      const dbError = new Error('Connection refused');
      (dbError as any).code = 'ECONNREFUSED';

      const dbOp = jest.fn().mockRejectedValue(dbError);
      const cacheOp = jest.fn().mockResolvedValue(cachedData);

      const result = await cacheFallbackService.withFallback('test', dbOp, cacheOp);

      expect(result).toEqual({ data: cachedData, fromCache: true });
    });

    it('falls back to cache on ETIMEDOUT', async () => {
      const cachedData = { id: 'user-123' };
      const dbError = new Error('Timeout');
      (dbError as any).code = 'ETIMEDOUT';

      const dbOp = jest.fn().mockRejectedValue(dbError);
      const cacheOp = jest.fn().mockResolvedValue(cachedData);

      const result = await cacheFallbackService.withFallback('test', dbOp, cacheOp);

      expect(result.fromCache).toBe(true);
    });

    it('falls back on Connection terminated message', async () => {
      const cachedData = { id: 'user-123' };
      const dbError = new Error('Connection terminated unexpectedly');

      const dbOp = jest.fn().mockRejectedValue(dbError);
      const cacheOp = jest.fn().mockResolvedValue(cachedData);

      const result = await cacheFallbackService.withFallback('test', dbOp, cacheOp);

      expect(result.fromCache).toBe(true);
    });

    it('rethrows non-connection errors', async () => {
      const dbError = new Error('Constraint violation');
      const dbOp = jest.fn().mockRejectedValue(dbError);
      const cacheOp = jest.fn();

      await expect(cacheFallbackService.withFallback('test', dbOp, cacheOp))
        .rejects.toThrow('Constraint violation');

      expect(cacheOp).not.toHaveBeenCalled();
    });

    it('throws original error if cache also misses', async () => {
      const dbError = new Error('Connection refused');
      (dbError as any).code = 'ECONNREFUSED';

      const dbOp = jest.fn().mockRejectedValue(dbError);
      const cacheOp = jest.fn().mockResolvedValue(null);

      await expect(cacheFallbackService.withFallback('test', dbOp, cacheOp))
        .rejects.toThrow('Connection refused');
    });
  });

  describe('getCacheAge', () => {
    it('calculates seconds since cached', () => {
      const cachedAt = Date.now() - 5000; // 5 seconds ago
      const age = cacheFallbackService.getCacheAge(cachedAt);
      expect(age).toBeGreaterThanOrEqual(4);
      expect(age).toBeLessThanOrEqual(6);
    });
  });

  describe('isCacheFresh', () => {
    it('returns true when cache is fresh', () => {
      const cachedAt = Date.now() - 30000; // 30 seconds ago
      expect(cacheFallbackService.isCacheFresh(cachedAt, 60)).toBe(true);
    });

    it('returns false when cache is stale', () => {
      const cachedAt = Date.now() - 120000; // 2 minutes ago
      expect(cacheFallbackService.isCacheFresh(cachedAt, 60)).toBe(false);
    });
  });
});
