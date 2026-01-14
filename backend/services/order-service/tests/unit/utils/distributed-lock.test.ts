/**
 * Unit Tests: Distributed Lock
 *
 * Tests Redis-based distributed locking for:
 * - Lock acquisition with retries
 * - Lock release with ownership verification
 * - Lock extension
 * - TTL management
 */

import {
  withLock,
  extendLock,
  tryLock,
  releaseLock,
  isLocked,
  getLockOwner,
  getLockTTL,
} from '../../../src/utils/distributed-lock';

// Track the lock value that was set
let lastSetLockValue: string | null = null;

// Mock Redis client
const mockRedisClient = {
  set: jest.fn().mockImplementation((key, value) => {
    lastSetLockValue = value;
    return Promise.resolve('OK');
  }),
  get: jest.fn().mockImplementation(() => {
    return Promise.resolve(lastSetLockValue);
  }),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn(),
  eval: jest.fn(),
  pttl: jest.fn(),
};

// Mock the redis config module
jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedisClient,
}));

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Distributed Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastSetLockValue = null;
    
    // Reset default implementations
    mockRedisClient.set.mockImplementation((key, value) => {
      lastSetLockValue = value;
      return Promise.resolve('OK');
    });
    mockRedisClient.get.mockImplementation(() => {
      return Promise.resolve(lastSetLockValue);
    });
    mockRedisClient.del.mockResolvedValue(1);
  });

  // ============================================
  // withLock
  // ============================================
  describe('withLock', () => {
    it('should acquire lock and execute function', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const result = await withLock('test-lock', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should release lock after function completes', async () => {
      await withLock('test-lock', async () => 'done');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-lock');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-lock');
    });

    it('should release lock even if function throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('function failed'));

      await expect(withLock('test-lock', fn)).rejects.toThrow('function failed');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-lock');
    });

    it('should retry lock acquisition on failure', async () => {
      mockRedisClient.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockImplementationOnce((key, value) => {
          lastSetLockValue = value;
          return Promise.resolve('OK');
        });

      const fn = jest.fn().mockResolvedValue('result');
      const result = await withLock('test-lock', fn, { retryCount: 3, retryDelay: 10 });

      expect(result).toBe('result');
      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
    });

    it('should throw error after all retry attempts fail', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const fn = jest.fn();

      await expect(
        withLock('test-lock', fn, { retryCount: 2, retryDelay: 10 })
      ).rejects.toThrow('Could not acquire lock: test-lock');

      expect(fn).not.toHaveBeenCalled();
    });

    it('should use custom TTL', async () => {
      await withLock('test-lock', async () => 'done', { ttl: 60000 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        expect.any(String),
        'PX',
        60000,
        'NX'
      );
    });

    it('should use custom owner', async () => {
      mockRedisClient.get.mockResolvedValue('my-owner-id');

      await withLock('test-lock', async () => 'done', { owner: 'my-owner-id' });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        'my-owner-id',
        'PX',
        expect.any(Number),
        'NX'
      );
    });

    it('should not release lock if ownership changed', async () => {
      // Someone else took over the lock
      mockRedisClient.get.mockResolvedValue('different-owner');

      await withLock('test-lock', async () => 'done');

      // del should not be called because ownership check failed
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should use default options', async () => {
      await withLock('test-lock', async () => 'done');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        expect.any(String),
        'PX',
        30000,
        'NX'
      );
    });

    it('should handle Redis errors during acquisition', async () => {
      mockRedisClient.set
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockRejectedValueOnce(new Error('Redis error'));

      const fn = jest.fn();

      await expect(
        withLock('test-lock', fn, { retryCount: 2 })
      ).rejects.toThrow('Failed to acquire lock after 2 attempts');
    });

    it('should handle Redis errors during release gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const fn = jest.fn().mockResolvedValue('result');
      
      // Should not throw - release errors are logged but not thrown
      const result = await withLock('test-lock', fn);
      expect(result).toBe('result');
    });
  });

  // ============================================
  // extendLock
  // ============================================
  describe('extendLock', () => {
    it('should extend lock TTL when owner matches', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await extendLock('test-lock', 'my-owner', 60000);

      expect(result).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        'test-lock',
        'my-owner',
        '60000'
      );
    });

    it('should return false when not owner', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await extendLock('test-lock', 'wrong-owner', 60000);

      expect(result).toBe(false);
    });

    it('should return false when lock does not exist', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await extendLock('non-existent-lock', 'owner', 60000);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Redis error'));

      const result = await extendLock('test-lock', 'owner', 60000);

      expect(result).toBe(false);
    });

    it('should use Lua script for atomic operation', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      await extendLock('test-lock', 'owner', 60000);

      const luaScript = mockRedisClient.eval.mock.calls[0][0];
      expect(luaScript).toContain('redis.call("get"');
      expect(luaScript).toContain('redis.call("pexpire"');
    });
  });

  // ============================================
  // tryLock
  // ============================================
  describe('tryLock', () => {
    it('should return true when lock acquired', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await tryLock('test-lock');

      expect(result).toBe(true);
    });

    it('should return false when lock already held', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const result = await tryLock('test-lock');

      expect(result).toBe(false);
    });

    it('should use custom TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await tryLock('test-lock', 60000);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        expect.any(String),
        'PX',
        60000,
        'NX'
      );
    });

    it('should use default TTL of 30000ms', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await tryLock('test-lock');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        expect.any(String),
        'PX',
        30000,
        'NX'
      );
    });

    it('should use custom owner', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await tryLock('test-lock', 30000, 'my-owner');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-lock',
        'my-owner',
        'PX',
        30000,
        'NX'
      );
    });

    it('should return false on Redis error', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      const result = await tryLock('test-lock');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // releaseLock
  // ============================================
  describe('releaseLock', () => {
    it('should release lock without owner (legacy)', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await releaseLock('test-lock');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-lock');
    });

    it('should release lock when owner matches', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await releaseLock('test-lock', 'my-owner');

      expect(result).toBe(true);
    });

    it('should not release lock when owner does not match', async () => {
      mockRedisClient.eval.mockResolvedValue(0);

      const result = await releaseLock('test-lock', 'wrong-owner');

      expect(result).toBe(false);
    });

    it('should use Lua script for atomic release with owner', async () => {
      mockRedisClient.eval.mockResolvedValue(1);

      await releaseLock('test-lock', 'owner');

      const luaScript = mockRedisClient.eval.mock.calls[0][0];
      expect(luaScript).toContain('redis.call("get"');
      expect(luaScript).toContain('redis.call("del"');
    });

    it('should return false on Redis error', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const result = await releaseLock('test-lock');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // isLocked
  // ============================================
  describe('isLocked', () => {
    it('should return true when lock exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await isLocked('test-lock');

      expect(result).toBe(true);
    });

    it('should return false when lock does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await isLocked('test-lock');

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

      const result = await isLocked('test-lock');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // getLockOwner
  // ============================================
  describe('getLockOwner', () => {
    it('should return owner when lock exists', async () => {
      mockRedisClient.get.mockResolvedValue('my-owner-id');

      const result = await getLockOwner('test-lock');

      expect(result).toBe('my-owner-id');
    });

    it('should return null when lock does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await getLockOwner('test-lock');

      expect(result).toBeNull();
    });

    it('should return null on Redis error', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await getLockOwner('test-lock');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // getLockTTL
  // ============================================
  describe('getLockTTL', () => {
    it('should return TTL in milliseconds', async () => {
      mockRedisClient.pttl.mockResolvedValue(15000);

      const result = await getLockTTL('test-lock');

      expect(result).toBe(15000);
    });

    it('should return 0 when lock does not exist', async () => {
      mockRedisClient.pttl.mockResolvedValue(-2);

      const result = await getLockTTL('test-lock');

      expect(result).toBe(0);
    });

    it('should return 0 when lock has no TTL', async () => {
      mockRedisClient.pttl.mockResolvedValue(-1);

      const result = await getLockTTL('test-lock');

      expect(result).toBe(0);
    });

    it('should return 0 on Redis error', async () => {
      mockRedisClient.pttl.mockRejectedValue(new Error('Redis error'));

      const result = await getLockTTL('test-lock');

      expect(result).toBe(0);
    });
  });

  // ============================================
  // Integration Scenarios
  // ============================================
  describe('Integration Scenarios', () => {
    it('should handle concurrent lock attempts correctly', async () => {
      mockRedisClient.set
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null);

      const results = await Promise.all([
        tryLock('shared-resource'),
        tryLock('shared-resource'),
      ]);

      expect(results).toContain(true);
      expect(results).toContain(false);
    });

    it('should support lock-extend-release workflow', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      const acquired = await tryLock('workflow-lock', 30000, 'worker-1');
      expect(acquired).toBe(true);

      mockRedisClient.eval.mockResolvedValue(1);
      const extended = await extendLock('workflow-lock', 'worker-1', 60000);
      expect(extended).toBe(true);

      mockRedisClient.eval.mockResolvedValue(1);
      const released = await releaseLock('workflow-lock', 'worker-1');
      expect(released).toBe(true);
    });

    it('should prevent release by non-owner', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      await tryLock('protected-lock', 30000, 'worker-1');

      mockRedisClient.eval.mockResolvedValue(0);
      const released = await releaseLock('protected-lock', 'worker-2');

      expect(released).toBe(false);
    });
  });
});
