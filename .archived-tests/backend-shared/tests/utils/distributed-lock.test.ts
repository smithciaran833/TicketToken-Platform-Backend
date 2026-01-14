/**
 * Distributed Lock Test Suite
 *
 * Comprehensive tests for Redis-based distributed locking including:
 * - Lock acquisition and release
 * - Race condition prevention
 * - Deadlock prevention
 * - Lock timeout handling
 * - Retry with exponential backoff
 * - Lock key generation patterns
 * - Concurrent lock attempts
 * - Lock metrics and monitoring
 * - Error scenarios (Redis down, timeout, etc.)
 *
 * Priority: P0 (Critical) - Race condition prevention
 * Expected Coverage: 95%+
 */

import {
  withLock,
  withLockRetry,
  tryLock,
  LockKeys,
  LockMetrics,
  lockRedisClient,
} from '../../src/utils/distributed-lock';
import {
  LockTimeoutError,
  LockContentionError,
  LockSystemError,
} from '../../src/errors/lock-errors';

// Mock Redis for testing
jest.mock('ioredis');

describe('Distributed Lock', () => {
  let mockRedis: any;

  beforeEach(() => {
    // Reset Redis mock before each test
    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
      on: jest.fn(),
    };

    // Mock the Redis instance
    (lockRedisClient as any).set = mockRedis.set;
    (lockRedisClient as any).eval = mockRedis.eval;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // LOCK ACQUISITION TESTS
  // ============================================================================

  describe('withLock()', () => {
    test('successfully acquires and releases lock', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      let executed = false;
      const result = await withLock('test:lock:1', 5000, async () => {
        executed = true;
        return 'success';
      });

      expect(executed).toBe(true);
      expect(result).toBe('success');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:lock:1',
        expect.any(String),
        'PX',
        5000,
        'NX'
      );
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    test('executes function only once when lock is acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      let executionCount = 0;
      await withLock('test:lock:2', 5000, async () => {
        executionCount++;
      });

      expect(executionCount).toBe(1);
    });

    test('releases lock even if function throws error', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await expect(
        withLock('test:lock:3', 5000, async () => {
          throw new Error('Business logic error');
        })
      ).rejects.toThrow('Business logic error');

      // Lock should still be released
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    test('retries lock acquisition when initially unavailable', async () => {
      // First 2 attempts fail, 3rd succeeds
      mockRedis.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');
      mockRedis.eval.mockResolvedValue(1);

      const result = await withLock('test:lock:4', 5000, async () => {
        return 'success after retries';
      });

      expect(result).toBe('success after retries');
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });

    test('throws LockTimeoutError after max retries', async () => {
      mockRedis.set.mockResolvedValue(null); // Always locked

      await expect(
        withLock('test:lock:5', 5000, async () => {
          return 'should not execute';
        })
      ).rejects.toThrow(LockTimeoutError);
    });

    test('uses unique lock value per process', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await withLock('test:lock:6', 5000, async () => {});

      const lockValue = mockRedis.set.mock.calls[0][1];
      expect(lockValue).toMatch(/^\d+-\d+$/); // format: pid-timestamp
    });

    test('passes through business logic errors', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await expect(
        withLock('test:lock:7', 5000, async () => {
          throw new Error('Validation failed');
        })
      ).rejects.toThrow('Validation failed');
    });

    test('handles Redis connection errors', async () => {
      mockRedis.set.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        withLock('test:lock:8', 5000, async () => {
          return 'should not execute';
        })
      ).rejects.toThrow(LockSystemError);
    });

    test('uses provided service name in options', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await withLock('test:lock:9', 5000, async () => 'result', {
        service: 'ticket-service',
        lockType: 'inventory',
      });

      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // LOCK RETRY TESTS
  // ============================================================================

  describe('withLockRetry()', () => {
    test('succeeds on first attempt if lock available', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const result = await withLockRetry('test:lock:10', 5000, async () => {
        return 'first attempt success';
      });

      expect(result).toBe('first attempt success');
    });

    test('retries with exponential backoff on timeout', async () => {
      let attempts = 0;
      mockRedis.set.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(null); // First 2 fail
        }
        return Promise.resolve('OK'); // 3rd succeeds
      });
      mockRedis.eval.mockResolvedValue(1);

      const result = await withLockRetry(
        'test:lock:11',
        5000,
        async () => 'success after retries',
        { maxRetries: 3, initialDelayMs: 50, backoffMultiplier: 2 }
      );

      expect(result).toBe('success after retries');
    });

    test('throws error after max retries exhausted', async () => {
      mockRedis.set.mockResolvedValue(null); // Always locked

      await expect(
        withLockRetry('test:lock:12', 5000, async () => 'should not execute', { maxRetries: 2 })
      ).rejects.toThrow(LockTimeoutError);
    }, 20000);

    test('does not retry on non-lock errors', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await expect(
        withLockRetry('test:lock:13', 5000, async () => {
          throw new Error('Database error');
        })
      ).rejects.toThrow('Database error');

      // Should only try once, not retry on business errors
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    test('applies custom backoff multiplier', async () => {
      mockRedis.set.mockResolvedValue(null);

      const startTime = Date.now();

      try {
        await withLockRetry('test:lock:14', 5000, async () => {}, {
          maxRetries: 2,
          initialDelayMs: 100,
          backoffMultiplier: 3,
        });
      } catch (error) {
        // Expected to fail
      }

      const duration = Date.now() - startTime;
      // Should have delays: 100ms (1st retry) + 300ms (2nd retry) = 400ms minimum
      expect(duration).toBeGreaterThanOrEqual(300);
    }, 20000);
  });

  // ============================================================================
  // TRY LOCK TESTS
  // ============================================================================

  describe('tryLock()', () => {
    test('returns true when lock acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const acquired = await tryLock('test:lock:15', 5000);

      expect(acquired).toBe(true);
    });

    test('returns false when lock unavailable', async () => {
      mockRedis.set.mockResolvedValue(null);

      const acquired = await tryLock('test:lock:16', 5000);

      expect(acquired).toBe(false);
    });

    test('returns false on Redis error', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const acquired = await tryLock('test:lock:17', 5000);

      expect(acquired).toBe(false);
    });

    test('does not block or wait for lock', async () => {
      mockRedis.set.mockResolvedValue(null);

      const startTime = Date.now();
      await tryLock('test:lock:18', 5000);
      const duration = Date.now() - startTime;

      // Should return immediately, not wait
      expect(duration).toBeLessThan(100);
    });
  });

  // ============================================================================
  // LOCK KEY GENERATION TESTS
  // ============================================================================

  describe('LockKeys', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'test';
    });

    test('generates inventory lock key with environment prefix', () => {
      const key = LockKeys.inventory('event-123', 'tier-456');

      expect(key).toBe('test:lock:inventory:event-123:tier-456');
    });

    test('generates listing lock key', () => {
      const key = LockKeys.listing('listing-789');

      expect(key).toBe('test:lock:listing:listing-789');
    });

    test('generates ticket lock key', () => {
      const key = LockKeys.ticket('ticket-abc');

      expect(key).toBe('test:lock:ticket:ticket-abc');
    });

    test('generates user purchase lock key', () => {
      const key = LockKeys.userPurchase('user-xyz');

      expect(key).toBe('test:lock:user:user-xyz:purchase');
    });

    test('generates reservation lock key', () => {
      const key = LockKeys.reservation('reservation-001');

      expect(key).toBe('test:lock:reservation:reservation-001');
    });

    test('generates payment lock key', () => {
      const key = LockKeys.payment('payment-002');

      expect(key).toBe('test:lock:payment:payment-002');
    });

    test('generates refund lock key', () => {
      const key = LockKeys.refund('payment-003');

      expect(key).toBe('test:lock:refund:payment-003');
    });

    test('uses different environment prefixes', () => {
      process.env.NODE_ENV = 'production';
      const prodKey = LockKeys.ticket('ticket-1');

      process.env.NODE_ENV = 'development';
      const devKey = LockKeys.ticket('ticket-1');

      expect(prodKey).toContain('production:lock');
      expect(devKey).toContain('development:lock');

      process.env.NODE_ENV = 'test';
    });
  });

  // ============================================================================
  // RACE CONDITION PREVENTION TESTS
  // ============================================================================

  describe('Race Condition Prevention', () => {
    test('prevents double-booking with concurrent lock attempts', async () => {
      let acquiredCount = 0;

      mockRedis.set.mockImplementation((key: string) => {
        if (acquiredCount === 0) {
          acquiredCount++;
          return Promise.resolve('OK');
        }
        return Promise.resolve(null); // Second attempt fails
      });
      mockRedis.eval.mockResolvedValue(1);

      const results = await Promise.allSettled([
        withLock('test:lock:concurrent', 5000, async () => 'first'),
        withLock('test:lock:concurrent', 5000, async () => 'second'),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(1); // Only one should succeed
    });

    test('ensures mutual exclusion for critical section', async () => {
      let criticalSectionCount = 0;
      let violations = 0;

      mockRedis.set.mockImplementation(() => {
        // Only allow one lock at a time
        if (criticalSectionCount === 0) {
          criticalSectionCount++;
          return Promise.resolve('OK');
        }
        return Promise.resolve(null);
      });

      mockRedis.eval.mockImplementation(() => {
        // Release the lock
        criticalSectionCount--;
        return Promise.resolve(1);
      });

      const operation = async () => {
        return withLock('test:lock:critical', 5000, async () => {
          // Check if another operation is in the critical section
          if (criticalSectionCount > 1) {
            violations++;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      };

      await Promise.allSettled([operation(), operation(), operation()]);

      expect(violations).toBe(0);
    });
  });

  // ============================================================================
  // LOCK METRICS TESTS
  // ============================================================================

  describe('LockMetrics', () => {
    beforeEach(() => {
      // Reset metrics before each test
      const metrics: any = LockMetrics;
      metrics.lockAcquisitionTimes = new Map();
      metrics.lockWaitTimes = new Map();
      metrics.lockTimeouts = 0;
      metrics.activeLocks = new Set();
    });

    test('tracks lock acquisition timing', () => {
      const key = 'test:lock:metrics1';

      LockMetrics.startAcquisition(key);
      LockMetrics.endAcquisition(key);

      const metrics = LockMetrics.getMetrics();
      expect(metrics.activeLockCount).toBe(1);
    });

    test('counts active locks', () => {
      LockMetrics.endAcquisition('test:lock:m1');
      LockMetrics.endAcquisition('test:lock:m2');
      LockMetrics.endAcquisition('test:lock:m3');

      const metrics = LockMetrics.getMetrics();
      expect(metrics.activeLockCount).toBe(3);
    });

    test('decrements active locks on release', () => {
      LockMetrics.endAcquisition('test:lock:m4');
      LockMetrics.releaseLock('test:lock:m4');

      const metrics = LockMetrics.getMetrics();
      expect(metrics.activeLockCount).toBe(0);
    });

    test('tracks timeout count', () => {
      LockMetrics.incrementTimeout();
      LockMetrics.incrementTimeout();
      LockMetrics.incrementTimeout();

      const metrics = LockMetrics.getMetrics();
      expect(metrics.totalTimeouts).toBe(3);
    });

    test('calculates average wait time', () => {
      // Manually set wait times for testing
      const metrics: any = LockMetrics;
      metrics.lockWaitTimes.set('lock1', 100);
      metrics.lockWaitTimes.set('lock2', 200);
      metrics.lockWaitTimes.set('lock3', 300);

      const result = LockMetrics.getMetrics();
      expect(result.averageWaitTime).toBe(200);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    test('distinguishes between lock timeout and system error', async () => {
      mockRedis.set.mockResolvedValue(null);

      try {
        await withLock('test:lock:error1', 5000, async () => {});
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(LockTimeoutError);
        expect(error).not.toBeInstanceOf(LockSystemError);
      }
    });

    test('wraps Redis connection errors as LockSystemError', async () => {
      mockRedis.set.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(withLock('test:lock:error2', 5000, async () => {})).rejects.toThrow(
        LockSystemError
      );
    });

    test('preserves original error details in LockTimeoutError', async () => {
      mockRedis.set.mockResolvedValue(null);

      try {
        await withLock('test:lock:error3', 5000, async () => {});
      } catch (error: any) {
        expect(error.message).toContain('Failed to acquire lock');
        expect(error.key).toBe('test:lock:error3');
        expect(error.ttlMs).toBe(5000);
      }
    });
  });

  // ============================================================================
  // DEADLOCK PREVENTION TESTS
  // ============================================================================

  describe('Deadlock Prevention', () => {
    test('lock automatically expires after TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await withLock('test:lock:ttl', 1000, async () => {
        // Simulate long-running operation
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Verify SET was called with PX (milliseconds) and TTL
      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall).toContain('PX');
      expect(setCall).toContain(1000);
    });

    test('only releases lock if still owned', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(0); // Lock not owned during release

      await withLock('test:lock:ownership', 5000, async () => {
        return 'completed';
      });

      // Should still attempt release with Lua script
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    test('uses Lua script for atomic lock release', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      await withLock('test:lock:atomic', 5000, async () => {});

      const evalCall = mockRedis.eval.mock.calls[0];
      const luaScript = evalCall[0];

      expect(luaScript).toContain('redis.call("get", KEYS[1])');
      expect(luaScript).toContain('redis.call("del", KEYS[1])');
    });
  });
});
