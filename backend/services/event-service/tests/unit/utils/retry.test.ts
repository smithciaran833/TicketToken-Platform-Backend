/**
 * Unit tests for src/utils/retry.ts
 * Tests retry logic with exponential backoff, jitter, and error handling
 */

import {
  withRetry,
  isRetryableError,
  createRetryWrapper,
  Retry,
  RetryOptions,
} from '../../../src/utils/retry';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('isRetryableError()', () => {
    describe('Network errors', () => {
      it('should return true for ECONNREFUSED', () => {
        const error = { code: 'ECONNREFUSED' };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for ECONNRESET', () => {
        const error = { code: 'ECONNRESET' };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for ETIMEDOUT', () => {
        const error = { code: 'ETIMEDOUT' };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for ENOTFOUND', () => {
        const error = { code: 'ENOTFOUND' };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for AbortError', () => {
        const error = { name: 'AbortError' };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for fetch failed errors', () => {
        const error = { message: 'fetch failed' };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    describe('HTTP status codes', () => {
      it('should return true for HTTP 500', () => {
        const error = { status: 500 };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for HTTP 502', () => {
        const error = { status: 502 };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for HTTP 503', () => {
        const error = { status: 503 };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for HTTP 504', () => {
        const error = { status: 504 };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return true for HTTP 429 (Too Many Requests)', () => {
        const error = { status: 429 };
        expect(isRetryableError(error)).toBe(true);
      });

      it('should return false for HTTP 400', () => {
        const error = { status: 400 };
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for HTTP 401', () => {
        const error = { status: 401 };
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for HTTP 403', () => {
        const error = { status: 403 };
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for HTTP 404', () => {
        const error = { status: 404 };
        expect(isRetryableError(error)).toBe(false);
      });
    });

    describe('Circuit breaker errors', () => {
      it('should return true for circuit breaker open errors', () => {
        const error = { message: 'circuit breaker is open' };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    describe('Non-retryable errors', () => {
      it('should return false for validation errors', () => {
        const error = { message: 'Validation failed', status: 422 };
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for generic errors', () => {
        const error = new Error('Something went wrong');
        expect(isRetryableError(error)).toBe(false);
      });

      it('should return false for null', () => {
        expect(isRetryableError(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isRetryableError(undefined)).toBe(false);
      });
    });
  });

  describe('withRetry()', () => {
    describe('Successful execution', () => {
      it('should return result on first successful attempt', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        const result = await withRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should succeed after retries', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
          .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
          .mockResolvedValue('success');

        const result = await withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 1,
        });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    describe('Retry behavior', () => {
      it('should retry on retryable errors', async () => {
        const fn = jest.fn()
          .mockRejectedValueOnce({ status: 503 })
          .mockResolvedValue('success');

        const result = await withRetry(fn, {
          maxRetries: 2,
          initialDelayMs: 1,
        });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should not retry on non-retryable errors', async () => {
        const fn = jest.fn().mockRejectedValue({ status: 404 });

        await expect(withRetry(fn, {
          maxRetries: 3,
          initialDelayMs: 1,
        })).rejects.toEqual({ status: 404 });

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should throw after max retries exhausted', async () => {
        const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

        await expect(withRetry(fn, {
          maxRetries: 2,
          initialDelayMs: 1,
        })).rejects.toEqual({ code: 'ECONNREFUSED' });

        expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });
    });

    describe('Custom retry condition', () => {
      it('should use custom retryOn function', async () => {
        const customRetryOn = jest.fn().mockReturnValue(true);
        const fn = jest.fn()
          .mockRejectedValueOnce(new Error('Custom error'))
          .mockResolvedValue('success');

        const result = await withRetry(fn, {
          retryOn: customRetryOn,
          maxRetries: 2,
          initialDelayMs: 1,
        });

        expect(result).toBe('success');
        expect(customRetryOn).toHaveBeenCalled();
      });

      it('should not retry when custom retryOn returns false', async () => {
        const customRetryOn = jest.fn().mockReturnValue(false);
        const fn = jest.fn().mockRejectedValue(new Error('Non-retryable'));

        await expect(withRetry(fn, {
          retryOn: customRetryOn,
          maxRetries: 3,
          initialDelayMs: 1,
        })).rejects.toThrow('Non-retryable');

        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('Backoff configuration', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should use default options when not provided', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        const promise = withRetry(fn);
        await jest.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should respect maxRetries option', async () => {
        const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

        const promise = withRetry(fn, {
          maxRetries: 5,
          initialDelayMs: 1,
          jitter: false,
        });

        // Run all timers to exhaust retries
        try {
          await jest.runAllTimersAsync();
          await promise;
        } catch (e) {
          // Expected to throw
        }

        expect(fn).toHaveBeenCalledTimes(6); // Initial + 5 retries
      });
    });

    describe('Abort signal', () => {
      it('should abort before first attempt if signal already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const fn = jest.fn().mockResolvedValue('success');

        await expect(withRetry(fn, {
          signal: controller.signal,
        })).rejects.toThrow('Operation aborted');

        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('Operation naming', () => {
      it('should use default operation name', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        await withRetry(fn);

        // Logger should have been called - we can verify the mock was configured
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should use custom operation name', async () => {
        const fn = jest.fn().mockResolvedValue('success');

        await withRetry(fn, {
          operationName: 'customOperation',
        });

        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('createRetryWrapper()', () => {
    it('should create a wrapped function that retries', async () => {
      const originalFn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      const wrappedFn = createRetryWrapper(originalFn, {
        maxRetries: 2,
        initialDelayMs: 1,
      });

      const result = await wrappedFn();

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to wrapped function', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');

      const wrappedFn = createRetryWrapper(originalFn, {
        maxRetries: 1,
        initialDelayMs: 1,
      });

      await wrappedFn('arg1', 'arg2', 123);

      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('should preserve return type', async () => {
      const originalFn = async (x: number): Promise<number> => x * 2;

      const wrappedFn = createRetryWrapper(originalFn, {
        maxRetries: 1,
        initialDelayMs: 1,
      });

      const result = await wrappedFn(5);

      expect(result).toBe(10);
    });
  });

  describe('Retry decorator', () => {
    it('should retry decorated method', async () => {
      let callCount = 0;

      class TestService {
        @Retry({ maxRetries: 2, initialDelayMs: 1 })
        async fetchData(): Promise<string> {
          callCount++;
          if (callCount < 2) {
            throw { code: 'ECONNREFUSED' };
          }
          return 'data';
        }
      }

      const service = new TestService();
      const result = await service.fetchData();

      expect(result).toBe('data');
      expect(callCount).toBe(2);
    });

    it('should use method name as operation name by default', async () => {
      class TestService {
        @Retry({ maxRetries: 1, initialDelayMs: 1 })
        async myMethod(): Promise<string> {
          return 'success';
        }
      }

      const service = new TestService();
      const result = await service.myMethod();

      expect(result).toBe('success');
    });

    it('should use custom operation name from decorator options', async () => {
      class TestService {
        @Retry({ operationName: 'customName', maxRetries: 1, initialDelayMs: 1 })
        async myMethod(): Promise<string> {
          return 'success';
        }
      }

      const service = new TestService();
      const result = await service.myMethod();

      expect(result).toBe('success');
    });

    it('should propagate errors after max retries', async () => {
      let callCount = 0;

      class TestService {
        @Retry({ maxRetries: 1, initialDelayMs: 1 })
        async failingMethod(): Promise<string> {
          callCount++;
          throw { code: 'ETIMEDOUT' };
        }
      }

      const service = new TestService();

      await expect(service.failingMethod()).rejects.toEqual({ code: 'ETIMEDOUT' });
      expect(callCount).toBe(2); // Initial + 1 retry
    });

    it('should preserve this context', async () => {
      class TestService {
        private value = 'instance-value';

        @Retry({ maxRetries: 1, initialDelayMs: 1 })
        async getValue(): Promise<string> {
          return this.value;
        }
      }

      const service = new TestService();
      const result = await service.getValue();

      expect(result).toBe('instance-value');
    });
  });

  describe('Edge cases', () => {
    it('should handle immediate success with zero retries', async () => {
      const fn = jest.fn().mockResolvedValue('immediate');

      const result = await withRetry(fn, { maxRetries: 0 });

      expect(result).toBe('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle failure with zero retries', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(withRetry(fn, { maxRetries: 0 })).rejects.toEqual({ code: 'ECONNREFUSED' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle async function that returns undefined', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);

      const result = await withRetry(fn);

      expect(result).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle async function that returns null', async () => {
      const fn = jest.fn().mockResolvedValue(null);

      const result = await withRetry(fn);

      expect(result).toBeNull();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle sync errors in async function', async () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      await expect(withRetry(fn, {
        maxRetries: 1,
        initialDelayMs: 1,
      })).rejects.toThrow('Sync error');
    });

    it('should handle errors without code or status properties', async () => {
      const fn = jest.fn().mockRejectedValue({ custom: 'error' });

      await expect(withRetry(fn, {
        maxRetries: 1,
        initialDelayMs: 1,
      })).rejects.toEqual({ custom: 'error' });

      // Should not retry since it's not retryable
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delay calculations', () => {
    it('should apply exponential backoff', async () => {
      // This is tested implicitly through retry behavior
      // The actual delay calculation is internal
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 1,
        initialDelayMs: 1,
        backoffMultiplier: 2,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect maxDelayMs cap', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 1,
        initialDelayMs: 100000, // Very large initial delay
        maxDelayMs: 1, // But capped at 1ms
        jitter: false,
      });

      expect(result).toBe('success');
    });

    it('should work with jitter enabled', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 1,
        initialDelayMs: 10,
        jitter: true,
        jitterFactor: 0.5,
      });

      expect(result).toBe('success');
    });
  });
});
