// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  retry,
  retryable,
  RetryWrapper,
  RetryPresets,
  defaultRetryableErrors,
} from '../../../src/utils/retry.util';
import { logger } from '../../../src/utils/logger';

describe('Retry Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('defaultRetryableErrors', () => {
    it('should return true for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for ENOTFOUND', () => {
      const error = { code: 'ENOTFOUND' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for ECONNRESET', () => {
      const error = { code: 'ECONNRESET' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 429 status (rate limited)', () => {
      const error = { response: { status: 429 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 500 status', () => {
      const error = { response: { status: 500 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 502 status', () => {
      const error = { response: { status: 502 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 503 status', () => {
      const error = { response: { status: 503 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 504 status', () => {
      const error = { response: { status: 504 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for 408 status (timeout)', () => {
      const error = { response: { status: 408 } };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return false for 400 status', () => {
      const error = { response: { status: 400 } };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should return false for 401 status', () => {
      const error = { response: { status: 401 } };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should return false for 403 status', () => {
      const error = { response: { status: 403 } };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should return false for 404 status', () => {
      const error = { response: { status: 404 } };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should return true for timeout message', () => {
      const error = { message: 'Request timeout occurred' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for timed out message', () => {
      const error = { message: 'Connection timed out' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for connection refused message', () => {
      const error = { message: 'Connection refused by server' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for network error message', () => {
      const error = { message: 'Network error: Unable to connect' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for service unavailable message', () => {
      const error = { message: 'Service unavailable' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return true for temporary failure message', () => {
      const error = { message: 'Temporary failure, please retry' };
      expect(defaultRetryableErrors(error)).toBe(true);
    });

    it('should return false for validation error', () => {
      const error = { message: 'Validation failed: invalid email' };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should return false for authentication error', () => {
      const error = { message: 'Invalid credentials' };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should handle null error message', () => {
      const error = { message: null };
      expect(defaultRetryableErrors(error)).toBe(false);
    });

    it('should handle undefined error', () => {
      const error = {};
      expect(defaultRetryableErrors(error)).toBe(false);
    });
  });

  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce('success');

      const result = await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts exceeded', async () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        retry(fn, {
          maxAttempts: 3,
          initialDelay: 1,
          jitter: false,
        })
      ).rejects.toEqual(error);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = { response: { status: 400 }, message: 'Bad request' };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        retry(fn, { maxAttempts: 3, initialDelay: 1 })
      ).rejects.toEqual(error);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom retryable error checker', async () => {
      const error = { custom: true };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const customRetryable = jest.fn().mockReturnValue(true);

      const result = await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
        retryableErrors: customRetryable,
      });

      expect(result).toBe('success');
      expect(customRetryable).toHaveBeenCalledWith(error);
    });

    it('should call onRetry callback', async () => {
      const error = { code: 'ETIMEDOUT' };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn();

      await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith(error, 1);
    });

    it('should handle onRetry callback errors gracefully', async () => {
      const error = { code: 'ETIMEDOUT' };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      const result = await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
        onRetry,
      });

      expect(result).toBe('success');
      expect(logger.error).toHaveBeenCalledWith(
        'Error in retry callback',
        expect.any(Object)
      );
    });

    it('should apply exponential backoff with increasing delays', async () => {
      const error = { code: 'ECONNREFUSED' };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const startTime = Date.now();

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        backoffFactor: 2,
        jitter: false,
      });

      const elapsed = Date.now() - startTime;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      // Should have waited at least 10ms + 20ms = 30ms
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });

    it('should respect maxDelay', async () => {
      const error = { code: 'ECONNREFUSED' };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const startTime = Date.now();

      await retry(fn, {
        maxAttempts: 5,
        initialDelay: 100,
        maxDelay: 50,
        backoffFactor: 10,
        jitter: false,
      });

      const elapsed = Date.now() - startTime;

      // Both delays should be capped at 50ms, so max ~100ms total
      expect(elapsed).toBeLessThan(200);
    });

    it('should log warnings on retry', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Timeout' })
        .mockResolvedValueOnce('success');

      await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Retrying after failure',
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 3,
        })
      );
    });

    it('should log error on permanent failure', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT', message: 'Timeout' });

      await expect(
        retry(fn, {
          maxAttempts: 2,
          initialDelay: 1,
          jitter: false,
        })
      ).rejects.toBeDefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Retry failed permanently',
        expect.objectContaining({
          attempt: 2,
          maxAttempts: 2,
        })
      );
    });

    it('should handle Error instances', async () => {
      const error = new Error('Network failure');
      (error as any).code = 'ECONNRESET';
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('done');

      const result = await retry(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
      });

      expect(result).toBe('done');
    });
  });

  describe('retryable', () => {
    it('should wrap function with retry logic', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce('result');

      const wrappedFn = retryable(fn, {
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
      });

      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = jest.fn().mockResolvedValue('done');

      const wrappedFn = retryable(fn, { maxAttempts: 1 });
      await wrappedFn(1, 'two', { three: 3 });

      expect(fn).toHaveBeenCalledWith(1, 'two', { three: 3 });
    });
  });

  describe('RetryWrapper', () => {
    it('should execute function with retry', async () => {
      const wrapper = new RetryWrapper({
        maxAttempts: 3,
        initialDelay: 1,
        jitter: false,
      });

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('success');

      const result = await wrapper.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should allow config updates', async () => {
      const wrapper = new RetryWrapper({
        maxAttempts: 1,
        initialDelay: 1,
        jitter: false,
      });

      wrapper.updateConfig({ maxAttempts: 3 });

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce('success');

      const result = await wrapper.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should merge config updates', async () => {
      const wrapper = new RetryWrapper({
        maxAttempts: 3,
        initialDelay: 500,
        jitter: false,
      });

      wrapper.updateConfig({ initialDelay: 1 });

      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValueOnce('done');

      const result = await wrapper.execute(fn);

      expect(result).toBe('done');
    });
  });

  describe('RetryPresets', () => {
    it('should have QUICK preset with correct values', () => {
      expect(RetryPresets.QUICK).toEqual({
        maxAttempts: 3,
        initialDelay: 500,
        maxDelay: 5000,
        backoffFactor: 2,
        jitter: true,
      });
    });

    it('should have STANDARD preset with correct values', () => {
      expect(RetryPresets.STANDARD).toEqual({
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: true,
      });
    });

    it('should have AGGRESSIVE preset with correct values', () => {
      expect(RetryPresets.AGGRESSIVE).toEqual({
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffFactor: 2,
        jitter: true,
      });
    });

    it('should have RATE_LIMITED preset with correct values', () => {
      expect(RetryPresets.RATE_LIMITED).toEqual({
        maxAttempts: 5,
        initialDelay: 5000,
        maxDelay: 120000,
        backoffFactor: 2,
        jitter: true,
      });
    });

    it('should work with retry function', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValueOnce('result');

      const result = await retry(fn, {
        ...RetryPresets.QUICK,
        initialDelay: 1,
        jitter: false,
      });

      expect(result).toBe('result');
    });
  });
});
