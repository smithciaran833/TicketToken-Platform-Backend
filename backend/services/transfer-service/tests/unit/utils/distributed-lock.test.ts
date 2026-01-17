import Redis from 'ioredis';
import {
  DistributedLock,
  initDistributedLock,
  getDistributedLock,
  acquireTransferLock,
  acquireBlockchainLock,
  acquireBatchLock,
  LOCK_CONFIG
} from '../../../src/utils/distributed-lock';

// Mock dependencies
jest.mock('ioredis');
jest.mock('../../../src/utils/logger');

describe('Distributed Lock - Unit Tests', () => {
  let mockRedis: jest.Mocked<Redis>;
  let distributedLock: DistributedLock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
      pttl: jest.fn(),
      quit: jest.fn()
    } as any;

    distributedLock = new DistributedLock(mockRedis);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Lock Acquisition', () => {
    it('should acquire lock successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource');

      expect(lock).not.toBeNull();
      expect(lock?.resource).toBe('test-resource');
      expect(lock?.value).toBeDefined();
      expect(lock?.ttl).toBe(LOCK_CONFIG.defaultTtl);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('test-resource'),
        expect.any(String),
        'PX',
        LOCK_CONFIG.defaultTtl,
        'NX'
      );
    });

    it('should return null when lock acquisition fails', async () => {
      mockRedis.set.mockResolvedValue(null);

      const lock = await distributedLock.acquire('test-resource', {
        retryCount: 0
      });

      expect(lock).toBeNull();
    });

    it('should use custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const customTtl = 60000;

      const lock = await distributedLock.acquire('test-resource', {
        ttl: customTtl
      });

      expect(lock?.ttl).toBe(customTtl);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        customTtl,
        'NX'
      );
    });

    it('should cap TTL at maximum', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource', {
        ttl: LOCK_CONFIG.maxTtl + 10000
      });

      expect(lock?.ttl).toBe(LOCK_CONFIG.maxTtl);
    });

    it('should retry on failure', async () => {
      mockRedis.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const promise = distributedLock.acquire('test-resource', {
        retryCount: 3,
        retryDelay: 100
      });

      // Fast-forward through retry delays
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(100);

      const lock = await promise;

      expect(lock).not.toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });

    it('should add jitter to retry delay', async () => {
      mockRedis.set.mockResolvedValue(null);

      const promise = distributedLock.acquire('test-resource', {
        retryCount: 1,
        retryDelay: 200
      });

      // Advance by base delay + jitter
      await jest.advanceTimersByTimeAsync(300);

      await promise;

      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('should prefix lock keys', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await distributedLock.acquire('my-resource');

      expect(mockRedis.set).toHaveBeenCalledWith(
        `${LOCK_CONFIG.keyPrefix}my-resource`,
        expect.any(String),
        'PX',
        expect.any(Number),
        'NX'
      );
    });

    it('should generate unique lock values', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock1 = await distributedLock.acquire('resource1');
      const lock2 = await distributedLock.acquire('resource2');

      expect(lock1?.value).not.toBe(lock2?.value);
    });

    it('should handle redis errors during acquisition', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const lock = await distributedLock.acquire('test-resource', {
        retryCount: 0
      });

      expect(lock).toBeNull();
    });
  });

  describe('Lock Release', () => {
    it('should release lock successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      const released = await distributedLock.release(lock!);

      expect(released).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        expect.stringContaining('test-resource'),
        lock?.value
      );
    });

    it('should return false when lock already released', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(0);

      const lock = await distributedLock.acquire('test-resource');
      const released = await distributedLock.release(lock!);

      expect(released).toBe(false);
    });

    it('should handle redis errors during release', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const lock = await distributedLock.acquire('test-resource');
      const released = await distributedLock.release(lock!);

      expect(released).toBe(false);
    });

    it('should stop auto-extension on release', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      distributedLock.startAutoExtend(lock!);
      await distributedLock.release(lock!);

      // Auto-extend should be stopped
      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });

  describe('Lock Extension', () => {
    it('should extend lock TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      const extended = await distributedLock.extend(lock!);

      expect(extended).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        expect.stringContaining('test-resource'),
        lock?.value,
        expect.any(String)
      );
    });

    it('should extend with custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      const customTtl = 60000;
      await distributedLock.extend(lock!, { ttl: customTtl });

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        expect.any(String),
        customTtl.toString()
      );
    });

    it('should return false when extending expired lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(0);

      const lock = await distributedLock.acquire('test-resource');
      const extended = await distributedLock.extend(lock!);

      expect(extended).toBe(false);
    });

    it('should cap extension TTL at maximum', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      await distributedLock.extend(lock!, { ttl: LOCK_CONFIG.maxTtl + 10000 });

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        expect.any(String),
        LOCK_CONFIG.maxTtl.toString()
      );
    });

    it('should handle redis errors during extension', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const lock = await distributedLock.acquire('test-resource');
      const extended = await distributedLock.extend(lock!);

      expect(extended).toBe(false);
    });
  });

  describe('Auto Extension', () => {
    it('should start auto-extension', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource', { ttl: 10000 });
      distributedLock.startAutoExtend(lock!);

      // Fast-forward to extension interval (75% of TTL)
      await jest.advanceTimersByTimeAsync(7500);

      expect(mockRedis.eval).toHaveBeenCalled();

      distributedLock.stopAutoExtend('test-resource');
    });

    it('should use custom extension interval', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      distributedLock.startAutoExtend(lock!, 5000);

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockRedis.eval).toHaveBeenCalled();

      distributedLock.stopAutoExtend('test-resource');
    });

    it('should stop auto-extension when extension fails', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      const lock = await distributedLock.acquire('test-resource', { ttl: 10000 });
      distributedLock.startAutoExtend(lock!);

      await jest.advanceTimersByTimeAsync(7500);

      // Should have stopped after failed extension
      jest.clearAllMocks();
      await jest.advanceTimersByTimeAsync(7500);

      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('should clear previous auto-extension when starting new one', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('test-resource');
      distributedLock.startAutoExtend(lock!, 5000);
      distributedLock.startAutoExtend(lock!, 8000);

      await jest.advanceTimersByTimeAsync(5000);

      // First interval should be cleared, so only one call
      expect(mockRedis.eval).toHaveBeenCalledTimes(0);

      await jest.advanceTimersByTimeAsync(3000);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);

      distributedLock.stopAutoExtend('test-resource');
    });

    it('should stop auto-extension manually', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource');
      distributedLock.startAutoExtend(lock!);
      distributedLock.stopAutoExtend('test-resource');

      jest.clearAllMocks();
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });

  describe('withLock Helper', () => {
    it('should execute function with lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('result');

      const result = await distributedLock.withLock('test-resource', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should release lock even if function throws', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fn = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(
        distributedLock.withLock('test-resource', fn)
      ).rejects.toThrow('Function error');

      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should throw if lock acquisition fails', async () => {
      mockRedis.set.mockResolvedValue(null);

      const fn = jest.fn();

      await expect(
        distributedLock.withLock('test-resource', fn, { retryCount: 0 })
      ).rejects.toThrow('Failed to acquire lock');

      expect(fn).not.toHaveBeenCalled();
    });

    it('should enable auto-extension when requested', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fn = jest.fn().mockImplementation(async () => {
        await jest.advanceTimersByTimeAsync(25000);
        return 'result';
      });

      await distributedLock.withLock('test-resource', fn, {
        autoExtend: true,
        ttl: 30000
      });

      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });

  describe('Lock Status', () => {
    it('should check if resource is locked', async () => {
      mockRedis.pttl.mockResolvedValue(15000);

      const status = await distributedLock.getLockStatus('test-resource');

      expect(status.locked).toBe(true);
      expect(status.ttl).toBe(15000);
    });

    it('should return unlocked when TTL is negative', async () => {
      mockRedis.pttl.mockResolvedValue(-1);

      const status = await distributedLock.getLockStatus('test-resource');

      expect(status.locked).toBe(false);
      expect(status.ttl).toBeUndefined();
    });

    it('should handle redis errors during status check', async () => {
      mockRedis.pttl.mockRejectedValue(new Error('Redis error'));

      const status = await distributedLock.getLockStatus('test-resource');

      expect(status.locked).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return true for valid lock', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource');

      expect(distributedLock.isLocked(lock!)).toBe(true);
    });

    it('should return false for expired lock', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource');
      
      // Manually expire the lock
      lock!.expiresAt = Date.now() - 1000;

      expect(distributedLock.isLocked(lock!)).toBe(false);
    });
  });

  describe('releaseAll', () => {
    it('should release all held locks', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await distributedLock.acquire('resource1');
      await distributedLock.acquire('resource2');
      await distributedLock.acquire('resource3');

      await distributedLock.releaseAll();

      expect(mockRedis.eval).toHaveBeenCalledTimes(3);
    });

    it('should handle empty lock set', async () => {
      await expect(distributedLock.releaseAll()).resolves.not.toThrow();
    });
  });

  describe('Singleton Functions', () => {
    it('should initialize distributed lock', () => {
      const lock = initDistributedLock(mockRedis);

      expect(lock).toBeInstanceOf(DistributedLock);
    });

    it('should get initialized lock', () => {
      initDistributedLock(mockRedis);
      const lock = getDistributedLock();

      expect(lock).toBeInstanceOf(DistributedLock);
    });

    it('should throw when getting uninitialized lock', () => {
      // Create a new module instance context
      jest.resetModules();
      const { getDistributedLock: getUninitialized } = require('../../../src/utils/distributed-lock');

      expect(() => getUninitialized()).toThrow('Distributed lock not initialized');
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      initDistributedLock(mockRedis);
    });

    it('should acquire transfer lock', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await acquireTransferLock('transfer-123');

      expect(lock?.resource).toBe('transfer:transfer-123');
    });

    it('should acquire blockchain lock with custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await acquireBlockchainLock('nft-mint-abc');

      expect(lock?.resource).toBe('blockchain:nft-mint-abc');
      expect(lock?.ttl).toBe(60000);
    });

    it('should acquire batch lock with custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await acquireBatchLock('batch-456');

      expect(lock?.resource).toBe('batch:batch-456');
      expect(lock?.ttl).toBe(120000);
    });
  });

  describe('Configuration', () => {
    it('should export LOCK_CONFIG', () => {
      expect(LOCK_CONFIG).toBeDefined();
      expect(LOCK_CONFIG.defaultTtl).toBe(30000);
      expect(LOCK_CONFIG.maxTtl).toBe(300000);
      expect(LOCK_CONFIG.keyPrefix).toBe('transfer-service:lock:');
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent lock attempts', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const promises = Array.from({ length: 5 }, (_, i) =>
        distributedLock.acquire(`resource-${i}`)
      );

      const locks = await Promise.all(promises);

      expect(locks.filter(l => l !== null)).toHaveLength(5);
    });

    it('should handle very short TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const lock = await distributedLock.acquire('test-resource', { ttl: 100 });

      expect(lock?.ttl).toBe(100);
    });

    it('should handle zero retry count', async () => {
      mockRedis.set.mockResolvedValue(null);

      const lock = await distributedLock.acquire('test-resource', {
        retryCount: 0
      });

      expect(lock).toBeNull();
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('should handle lock value with special characters', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const lock = await distributedLock.acquire('resource:with:colons');

      expect(lock).not.toBeNull();
      expect(lock?.resource).toBe('resource:with:colons');
    });
  });
});
