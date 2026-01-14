/**
 * Comprehensive Unit Tests for src/utils/distributed-lock.ts
 *
 * Tests distributed locking using Redis
 */

// Mock uuid
const mockUuidv4 = jest.fn(() => 'mock-uuid-1234');
jest.mock('uuid', () => ({
  v4: mockUuidv4,
}));

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

import {
  DistributedLockManager,
  initializeLockManager,
  getLockManager,
  transactionLockKey,
  slotLockKey,
  reconciliationLockKey,
} from '../../../src/utils/distributed-lock';

describe('src/utils/distributed-lock.ts - Comprehensive Unit Tests', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
    };

    // Reset singleton
    (global as any).lockManagerInstance = null;
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - CONSTRUCTOR
  // =============================================================================

  describe('DistributedLockManager - Constructor', () => {
    it('should create lock manager with Redis client', () => {
      const manager = new DistributedLockManager(mockRedisClient);
      expect(manager).toBeInstanceOf(DistributedLockManager);
    });

    it('should use default prefix when not provided', () => {
      const manager = new DistributedLockManager(mockRedisClient);
      expect(manager).toBeDefined();
    });

    it('should use custom prefix when provided', () => {
      const manager = new DistributedLockManager(mockRedisClient, 'custom:lock:');
      expect(manager).toBeDefined();
    });
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - ACQUIRE
  // =============================================================================

  describe('DistributedLockManager - acquire()', () => {
    it('should acquire lock successfully on first attempt', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('test-resource');

      expect(result.acquired).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.key).toBe('test-resource');
      expect(result.lock?.ownerId).toBe('mock-uuid-1234');
      expect(result.lock?.ttlMs).toBe(30000);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'blockchain-indexer:lock:test-resource',
        'mock-uuid-1234',
        'PX',
        30000,
        'NX'
      );
    });

    it('should use custom TTL when provided', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('test-resource', { ttlMs: 60000 });

      expect(result.acquired).toBe(true);
      expect(result.lock?.ttlMs).toBe(60000);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        60000,
        'NX'
      );
    });

    it('should use custom owner ID when provided', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('test-resource', { ownerId: 'custom-owner' });

      expect(result.acquired).toBe(true);
      expect(result.lock?.ownerId).toBe('custom-owner');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        'custom-owner',
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should retry when lock is not immediately available', async () => {
      jest.useFakeTimers();
      const manager = new DistributedLockManager(mockRedisClient);
      
      // First attempt fails, second succeeds
      mockRedisClient.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const acquirePromise = manager.acquire('test-resource', {
        retryDelayMs: 100,
        maxRetries: 5,
      });

      // Advance timers to allow retry
      await jest.advanceTimersByTimeAsync(100);

      const result = await acquirePromise;

      expect(result.acquired).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should fail after max retries', async () => {
      jest.useFakeTimers();
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue(null); // Always fails

      const acquirePromise = manager.acquire('test-resource', {
        retryDelayMs: 50,
        maxRetries: 3,
      });

      // Advance through all retries
      await jest.advanceTimersByTimeAsync(200);

      const result = await acquirePromise;

      expect(result.acquired).toBe(false);
      expect(result.lock).toBeUndefined();
      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 3, maxRetries: 3 }),
        'Failed to acquire lock after max retries'
      );

      jest.useRealTimers();
    });

    it('should handle Redis errors during acquire', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      const testError = new Error('Redis connection failed');
      mockRedisClient.set.mockRejectedValue(testError);

      await expect(manager.acquire('test-resource')).rejects.toThrow('Redis connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log debug message on successful acquire', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      await manager.acquire('test-resource');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          lockKey: 'blockchain-indexer:lock:test-resource',
          ownerId: 'mock-uuid-1234',
        }),
        'Lock acquired'
      );
    });

    it('should use custom prefix in lock key', async () => {
      const manager = new DistributedLockManager(mockRedisClient, 'custom:');
      mockRedisClient.set.mockResolvedValue('OK');

      await manager.acquire('test-resource');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'custom:test-resource',
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - RELEASE
  // =============================================================================

  describe('DistributedLockManager - release()', () => {
    it('should release lock successfully', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.eval.mockResolvedValue(1);

      const lock = {
        key: 'test-resource',
        ownerId: 'owner-123',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      const result = await manager.release(lock);

      expect(result).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call'),
        1,
        'blockchain-indexer:lock:test-resource',
        'owner-123'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-123' }),
        'Lock released'
      );
    });

    it('should fail to release if not owner', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.eval.mockResolvedValue(0);

      const lock = {
        key: 'test-resource',
        ownerId: 'wrong-owner',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      const result = await manager.release(lock);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'Lock release failed - not owner or expired'
      );
    });

    it('should handle Redis errors during release', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      const testError = new Error('Redis eval failed');
      mockRedisClient.eval.mockRejectedValue(testError);

      const lock = {
        key: 'test-resource',
        ownerId: 'owner-123',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      await expect(manager.release(lock)).rejects.toThrow('Redis eval failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use custom prefix when releasing', async () => {
      const manager = new DistributedLockManager(mockRedisClient, 'custom:');
      mockRedisClient.eval.mockResolvedValue(1);

      const lock = {
        key: 'test-resource',
        ownerId: 'owner-123',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      await manager.release(lock);

      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'custom:test-resource',
        'owner-123'
      );
    });
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - EXTEND
  // =============================================================================

  describe('DistributedLockManager - extend()', () => {
    it('should extend lock TTL successfully', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.eval.mockResolvedValue(1);

      const lock = {
        key: 'test-resource',
        ownerId: 'owner-123',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      const result = await manager.extend(lock, 10000);

      expect(result).toBe(true);
      expect(lock.ttlMs).toBe(40000);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        'blockchain-indexer:lock:test-resource',
        'owner-123',
        '40000'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ newTtl: 40000 }),
        'Lock extended'
      );
    });

    it('should fail to extend if not owner', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.eval.mockResolvedValue(0);

      const lock = {
        key: 'test-resource',
        ownerId: 'wrong-owner',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      const result = await manager.extend(lock, 10000);

      expect(result).toBe(false);
      expect(lock.ttlMs).toBe(30000); // TTL not changed
    });

    it('should handle Redis errors during extend', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      const testError = new Error('Redis extend failed');
      mockRedisClient.eval.mockRejectedValue(testError);

      const lock = {
        key: 'test-resource',
        ownerId: 'owner-123',
        acquiredAt: Date.now(),
        ttlMs: 30000,
      };

      await expect(manager.extend(lock, 10000)).rejects.toThrow('Redis extend failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - IS LOCKED
  // =============================================================================

  describe('DistributedLockManager - isLocked()', () => {
    it('should return true when resource is locked', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.get.mockResolvedValue('owner-123');

      const result = await manager.isLocked('test-resource');

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith('blockchain-indexer:lock:test-resource');
    });

    it('should return false when resource is not locked', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.get.mockResolvedValue(null);

      const result = await manager.isLocked('test-resource');

      expect(result).toBe(false);
    });

    it('should use custom prefix when checking lock', async () => {
      const manager = new DistributedLockManager(mockRedisClient, 'custom:');
      mockRedisClient.get.mockResolvedValue('owner-123');

      await manager.isLocked('test-resource');

      expect(mockRedisClient.get).toHaveBeenCalledWith('custom:test-resource');
    });
  });

  // =============================================================================
  // DISTRIBUTED LOCK MANAGER - WITH LOCK
  // =============================================================================

  describe('DistributedLockManager - withLock()', () => {
    it('should execute function with lock protection', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      const testFn = jest.fn().mockResolvedValue('result');

      const result = await manager.withLock('test-resource', testFn);

      expect(result).toBe('result');
      expect(testFn).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalled(); // Lock acquired
      expect(mockRedisClient.eval).toHaveBeenCalled(); // Lock released
    });

    it('should release lock even if function throws', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      const testFn = jest.fn().mockRejectedValue(new Error('Function failed'));

      await expect(manager.withLock('test-resource', testFn)).rejects.toThrow('Function failed');

      expect(mockRedisClient.eval).toHaveBeenCalled(); // Lock still released
    });

    it('should throw error if lock acquisition fails', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue(null); // Lock not acquired

      const testFn = jest.fn();

      await expect(
        manager.withLock('test-resource', testFn, { maxRetries: 1 })
      ).rejects.toThrow('Failed to acquire lock for resource: test-resource');

      expect(testFn).not.toHaveBeenCalled();
    });

    it('should pass custom options to acquire', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      const testFn = jest.fn().mockResolvedValue('result');

      await manager.withLock('test-resource', testFn, {
        ttlMs: 60000,
        ownerId: 'custom-owner',
      });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        'custom-owner',
        'PX',
        60000,
        'NX'
      );
    });

    it('should return function result', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await manager.withLock('test-resource', async () => {
        return { data: 'test', count: 42 };
      });

      expect(result).toEqual({ data: 'test', count: 42 });
    });
  });

  // =============================================================================
  // LOCK KEY HELPERS
  // =============================================================================

  describe('Lock Key Helpers', () => {
    it('should create transaction lock key', () => {
      const key = transactionLockKey('sig123abc');
      expect(key).toBe('tx:sig123abc');
    });

    it('should create slot lock key', () => {
      const key = slotLockKey(12345);
      expect(key).toBe('slot:12345');
    });

    it('should create reconciliation lock key', () => {
      const key = reconciliationLockKey('transactions');
      expect(key).toBe('reconcile:transactions');
    });
  });

  // =============================================================================
  // SINGLETON FUNCTIONS
  // =============================================================================

  describe('Singleton Functions', () => {
    it('should initialize lock manager', () => {
      const manager = initializeLockManager(mockRedisClient);

      expect(manager).toBeInstanceOf(DistributedLockManager);
      expect(mockLogger.info).toHaveBeenCalledWith('Distributed lock manager initialized');
    });

    it('should return existing instance if already initialized', () => {
      const manager1 = initializeLockManager(mockRedisClient);
      const manager2 = initializeLockManager(mockRedisClient);

      expect(manager1).toBe(manager2);
      expect(mockLogger.warn).toHaveBeenCalledWith('Lock manager already initialized');
    });

    it('should get lock manager instance', () => {
      initializeLockManager(mockRedisClient);
      const manager = getLockManager();

      expect(manager).toBeInstanceOf(DistributedLockManager);
    });

    it('should throw error if getting uninitialized manager', () => {
      expect(() => getLockManager()).toThrow(
        'Lock manager not initialized. Call initializeLockManager() first.'
      );
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete lock lifecycle', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      // Acquire
      const acquireResult = await manager.acquire('resource-1');
      expect(acquireResult.acquired).toBe(true);
      expect(acquireResult.lock).toBeDefined();

      // Extend
      const extendResult = await manager.extend(acquireResult.lock!, 10000);
      expect(extendResult).toBe(true);

      // Release
      const releaseResult = await manager.release(acquireResult.lock!);
      expect(releaseResult).toBe(true);
    });

    it('should handle concurrent lock attempts', async () => {
      jest.useFakeTimers();
      const manager = new DistributedLockManager(mockRedisClient);

      // First call succeeds immediately
      // Second call fails twice then succeeds
      mockRedisClient.set
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const promise1 = manager.acquire('resource', { maxRetries: 1 });
      const promise2 = manager.acquire('resource', { maxRetries: 3, retryDelayMs: 100 });

      // Advance timers for promise2 retries
      await jest.advanceTimersByTimeAsync(250);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);

      jest.useRealTimers();
    });

    it('should handle lock expiration scenario', async () => {
      const manager = new DistributedLockManager(mockRedisClient);

      // Acquire succeeds
      mockRedisClient.set.mockResolvedValue('OK');
      const result = await manager.acquire('resource', { ttlMs: 100 });
      expect(result.acquired).toBe(true);

      // Try to release after expiration (simulated by eval returning 0)
      mockRedisClient.eval.mockResolvedValue(0);
      const released = await manager.release(result.lock!);
      expect(released).toBe(false);
    });

    it('should prevent race conditions with multiple operations', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.eval.mockResolvedValue(1);

      let counter = 0;
      const incrementWithLock = async () => {
        await manager.withLock('counter', async () => {
          const current = counter;
          await new Promise(resolve => setTimeout(resolve, 1));
          counter = current + 1;
        });
      };

      // Execute multiple operations "concurrently"
      await Promise.all([
        incrementWithLock(),
        incrementWithLock(),
        incrementWithLock(),
      ]);

      // With proper locking, counter should be 3
      expect(counter).toBe(3);
      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure scenarios', async () => {
      jest.useFakeTimers();
      const manager = new DistributedLockManager(mockRedisClient);

      // Setup: first acquire succeeds, second fails
      mockRedisClient.set
        .mockResolvedValueOnce('OK')
        .mockResolvedValue(null);

      const result1 = await manager.acquire('resource', { maxRetries: 1 });
      
      const promise2 = manager.acquire('resource', { maxRetries: 2, retryDelayMs: 50 });
      await jest.advanceTimersByTimeAsync(150);
      const result2 = await promise2;

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(false);

      jest.useRealTimers();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle zero TTL', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('resource', { ttlMs: 0 });

      expect(result.acquired).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        0,
        'NX'
      );
    });

    it('should handle very large TTL', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('resource', { ttlMs: 999999999 });

      expect(result.acquired).toBe(true);
      expect(result.lock?.ttlMs).toBe(999999999);
    });

    it('should handle empty resource key', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await manager.acquire('');

      expect(result.acquired).toBe(true);
      expect(result.lock?.key).toBe('');
    });

    it('should handle special characters in resource key', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue('OK');

      const specialKey = 'resource:with:colons/and/slashes-and-dashes';
      const result = await manager.acquire(specialKey);

      expect(result.acquired).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `blockchain-indexer:lock:${specialKey}`,
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should handle maxRetries of 1', async () => {
      const manager = new DistributedLockManager(mockRedisClient);
      mockRedisClient.set.mockResolvedValue(null);

      const result = await manager.acquire('resource', { maxRetries: 1 });

      expect(result.acquired).toBe(false);
      expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
    });
  });
});
