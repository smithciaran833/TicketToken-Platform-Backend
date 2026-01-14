/**
 * Comprehensive Unit Tests for src/utils/retry.ts
 *
 * Tests retry logic with exponential backoff, jitter, and rate limiting
 */

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
  retry,
  retryWithResult,
  withRetry,
  solanaRpcRetry,
  marketplaceApiRetry,
  databaseRetry,
  httpRetry,
} from '../../../src/utils/retry';

describe('src/utils/retry.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // BASIC RETRY FUNCTIONALITY
  // =============================================================================

  describe('retry() - Basic Functionality', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const result = await retry(fn, { initialDelayMs: 10, jitterPercent: 0 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(retry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow('ECONNREFUSED');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Not retryable'));

      await expect(retry(fn)).rejects.toThrow('Not retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry 5xx errors', async () => {
      const error: any = new Error('Server error');
      error.status = 503;
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry 429 rate limit errors', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // EXPONENTIAL BACKOFF
  // =============================================================================

  describe('retry() - Exponential Backoff', () => {
    it('should use exponential backoff delays', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        initialDelayMs: 10,
        backoffMultiplier: 2,
        jitterPercent: 0,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        initialDelayMs: 100000,
        maxDelayMs: 50,
        jitterPercent: 0,
      });

      expect(result).toBe('success');
    });
  });

  // =============================================================================
  // RATE LIMITING
  // =============================================================================

  describe('retry() - Rate Limiting', () => {
    it('should use retry-after header when rate limited', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;
      error.headers = { 'retry-after': '1' };

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
    });

    it('should fallback to exponential backoff if no retry-after', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, {
        initialDelayMs: 10,
        jitterPercent: 0,
      });

      expect(result).toBe('success');
    });

    it('should detect rate limit in error message', async () => {
      const error = new Error('Rate limit exceeded');
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // CUSTOM OPTIONS
  // =============================================================================

  describe('retry() - Custom Options', () => {
    it('should use custom shouldRetry function', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Custom error'));

      await expect(
        retry(fn, {
          maxRetries: 2,
          initialDelayMs: 10,
          shouldRetry: (error) => error.message === 'Custom error',
        })
      ).rejects.toThrow('Custom error');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use custom isRateLimited function', async () => {
      const error = new Error('My custom rate limit');
      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, {
        initialDelayMs: 10,
        isRateLimited: (err) => err.message.includes('custom rate limit'),
      });

      expect(result).toBe('success');
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      await retry(fn, { initialDelayMs: 10, onRetry });

      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number)
      );
    });

    it('should use operationName in logging', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      await retry(fn, { initialDelayMs: 10, operationName: 'test-operation' });

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // RETRY WITH RESULT
  // =============================================================================

  describe('retryWithResult()', () => {
    it('should return success result', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithResult(fn);

      expect(result).toEqual({
        success: true,
        result: 'success',
        attempts: 1,
        totalTimeMs: expect.any(Number),
      });
    });

    it('should return failure result', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Not retryable'));
      const result = await retryWithResult(fn);

      expect(result).toEqual({
        success: false,
        error: expect.any(Error),
        attempts: 1,
        totalTimeMs: expect.any(Number),
      });
    });

    it('should track attempts', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retryWithResult(fn, { initialDelayMs: 10 });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
  });

  // =============================================================================
  // WITH RETRY WRAPPER
  // =============================================================================

  describe('withRetry()', () => {
    it('should create retryable function', async () => {
      const originalFn = jest.fn().mockResolvedValue('success');
      const retryableFn = withRetry(originalFn);

      const result = await retryableFn();

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments through', async () => {
      const originalFn = jest.fn().mockResolvedValue('success');
      const retryableFn = withRetry(originalFn);

      await retryableFn('arg1', 'arg2');

      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should retry on failure', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const retryableFn = withRetry(originalFn, { initialDelayMs: 10 });

      const result = await retryableFn();

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should use provided retry options', async () => {
      const originalFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const retryableFn = withRetry(originalFn, { maxRetries: 1, initialDelayMs: 10 });

      await expect(retryableFn()).rejects.toThrow('ECONNREFUSED');
      expect(originalFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  // =============================================================================
  // NETWORK ERROR DETECTION
  // =============================================================================

  describe('Network Error Detection', () => {
    it('should retry ECONNREFUSED errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry ECONNRESET errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    it('should retry ETIMEDOUT errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    it('should retry socket hang up errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
    });
  });

  // =============================================================================
  // PRE-CONFIGURED RETRY FUNCTIONS
  // =============================================================================

  describe('Pre-configured Retry Functions', () => {
    describe('solanaRpcRetry()', () => {
      it('should retry RPC-specific errors', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('Too many requests'))
          .mockResolvedValue('success');

        const result = await solanaRpcRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry timeout errors', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValue('success');

        const result = await solanaRpcRetry(fn);

        expect(result).toBe('success');
      });
    });

    describe('marketplaceApiRetry()', () => {
      it('should retry marketplace API calls', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
          .mockResolvedValue('success');

        const result = await marketplaceApiRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    describe('databaseRetry()', () => {
      it('should retry connection errors', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('connection failed'))
          .mockResolvedValue('success');

        const result = await databaseRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry deadlock errors', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('deadlock detected'))
          .mockResolvedValue('success');

        const result = await databaseRetry(fn);

        expect(result).toBe('success');
      });

      it('should not retry non-connection errors', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('validation error'));

        await expect(databaseRetry(fn)).rejects.toThrow('validation error');
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });

    describe('httpRetry()', () => {
      it('should retry HTTP calls', async () => {
        const fn = jest
          .fn()
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
          .mockResolvedValue('success');

        const result = await httpRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle maxRetries of 0', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(retry(fn, { maxRetries: 0 })).rejects.toThrow('ECONNREFUSED');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid retry-after header', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;
      error.headers = { 'retry-after': 'invalid' };

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10, jitterPercent: 0 });

      expect(result).toBe('success');
    });

    it('should handle statusCode property', async () => {
      const error: any = new Error('Server error');
      error.statusCode = 502;

      const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    it('should handle case-insensitive rate limit in message', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('RATE LIMIT exceeded'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    it('should handle very large delays capped by maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        initialDelayMs: 1000000,
        maxDelayMs: 50,
        jitterPercent: 0,
      });

      expect(result).toBe('success');
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export retry function', () => {
      expect(typeof retry).toBe('function');
    });

    it('should export retryWithResult function', () => {
      expect(typeof retryWithResult).toBe('function');
    });

    it('should export withRetry function', () => {
      expect(typeof withRetry).toBe('function');
    });

    it('should export pre-configured retry functions', () => {
      expect(typeof solanaRpcRetry).toBe('function');
      expect(typeof marketplaceApiRetry).toBe('function');
      expect(typeof databaseRetry).toBe('function');
      expect(typeof httpRetry).toBe('function');
    });
  });
});
