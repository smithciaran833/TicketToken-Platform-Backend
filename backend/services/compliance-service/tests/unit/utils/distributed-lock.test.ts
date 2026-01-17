/**
 * Unit Tests for Distributed Lock
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock redis service
const mockSetNX = jest.fn<(key: string, value: string, ttl: number) => Promise<boolean>>();
const mockEval = jest.fn<(script: string, keys: string[], args: string[]) => Promise<number>>();

jest.mock('../../../src/services/redis.service', () => ({
  redisService: {
    setNX: mockSetNX,
    eval: mockEval
  }
}));

describe('Distributed Lock', () => {
  let DistributedLock: any;
  let withLock: any;
  let tryWithLock: any;
  let with1099Lock: any;
  let withTaxTrackingLock: any;
  let withOFACBatchLock: any;
  let withScheduledJobLock: any;
  let logger: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetNX.mockResolvedValue(true);
    mockEval.mockResolvedValue(1);

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/utils/distributed-lock');
    DistributedLock = module.DistributedLock;
    withLock = module.withLock;
    tryWithLock = module.tryWithLock;
    with1099Lock = module.with1099Lock;
    withTaxTrackingLock = module.withTaxTrackingLock;
    withOFACBatchLock = module.withOFACBatchLock;
    withScheduledJobLock = module.withScheduledJobLock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('DistributedLock class', () => {
    it('should acquire lock successfully', async () => {
      const lock = new DistributedLock('test-key');
      
      const acquired = await lock.acquire();

      expect(acquired).toBe(true);
      expect(mockSetNX).toHaveBeenCalledWith(
        'lock:compliance:test-key',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should release lock successfully', async () => {
      const lock = new DistributedLock('test-key');
      await lock.acquire();

      const released = await lock.release();

      expect(released).toBe(true);
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("del"'),
        ['lock:compliance:test-key'],
        expect.any(Array)
      );
    });

    it('should return false when lock cannot be acquired', async () => {
      mockSetNX.mockResolvedValue(false);

      const lock = new DistributedLock('test-key', { retryCount: 0 });
      const acquired = await lock.acquire();

      expect(acquired).toBe(false);
    });

    it('should retry acquiring lock with exponential backoff', async () => {
      mockSetNX
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const lock = new DistributedLock('test-key', { 
        retryCount: 3, 
        retryDelay: 100 
      });

      const acquirePromise = lock.acquire();
      
      // Advance through retries
      await jest.advanceTimersByTimeAsync(100); // First retry
      await jest.advanceTimersByTimeAsync(200); // Second retry (exponential)
      
      const acquired = await acquirePromise;

      expect(acquired).toBe(true);
      expect(mockSetNX).toHaveBeenCalledTimes(3);
    });

    it('should log warning when lock acquisition fails', async () => {
      mockSetNX.mockResolvedValue(false);

      const lock = new DistributedLock('test-key', { 
        retryCount: 1,
        retryDelay: 50,
        requestId: 'req-123'
      });

      const acquirePromise = lock.acquire();
      await jest.advanceTimersByTimeAsync(100);
      await acquirePromise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          lockKey: 'lock:compliance:test-key'
        }),
        'Failed to acquire lock after retries'
      );
    });

    it('should log debug message on successful acquisition', async () => {
      const lock = new DistributedLock('test-key', { requestId: 'req-123' });
      await lock.acquire();

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          lockKey: 'lock:compliance:test-key'
        }),
        'Lock acquired'
      );
    });

    it('should use custom TTL', async () => {
      const lock = new DistributedLock('test-key', { ttl: 60000 });
      await lock.acquire();

      expect(mockSetNX).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        60 // TTL in seconds
      );
    });

    it('should return false when releasing without acquiring', async () => {
      const lock = new DistributedLock('test-key');
      const released = await lock.release();

      expect(released).toBe(false);
    });

    it('should handle Redis errors gracefully on acquire', async () => {
      mockSetNX.mockRejectedValue(new Error('Redis connection failed'));

      const lock = new DistributedLock('test-key', { retryCount: 0 });
      const acquired = await lock.acquire();

      expect(acquired).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Redis connection failed'
        }),
        'Error acquiring lock'
      );
    });

    it('should handle Redis errors gracefully on release', async () => {
      const lock = new DistributedLock('test-key');
      await lock.acquire();

      mockEval.mockRejectedValue(new Error('Redis connection failed'));

      const released = await lock.release();

      expect(released).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Redis connection failed'
        }),
        'Error releasing lock'
      );
    });

    it('should extend lock TTL', async () => {
      const lock = new DistributedLock('test-key', { ttl: 30000 });
      await lock.acquire();

      mockEval.mockResolvedValue(1);

      const extended = await lock.extend();

      expect(extended).toBe(true);
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        ['lock:compliance:test-key'],
        expect.any(Array)
      );
    });

    it('should extend lock with custom TTL', async () => {
      const lock = new DistributedLock('test-key');
      await lock.acquire();

      await lock.extend(60000);

      expect(mockEval).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.arrayContaining(['60000'])
      );
    });

    it('should return false when extending without lock', async () => {
      const lock = new DistributedLock('test-key');
      const extended = await lock.extend();

      expect(extended).toBe(false);
    });

    it('should warn when lock already released', async () => {
      const lock = new DistributedLock('test-key');
      await lock.acquire();

      mockEval.mockResolvedValue(0); // Lock doesn't exist

      await lock.release();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          lockKey: 'lock:compliance:test-key'
        }),
        'Lock already released or expired'
      );
    });
  });

  describe('withLock', () => {
    it('should execute function with lock', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      const result = await withLock('test-key', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockSetNX).toHaveBeenCalled();
      expect(mockEval).toHaveBeenCalled(); // Release
    });

    it('should release lock even on error', async () => {
      const fn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Function failed'));

      await expect(withLock('test-key', fn)).rejects.toThrow('Function failed');

      expect(mockEval).toHaveBeenCalled(); // Release still called
    });

    it('should throw when lock cannot be acquired', async () => {
      mockSetNX.mockResolvedValue(false);

      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await expect(withLock('test-key', fn, { retryCount: 0 })).rejects.toThrow(
        'Could not acquire lock for key: test-key'
      );

      expect(fn).not.toHaveBeenCalled();
    });

    it('should pass options to lock', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withLock('test-key', fn, { ttl: 60000, requestId: 'req-123' });

      expect(mockSetNX).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        60
      );
    });
  });

  describe('tryWithLock', () => {
    it('should execute function when lock acquired', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      const result = await tryWithLock('test-key', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should return null when lock unavailable', async () => {
      mockSetNX.mockResolvedValue(false);

      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      const result = await tryWithLock('test-key', fn, { retryCount: 0 });

      expect(result).toBeNull();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should release lock after execution', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await tryWithLock('test-key', fn);

      expect(mockEval).toHaveBeenCalled();
    });
  });

  describe('with1099Lock', () => {
    it('should create lock with 1099 key format', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await with1099Lock('venue-123', 2024, fn, 'req-123');

      expect(mockSetNX).toHaveBeenCalledWith(
        'lock:compliance:1099:venue-123:2024',
        expect.any(String),
        300 // 5 minute TTL
      );
    });

    it('should execute function and return result', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('1099-generated');

      const result = await with1099Lock('venue-123', 2024, fn);

      expect(result).toBe('1099-generated');
    });
  });

  describe('withTaxTrackingLock', () => {
    it('should create lock with tax tracking key format', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withTaxTrackingLock('venue-123', fn, 'req-123');

      expect(mockSetNX).toHaveBeenCalledWith(
        'lock:compliance:tax-tracking:venue-123',
        expect.any(String),
        30 // 30 second TTL
      );
    });
  });

  describe('withOFACBatchLock', () => {
    it('should create lock with OFAC batch key format', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withOFACBatchLock('batch-123', fn, 'req-123');

      expect(mockSetNX).toHaveBeenCalledWith(
        'lock:compliance:ofac-batch:batch-123',
        expect.any(String),
        600 // 10 minute TTL
      );
    });
  });

  describe('withScheduledJobLock', () => {
    it('should create lock with scheduled job key format', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await withScheduledJobLock('daily-report', fn);

      expect(mockSetNX).toHaveBeenCalledWith(
        'lock:compliance:scheduled:daily-report',
        expect.any(String),
        3600 // 1 hour TTL
      );
    });

    it('should not retry for scheduled jobs', async () => {
      mockSetNX.mockResolvedValue(false);

      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('result');

      await expect(withScheduledJobLock('daily-report', fn)).rejects.toThrow();

      // Should only try once (no retries)
      expect(mockSetNX).toHaveBeenCalledTimes(1);
    });
  });

  describe('default export', () => {
    it('should export all components', async () => {
      const module = await import('../../../src/utils/distributed-lock');

      expect(module.default).toHaveProperty('DistributedLock');
      expect(module.default).toHaveProperty('withLock');
      expect(module.default).toHaveProperty('tryWithLock');
      expect(module.default).toHaveProperty('with1099Lock');
      expect(module.default).toHaveProperty('withTaxTrackingLock');
      expect(module.default).toHaveProperty('withOFACBatchLock');
      expect(module.default).toHaveProperty('withScheduledJobLock');
    });
  });
});
