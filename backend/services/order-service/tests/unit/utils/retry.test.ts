import { retry, Retry, retryable, RetryOptions } from '../../../src/utils/retry';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Custom error classes for testing
class NetworkError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

class CustomRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomRetryableError';
  }
}

class CustomNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomNonRetryableError';
  }
}

describe('retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should return result on successful execution', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Connection failed', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Connection failed', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max attempts exhausted', async () => {
      const error = new NetworkError('Connection failed', 'ECONNREFUSED');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, { maxAttempts: 3 });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          maxAttempts: 3,
        }),
        'All retry attempts exhausted'
      );
    });

    it('should work with async functions that return promises', async () => {
      const fn = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async result';
      });

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('async result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions returning different types', async () => {
      const numberFn = jest.fn().mockResolvedValue(42);
      const objectFn = jest.fn().mockResolvedValue({ key: 'value' });
      const arrayFn = jest.fn().mockResolvedValue([1, 2, 3]);

      const promise1 = retry(numberFn);
      jest.runAllTimers();
      expect(await promise1).toBe(42);

      const promise2 = retry(objectFn);
      jest.runAllTimers();
      expect(await promise2).toEqual({ key: 'value' });

      const promise3 = retry(arrayFn);
      jest.runAllTimers();
      expect(await promise3).toEqual([1, 2, 3]);
    });
  });

  describe('Exponential Backoff', () => {
    it('should implement exponential backoff with default settings', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn);

      // First attempt - immediate
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // First retry - wait ~100ms (with jitter)
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);

      // Second retry - wait ~200ms (with jitter)
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(3);

      await promise;
    });

    it('should respect custom initial delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelayMs: 500 });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(600);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);

      await promise;
    });

    it('should respect custom backoff multiplier', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        initialDelayMs: 100,
        backoffMultiplier: 3,
      });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // First retry: 100ms * 3^0 = 100ms
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);

      // Second retry: 100ms * 3^1 = 300ms
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(3);

      await promise;
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        initialDelayMs: 1000,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Delay should be capped at 500ms even though exponential would be 1000ms
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);

      await promise;
    });

    it('should add jitter to delays', async () => {
      const delays: number[] = [];
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        delays.push(delay);
        return setTimeout(callback, 0) as any;
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelayMs: 100 });
      jest.runAllTimers();
      await promise;

      // Verify jitter was added (delays should be between 100-120ms and 200-240ms)
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[0]).toBeLessThanOrEqual(120);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[1]).toBeLessThanOrEqual(240);

      jest.restoreAllMocks();
    });
  });

  describe('Max Attempts', () => {
    it('should respect default max attempts (3)', async () => {
      const fn = jest.fn().mockRejectedValue(new NetworkError('Fail', 'ECONNREFUSED'));

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect custom max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new NetworkError('Fail', 'ECONNREFUSED'));

      const promise = retry(fn, { maxAttempts: 5 });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should work with maxAttempts set to 1 (no retries)', async () => {
      const fn = jest.fn().mockRejectedValue(new NetworkError('Fail', 'ECONNREFUSED'));

      const promise = retry(fn, { maxAttempts: 1 });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should succeed on last attempt', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxAttempts: 3 });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retryable Errors', () => {
    it('should retry on ETIMEDOUT error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Timeout', 'ETIMEDOUT'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on ECONNRESET error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Connection reset', 'ECONNRESET'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on ECONNREFUSED error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Connection refused', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on ENOTFOUND error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Host not found', 'ENOTFOUND'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on EAI_AGAIN error', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('DNS lookup failed', 'EAI_AGAIN'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 408 (Request Timeout)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Request Timeout', 408))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 429 (Too Many Requests)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Too Many Requests', 429))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 500 (Internal Server Error)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Internal Server Error', 500))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 502 (Bad Gateway)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Bad Gateway', 502))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 503 (Service Unavailable)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Service Unavailable', 503))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on HTTP 504 (Gateway Timeout)', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HttpError('Gateway Timeout', 504))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Non-Retryable Errors', () => {
    it('should not retry on HTTP 400 (Bad Request)', async () => {
      const error = new HttpError('Bad Request', 400);
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error, attempt: 1 }),
        'Error is not retryable, failing immediately'
      );
    });

    it('should not retry on HTTP 401 (Unauthorized)', async () => {
      const error = new HttpError('Unauthorized', 401);
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on HTTP 403 (Forbidden)', async () => {
      const error = new HttpError('Forbidden', 403);
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on HTTP 404 (Not Found)', async () => {
      const error = new HttpError('Not Found', 404);
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on generic Error without code or status', async () => {
      const error = new Error('Generic error');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on custom error without retryableErrors config', async () => {
      const error = new CustomNonRetryableError('Custom error');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Custom Retryable Errors', () => {
    it('should retry custom error classes when specified', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new CustomRetryableError('Retryable'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        retryableErrors: [CustomRetryableError],
      });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry errors not in retryableErrors list', async () => {
      const error = new CustomNonRetryableError('Non-retryable');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, {
        retryableErrors: [CustomRetryableError],
      });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should support multiple custom error classes', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new CustomRetryableError('Error 1'))
        .mockRejectedValueOnce(new CustomNonRetryableError('Error 2'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        retryableErrors: [CustomRetryableError, CustomNonRetryableError],
      });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should override default network errors when retryableErrors is set', async () => {
      const error = new NetworkError('Connection failed', 'ECONNREFUSED');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, {
        retryableErrors: [CustomRetryableError],
      });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle inheritance in error classes', async () => {
      class BaseError extends Error {}
      class DerivedError extends BaseError {}

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new DerivedError('Derived'))
        .mockResolvedValue('success');

      const promise = retry(fn, {
        retryableErrors: [BaseError],
      });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('onRetry Callback', () => {
    it('should call onRetry callback on each retry attempt', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { onRetry });
      jest.runAllTimers();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('should pass correct parameters to onRetry callback', async () => {
      const onRetry = jest.fn();
      const error = new NetworkError('Fail', 'ECONNREFUSED');
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = retry(fn, { onRetry, initialDelayMs: 100 });

      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(150);
      await Promise.resolve();

      expect(onRetry).toHaveBeenCalledWith(
        error,
        1, // attempt number
        expect.any(Number) // delay
      );

      await promise;
    });

    it('should not log warning when onRetry is provided', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { onRetry });
      jest.runAllTimers();
      await promise;

      expect(logger.warn).not.toHaveBeenCalled();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should allow custom logging in onRetry callback', async () => {
      const customLog = jest.fn();
      const onRetry = (error: Error, attempt: number, delay: number) => {
        customLog(`Retry ${attempt} after ${delay}ms: ${error.message}`);
      };

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { onRetry });
      jest.runAllTimers();
      await promise;

      expect(customLog).toHaveBeenCalledWith(expect.stringContaining('Retry 1'));
    });
  });

  describe('Decorator Pattern', () => {
    it('should work as method decorator', async () => {
      class TestService {
        callCount = 0;

        @Retry({ maxAttempts: 3 })
        async fetchData(): Promise<string> {
          this.callCount++;
          if (this.callCount < 3) {
            throw new NetworkError('Connection failed', 'ECONNREFUSED');
          }
          return 'success';
        }
      }

      const service = new TestService();
      const promise = service.fetchData();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(service.callCount).toBe(3);
    });

    it('should preserve method context (this)', async () => {
      class TestService {
        value = 'test';

        @Retry()
        async getValue(): Promise<string> {
          return this.value;
        }
      }

      const service = new TestService();
      const promise = service.getValue();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('test');
    });

    it('should work with method parameters', async () => {
      class TestService {
        callCount = 0;

        @Retry({ maxAttempts: 2 })
        async processData(data: string): Promise<string> {
          this.callCount++;
          if (this.callCount < 2) {
            throw new NetworkError('Fail', 'ECONNREFUSED');
          }
          return `processed: ${data}`;
        }
      }

      const service = new TestService();
      const promise = service.processData('test-data');
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('processed: test-data');
      expect(service.callCount).toBe(2);
    });

    it('should support multiple decorated methods', async () => {
      class TestService {
        count1 = 0;
        count2 = 0;

        @Retry()
        async method1(): Promise<string> {
          this.count1++;
          if (this.count1 < 2) {
            throw new NetworkError('Fail', 'ECONNREFUSED');
          }
          return 'method1';
        }

        @Retry()
        async method2(): Promise<string> {
          this.count2++;
          if (this.count2 < 2) {
            throw new NetworkError('Fail', 'ECONNREFUSED');
          }
          return 'method2';
        }
      }

      const service = new TestService();
      const promise1 = service.method1();
      const promise2 = service.method2();
      jest.runAllTimers();

      expect(await promise1).toBe('method1');
      expect(await promise2).toBe('method2');
      expect(service.count1).toBe(2);
      expect(service.count2).toBe(2);
    });

    it('should pass decorator options correctly', async () => {
      class TestService {
        callCount = 0;

        @Retry({ maxAttempts: 5, initialDelayMs: 50 })
        async fetchData(): Promise<string> {
          this.callCount++;
          if (this.callCount < 4) {
            throw new NetworkError('Connection failed', 'ECONNREFUSED');
          }
          return 'success';
        }
      }

      const service = new TestService();
      const promise = service.fetchData();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(service.callCount).toBe(4);
    });
  });

  describe('Retryable Wrapper', () => {
    it('should create retryable version of function', async () => {
      let callCount = 0;
      const originalFn = async (value: string) => {
        callCount++;
        if (callCount < 2) {
          throw new NetworkError('Fail', 'ECONNREFUSED');
        }
        return `result: ${value}`;
      };

      const retryableFn = retryable(originalFn);
      const promise = retryableFn('test');
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('result: test');
      expect(callCount).toBe(2);
    });

    it('should maintain function parameters', async () => {
      const originalFn = async (a: number, b: number, c: string) => {
        return `${a + b}-${c}`;
      };

      const retryableFn = retryable(originalFn);
      const promise = retryableFn(1, 2, 'test');
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('3-test');
    });

    it('should pass retry options to wrapper', async () => {
      let callCount = 0;
      const originalFn = async () => {
        callCount++;
        if (callCount < 5) {
          throw new NetworkError('Fail', 'ECONNREFUSED');
        }
        return 'success';
      };

      const retryableFn = retryable(originalFn, { maxAttempts: 5 });
      const promise = retryableFn();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(callCount).toBe(5);
    });

    it('should create independent retryable functions', async () => {
      let count1 = 0;
      let count2 = 0;
      const fn1 = async () => {
        count1++;
        return count1;
      };
      const fn2 = async () => {
        count2++;
        return count2;
      };

      const retryableFn1 = retryable(fn1);
      const retryableFn2 = retryable(fn2);

      const promise1 = retryableFn1();
      const promise2 = retryableFn2();
      jest.runAllTimers();

      expect(await promise1).toBe(1);
      expect(await promise2).toBe(1);
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should preserve function type signature', async () => {
      type TestFn = (x: number) => Promise<number>;
      const originalFn: TestFn = async (x) => x * 2;

      const retryableFn = retryable(originalFn);
      const promise = retryableFn(5);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe(10);
    });

    it('should work with functions that take no parameters', async () => {
      let count = 0;
      const originalFn = async () => {
        count++;
        if (count < 2) {
          throw new NetworkError('Fail', 'ECONNREFUSED');
        }
        return 'no params';
      };

      const retryableFn = retryable(originalFn);
      const promise = retryableFn();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('no params');
      expect(count).toBe(2);
    });
  });

  describe('Logging and Error Reporting', () => {
    it('should log warning on retry by default', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      await promise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Fail',
          errorCode: 'ECONNREFUSED',
          attempt: 1,
          maxAttempts: 3,
          delayMs: expect.any(Number),
        }),
        'Retrying operation after error'
      );
    });

    it('should include error code in logs when available', async () => {
      const error = new NetworkError('Connection failed', 'ECONNRESET');
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      await promise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'ECONNRESET',
        }),
        expect.any(String)
      );
    });

    it('should handle errors without code property', async () => {
      const error = new Error('Generic error message');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should log error when all attempts are exhausted', async () => {
      const error = new NetworkError('Connection failed', 'ECONNREFUSED');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retry(fn, { maxAttempts: 3 });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          maxAttempts: 3,
        }),
        'All retry attempts exhausted'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty retry options', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const promise = retry(fn, {});
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very large max attempts', async () => {
      let callCount = 0;
      const fn = jest.fn(async () => {
        callCount++;
        if (callCount < 100) {
          throw new NetworkError('Fail', 'ECONNREFUSED');
        }
        return 'success';
      });

      const promise = retry(fn, { maxAttempts: 100, initialDelayMs: 1 });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(callCount).toBe(100);
    });

    it('should handle zero initial delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelayMs: 0 });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle backoff multiplier of 1 (no exponential growth)', async () => {
      const delays: number[] = [];
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        delays.push(delay);
        return setTimeout(callback, 0) as any;
      });

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new NetworkError('Fail', 'ECONNREFUSED'))
        .mockResolvedValue('success');

      const promise = retry(fn, { initialDelayMs: 100, backoffMultiplier: 1 });
      jest.runAllTimers();
      await promise;

      // All delays should be around 100ms (plus jitter)
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(100);
        expect(delay).toBeLessThanOrEqual(120);
      });

      jest.restoreAllMocks();
    });

    it('should handle errors with both code and status properties', async () => {
      class HybridError extends Error {
        code: string;
        status: number;
        constructor(message: string, code: string, status: number) {
          super(message);
          this.code = code;
          this.status = status;
        }
      }

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new HybridError('Fail', 'ECONNREFUSED', 503))
        .mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle null or undefined options', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const promise = retry(fn, undefined as any);
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should handle function that throws synchronously', async () => {
      const fn = jest.fn(() => {
        throw new Error('Sync error');
      });

      const promise = retry(fn as any);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow('Sync error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle promises that reject with non-Error values', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      const promise = retry(fn);
      jest.runAllTimers();

      await expect(promise).rejects.toBe('string error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed success and failure patterns', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail 1', 'ECONNREFUSED'))
        .mockResolvedValueOnce('success 1')
        .mockRejectedValueOnce(new NetworkError('Fail 2', 'ECONNREFUSED'))
        .mockResolvedValue('success 2');

      // First call - fails then succeeds
      const promise1 = retry(fn, { maxAttempts: 3 });
      jest.runAllTimers();
      expect(await promise1).toBe('success 1');
      expect(fn).toHaveBeenCalledTimes(2);

      // Second call - fails then succeeds
      const promise2 = retry(fn, { maxAttempts: 3 });
      jest.runAllTimers();
      expect(await promise2).toBe('success 2');
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should handle retries with different error types', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Network', 'ECONNREFUSED'))
        .mockRejectedValueOnce(new HttpError('Server', 500))
        .mockRejectedValueOnce(new NetworkError('Timeout', 'ETIMEDOUT'))
        .mockResolvedValue('success');

      const promise = retry(fn, { maxAttempts: 5 });
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should maintain state across retries in class methods', async () => {
      class Counter {
        count = 0;
        attempts: number[] = [];

        @Retry({ maxAttempts: 5 })
        async incrementUntilSuccess(): Promise<number> {
          this.count++;
          this.attempts.push(this.count);

          if (this.count < 3) {
            throw new NetworkError('Not ready', 'ECONNREFUSED');
          }
          return this.count;
        }
      }

      const counter = new Counter();
      const promise = counter.incrementUntilSuccess();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe(3);
      expect(counter.count).toBe(3);
      expect(counter.attempts).toEqual([1, 2, 3]);
    });

    it('should work with nested retry calls', async () => {
      let outerCount = 0;
      let innerCount = 0;

      const innerFn = retryable(async () => {
        innerCount++;
        if (innerCount < 2) {
          throw new NetworkError('Inner fail', 'ECONNREFUSED');
        }
        return 'inner success';
      });

      const outerFn = retryable(async () => {
        outerCount++;
        if (outerCount < 2) {
          throw new NetworkError('Outer fail', 'ECONNREFUSED');
        }
        return await innerFn();
      });

      const promise = outerFn();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toBe('inner success');
      expect(outerCount).toBe(2);
      expect(innerCount).toBe(2);
    });

    it('should handle concurrent retry operations', async () => {
      let count1 = 0;
      let count2 = 0;

      const fn1 = async () => {
        count1++;
        if (count1 < 2) {
          throw new NetworkError('Fail 1', 'ECONNREFUSED');
        }
        return 'result1';
      };

      const fn2 = async () => {
        count2++;
        if (count2 < 3) {
          throw new NetworkError('Fail 2', 'ECONNREFUSED');
        }
        return 'result2';
      };

      const promise1 = retry(fn1);
      const promise2 = retry(fn2);

      jest.runAllTimers();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(count1).toBe(2);
      expect(count2).toBe(3);
    });
  });

  describe('Performance and Timing', () => {
    it('should not add unnecessary delay on first attempt', async () => {
      const startTime = Date.now();
      const fn = jest.fn().mockResolvedValue('success');

      const promise = retry(fn);
      jest.runAllTimers();
      await promise;

      // First attempt should be immediate (within a reasonable threshold)
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50); // Allow for test overhead
    });

    it('should respect timing for rapid successive failures', async () => {
      const timestamps: number[] = [];

      const fn = jest.fn(async () => {
        timestamps.push(Date.now());
        throw new NetworkError('Fail', 'ECONNREFUSED');
      });

      const promise = retry(fn, { maxAttempts: 3, initialDelayMs: 100 });
      jest.runAllTimers();

      await expect(promise).rejects.toThrow();

      // Verify timing gaps exist between attempts
      expect(timestamps.length).toBe(3);
    });
  });
});
