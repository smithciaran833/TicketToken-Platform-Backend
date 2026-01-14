/**
 * Unit Tests: Retry Utility
 *
 * Tests retry logic with exponential backoff
 */

import { retry, RetryOptions } from '../../../src/utils/retry';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Retry Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper to advance timers and flush promises
  const advanceTimersAndFlush = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  };

  // ============================================
  // Successful Execution
  // ============================================
  describe('Successful Execution', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const resultPromise = retry(fn);
      await Promise.resolve(); // Let the promise start

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return result after retries succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 3, delayMs: 100 });

      // First attempt fails
      await Promise.resolve();
      
      // Advance to second attempt
      await advanceTimersAndFlush(100);
      
      // Advance to third attempt
      await advanceTimersAndFlush(200);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should work with async functions returning different types', async () => {
      const numberFn = jest.fn().mockResolvedValue(42);
      const objectFn = jest.fn().mockResolvedValue({ data: 'test' });
      const arrayFn = jest.fn().mockResolvedValue([1, 2, 3]);

      expect(await retry(numberFn)).toBe(42);
      expect(await retry(objectFn)).toEqual({ data: 'test' });
      expect(await retry(arrayFn)).toEqual([1, 2, 3]);
    });
  });

  // ============================================
  // Failure Handling
  // ============================================
  describe('Failure Handling', () => {
    it('should throw after maxAttempts exhausted', async () => {
      const error = new Error('persistent failure');
      const fn = jest.fn().mockRejectedValue(error);

      const resultPromise = retry(fn, { maxAttempts: 3, delayMs: 100 });

      // Advance through all retries
      await Promise.resolve();
      await advanceTimersAndFlush(100);
      await advanceTimersAndFlush(200);

      await expect(resultPromise).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw the last error after all retries', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('error 1'))
        .mockRejectedValueOnce(new Error('error 2'))
        .mockRejectedValueOnce(new Error('error 3'));

      const resultPromise = retry(fn, { maxAttempts: 3, delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);
      await advanceTimersAndFlush(200);

      await expect(resultPromise).rejects.toThrow('error 3');
    });

    it('should use default maxAttempts of 3', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const resultPromise = retry(fn, { delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);
      await advanceTimersAndFlush(200);

      await expect(resultPromise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // Exponential Backoff
  // ============================================
  describe('Exponential Backoff', () => {
    it('should use exponential backoff between retries', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
      });

      // First attempt
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait 1000ms for second attempt
      await advanceTimersAndFlush(1000);
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait 2000ms (1000 * 2) for third attempt
      await advanceTimersAndFlush(2000);
      expect(fn).toHaveBeenCalledTimes(3);

      await resultPromise;
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, {
        maxAttempts: 4,
        delayMs: 5000,
        backoffMultiplier: 3,
        maxDelayMs: 10000, // Cap at 10 seconds
      });

      // First attempt
      await Promise.resolve();

      // Second attempt after 5000ms
      await advanceTimersAndFlush(5000);

      // Third attempt after 10000ms (capped from 15000)
      await advanceTimersAndFlush(10000);

      // Fourth attempt after 10000ms (capped from 30000)
      await advanceTimersAndFlush(10000);

      await resultPromise;
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should use default backoffMultiplier of 2', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, {
        maxAttempts: 3,
        delayMs: 100,
      });

      await Promise.resolve();
      await advanceTimersAndFlush(100); // First retry
      await advanceTimersAndFlush(200); // Second retry (100 * 2)

      await resultPromise;
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // shouldRetry Predicate
  // ============================================
  describe('shouldRetry Predicate', () => {
    it('should stop retrying when shouldRetry returns false', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retryable'))
        .mockRejectedValueOnce(new Error('non-retryable'));

      const shouldRetry = jest.fn((error: Error) => {
        return error.message === 'retryable';
      });

      const resultPromise = retry(fn, {
        maxAttempts: 5,
        delayMs: 100,
        shouldRetry,
      });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      await expect(resultPromise).rejects.toThrow('non-retryable');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledTimes(2);
    });

    it('should retry only specific error types', async () => {
      class RetryableError extends Error {}
      class NonRetryableError extends Error {}

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new RetryableError('retry me'))
        .mockRejectedValueOnce(new NonRetryableError('stop here'));

      const shouldRetry = (error: any) => error instanceof RetryableError;

      const resultPromise = retry(fn, {
        maxAttempts: 5,
        delayMs: 100,
        shouldRetry,
      });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      await expect(resultPromise).rejects.toThrow('stop here');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should default shouldRetry to always return true', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('any error'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 2, delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass error to shouldRetry predicate', async () => {
      const specificError = new Error('specific message');
      const fn = jest.fn().mockRejectedValue(specificError);

      const shouldRetry = jest.fn().mockReturnValue(false);

      const resultPromise = retry(fn, {
        maxAttempts: 3,
        shouldRetry,
      });

      await Promise.resolve();

      await expect(resultPromise).rejects.toThrow();
      expect(shouldRetry).toHaveBeenCalledWith(specificError);
    });
  });

  // ============================================
  // Options Defaults
  // ============================================
  describe('Options Defaults', () => {
    it('should use default options when none provided', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use default delayMs of 1000', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 2 });

      await Promise.resolve();
      
      // Should wait 1000ms (default)
      jest.advanceTimersByTime(999);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      await Promise.resolve();
      
      await resultPromise;
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use default maxDelayMs of 10000', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, {
        maxAttempts: 4,
        delayMs: 5000,
        backoffMultiplier: 10, // Would be 50000 without cap
      });

      await Promise.resolve();
      await advanceTimersAndFlush(5000);  // First retry
      await advanceTimersAndFlush(10000); // Second retry (capped)
      await advanceTimersAndFlush(10000); // Third retry (capped)

      await resultPromise;
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle maxAttempts of 1 (no retries)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(retry(fn, { maxAttempts: 1 })).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that throw non-Error objects', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(retry(fn, { maxAttempts: 1 })).rejects.toBe('string error');
    });

    it('should handle functions that throw null', async () => {
      const fn = jest.fn().mockRejectedValue(null);

      await expect(retry(fn, { maxAttempts: 1 })).rejects.toBe(null);
    });

    it('should handle delayMs of 0', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 2, delayMs: 0 });

      await Promise.resolve();
      await advanceTimersAndFlush(0);

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should handle synchronous-like async functions', async () => {
      let callCount = 0;
      const fn = jest.fn(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('not yet');
        }
        return 'done';
      });

      const resultPromise = retry(fn, { maxAttempts: 3, delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      const result = await resultPromise;
      expect(result).toBe('done');
    });
  });

  // ============================================
  // Logging
  // ============================================
  describe('Logging', () => {
    it('should log warning on retry', async () => {
      const { logger } = require('../../../src/utils/logger');
      
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 2, delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      await resultPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.objectContaining({
          error: 'first fail',
          nextRetryInMs: expect.any(Number),
        })
      );
    });

    it('should include attempt number in log', async () => {
      const { logger } = require('../../../src/utils/logger');
      
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const resultPromise = retry(fn, { maxAttempts: 3, delayMs: 100 });

      await Promise.resolve();
      await advanceTimersAndFlush(100);

      await resultPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('1/3'),
        expect.any(Object)
      );
    });
  });

  // ============================================
  // Real-world Scenarios
  // ============================================
  describe('Real-world Scenarios', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('should handle API call retry pattern', async () => {
      let attempts = 0;
      const apiCall = async () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('Service unavailable');
          error.statusCode = 503;
          throw error;
        }
        return { data: 'success' };
      };

      const shouldRetry = (error: any) => {
        return error.statusCode === 503 || error.statusCode === 429;
      };

      const result = await retry(apiCall, {
        maxAttempts: 3,
        delayMs: 10,
        shouldRetry,
      });

      expect(result).toEqual({ data: 'success' });
      expect(attempts).toBe(3);
    }, 10000);

    it('should handle database connection retry', async () => {
      let connected = false;
      const connect = async () => {
        if (!connected) {
          connected = true;
          throw new Error('Connection refused');
        }
        return { connection: 'established' };
      };

      const result = await retry(connect, {
        maxAttempts: 2,
        delayMs: 10,
      });

      expect(result).toEqual({ connection: 'established' });
    }, 10000);
  });
});
