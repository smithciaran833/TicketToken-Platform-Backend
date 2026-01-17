/**
 * Distributed Lock Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockRedisSet = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisExists = jest.fn();
const mockRedisEval = jest.fn();

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => ({
    set: mockRedisSet,
    get: mockRedisGet,
    exists: mockRedisExists,
    eval: mockRedisEval,
  }),
}));

import {
  getDistributedLock,
  acquireRFMLock,
  acquireReportLock,
  acquireExportLock,
  acquireAggregationLock,
  withLock,
} from '../../../src/utils/distributed-lock';
import { logger } from '../../../src/utils/logger';

describe('Distributed Lock', () => {
  let distributedLock: ReturnType<typeof getDistributedLock>;

  beforeEach(() => {
    jest.clearAllMocks();
    distributedLock = getDistributedLock();
    
    // Default mock implementations
    mockRedisSet.mockResolvedValue('OK');
    mockRedisEval.mockResolvedValue(1);
    mockRedisExists.mockResolvedValue(0);
  });

  describe('getDistributedLock', () => {
    it('should return singleton instance', () => {
      const lock1 = getDistributedLock();
      const lock2 = getDistributedLock();

      expect(lock1).toBe(lock2);
    });
  });

  describe('acquire', () => {
    it('should acquire lock successfully', async () => {
      const lock = await distributedLock.acquire('test-lock');

      expect(lock).not.toBeNull();
      expect(lock?.key).toBe('analytics:lock:test-lock');
      expect(lock?.value).toBeDefined();
      expect(lock?.ttl).toBe(30000); // Default TTL
      expect(lock?.acquiredAt).toBeDefined();
    });

    it('should use SET NX command', async () => {
      await distributedLock.acquire('test-lock');

      expect(mockRedisSet).toHaveBeenCalledWith(
        'analytics:lock:test-lock',
        expect.any(String),
        'EX',
        30, // 30000ms = 30s
        'NX'
      );
    });

    it('should use custom TTL', async () => {
      await distributedLock.acquire('test-lock', { ttl: 60000 });

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        60, // 60000ms = 60s
        'NX'
      );
    });

    it('should return null if lock not acquired', async () => {
      mockRedisSet.mockResolvedValue(null);

      const lock = await distributedLock.acquire('busy-lock', { retryCount: 0 });

      expect(lock).toBeNull();
    });

    it('should retry on failure', async () => {
      mockRedisSet
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const lock = await distributedLock.acquire('retry-lock', {
        retryCount: 3,
        retryDelay: 10,
      });

      expect(lock).not.toBeNull();
      expect(mockRedisSet).toHaveBeenCalledTimes(3);
    });

    it('should log when lock acquired', async () => {
      await distributedLock.acquire('logged-lock');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_acquired',
          lockName: 'logged-lock',
        }),
        expect.any(String)
      );
    });

    it('should log when lock not acquired', async () => {
      mockRedisSet.mockResolvedValue(null);

      await distributedLock.acquire('failed-lock', { retryCount: 0 });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_not_acquired',
          lockName: 'failed-lock',
        }),
        expect.any(String)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis connection failed'));

      const lock = await distributedLock.acquire('error-lock', { retryCount: 0 });

      expect(lock).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_acquire_error',
        }),
        expect.any(String)
      );
    });

    it('should include process ID in lock value', async () => {
      await distributedLock.acquire('pid-lock');

      const setValue = mockRedisSet.mock.calls[0][1];
      expect(setValue).toContain(process.pid.toString());
    });
  });

  describe('release', () => {
    it('should release lock successfully', async () => {
      const lock = await distributedLock.acquire('release-test');
      
      const result = await distributedLock.release(lock);

      expect(result).toBe(true);
      expect(mockRedisEval).toHaveBeenCalled();
    });

    it('should use Lua script for atomic release', async () => {
      const lock = await distributedLock.acquire('atomic-release');
      
      await distributedLock.release(lock);

      expect(mockRedisEval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        lock?.key,
        lock?.value
      );
    });

    it('should return false if lock value mismatch', async () => {
      const lock = await distributedLock.acquire('mismatch-lock');
      mockRedisEval.mockResolvedValue(0);

      const result = await distributedLock.release(lock);

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_release_failed',
        }),
        expect.any(String)
      );
    });

    it('should return false for null lock', async () => {
      const result = await distributedLock.release(null);

      expect(result).toBe(false);
    });

    it('should handle Redis errors on release', async () => {
      const lock = await distributedLock.acquire('error-release');
      mockRedisEval.mockRejectedValue(new Error('Redis error'));

      const result = await distributedLock.release(lock);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_release_error',
        }),
        expect.any(String)
      );
    });

    it('should log successful release', async () => {
      const lock = await distributedLock.acquire('log-release');
      
      await distributedLock.release(lock);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_released',
        }),
        expect.any(String)
      );
    });
  });

  describe('extend', () => {
    it('should extend lock TTL', async () => {
      const lock = await distributedLock.acquire('extend-test');
      
      const result = await distributedLock.extend(lock!);

      expect(result).toBe(true);
      expect(mockRedisEval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("expire"'),
        1,
        lock?.key,
        lock?.value,
        30 // Default TTL in seconds
      );
    });

    it('should use custom TTL for extension', async () => {
      const lock = await distributedLock.acquire('extend-custom');
      
      await distributedLock.extend(lock!, 60000);

      expect(mockRedisEval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        lock?.key,
        lock?.value,
        60 // 60000ms = 60s
      );
    });

    it('should return false if lock no longer held', async () => {
      const lock = await distributedLock.acquire('extend-expired');
      mockRedisEval.mockResolvedValue(0);

      const result = await distributedLock.extend(lock!);

      expect(result).toBe(false);
    });

    it('should handle Redis errors on extend', async () => {
      const lock = await distributedLock.acquire('extend-error');
      mockRedisEval.mockRejectedValue(new Error('Redis error'));

      const result = await distributedLock.extend(lock!);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_extend_error',
        }),
        expect.any(String)
      );
    });
  });

  describe('isLocked', () => {
    it('should return true if lock exists', async () => {
      mockRedisExists.mockResolvedValue(1);

      const result = await distributedLock.isLocked('existing-lock');

      expect(result).toBe(true);
      expect(mockRedisExists).toHaveBeenCalledWith('analytics:lock:existing-lock');
    });

    it('should return false if lock does not exist', async () => {
      mockRedisExists.mockResolvedValue(0);

      const result = await distributedLock.isLocked('free-lock');

      expect(result).toBe(false);
    });

    it('should handle Redis errors', async () => {
      mockRedisExists.mockRejectedValue(new Error('Redis error'));

      const result = await distributedLock.isLocked('error-lock');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'lock_check_error',
        }),
        expect.any(String)
      );
    });
  });

  describe('releaseAll', () => {
    it('should release all held locks', async () => {
      // Acquire multiple locks
      await distributedLock.acquire('lock-1');
      await distributedLock.acquire('lock-2');
      await distributedLock.acquire('lock-3');

      await distributedLock.releaseAll();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'all_locks_released',
        }),
        expect.any(String)
      );
    });
  });

  describe('Convenience Functions', () => {
    describe('acquireRFMLock', () => {
      it('should acquire global RFM lock', async () => {
        const lock = await acquireRFMLock();

        expect(mockRedisSet).toHaveBeenCalledWith(
          'analytics:lock:rfm:global',
          expect.any(String),
          'EX',
          expect.any(Number),
          'NX'
        );
        expect(lock).not.toBeNull();
      });

      it('should acquire venue-specific RFM lock', async () => {
        const lock = await acquireRFMLock('venue-123');

        expect(mockRedisSet).toHaveBeenCalledWith(
          'analytics:lock:rfm:venue-123',
          expect.any(String),
          'EX',
          expect.any(Number),
          'NX'
        );
        expect(lock).not.toBeNull();
      });

      it('should pass options to acquire', async () => {
        await acquireRFMLock('venue-456', { ttl: 60000, retryCount: 5 });

        expect(mockRedisSet).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'EX',
          60,
          'NX'
        );
      });
    });

    describe('acquireReportLock', () => {
      it('should acquire report lock', async () => {
        const lock = await acquireReportLock('report-123');

        expect(mockRedisSet).toHaveBeenCalledWith(
          'analytics:lock:report:report-123',
          expect.any(String),
          'EX',
          expect.any(Number),
          'NX'
        );
        expect(lock).not.toBeNull();
      });
    });

    describe('acquireExportLock', () => {
      it('should acquire export lock', async () => {
        const lock = await acquireExportLock('export-456');

        expect(mockRedisSet).toHaveBeenCalledWith(
          'analytics:lock:export:export-456',
          expect.any(String),
          'EX',
          expect.any(Number),
          'NX'
        );
        expect(lock).not.toBeNull();
      });
    });

    describe('acquireAggregationLock', () => {
      it('should acquire aggregation lock', async () => {
        const lock = await acquireAggregationLock('daily');

        expect(mockRedisSet).toHaveBeenCalledWith(
          'analytics:lock:aggregation:daily',
          expect.any(String),
          'EX',
          expect.any(Number),
          'NX'
        );
        expect(lock).not.toBeNull();
      });
    });
  });

  describe('withLock', () => {
    it('should execute function while holding lock', async () => {
      const fn = jest.fn().mockResolvedValue('result');

      const result = await withLock('with-lock-test', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockRedisEval).toHaveBeenCalled(); // Lock released
    });

    it('should return null if lock cannot be acquired', async () => {
      mockRedisSet.mockResolvedValue(null);
      const fn = jest.fn().mockResolvedValue('result');

      const result = await withLock('busy-lock', fn, { retryCount: 0 });

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should release lock even if function throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Function failed'));

      await expect(withLock('error-lock', fn)).rejects.toThrow('Function failed');

      expect(mockRedisEval).toHaveBeenCalled(); // Lock should still be released
    });

    it('should pass options to acquire', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await withLock('options-lock', fn, { ttl: 120000 });

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        120,
        'NX'
      );
    });

    it('should log when execution skipped due to lock', async () => {
      mockRedisSet.mockResolvedValue(null);

      await withLock('skip-lock', async () => 'test', { retryCount: 0 });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'with_lock_skipped',
          lockName: 'skip-lock',
        }),
        expect.any(String)
      );
    });
  });
});
