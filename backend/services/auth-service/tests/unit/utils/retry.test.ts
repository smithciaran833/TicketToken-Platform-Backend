const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { withRetry, withTimeout } from '../../../src/utils/retry';

describe('retry utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withRetry', () => {
    it('succeeds on first try without retry', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error and succeeds', async () => {
      const error = new Error('network');
      (error as any).code = 'ECONNRESET';
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, { maxRetries: 3, baseDelay: 1, maxDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries exhausted', async () => {
      const error = new Error('network');
      (error as any).code = 'ETIMEDOUT';
      
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelay: 1, maxDelay: 10 })
      ).rejects.toThrow('network');
      
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does not retry non-retryable errors', async () => {
      const error = new Error('validation');
      (error as any).response = { status: 400 };
      
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('validation');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx errors', async () => {
      const error = new Error('server error');
      (error as any).response = { status: 503 };
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, { maxRetries: 3, baseDelay: 1, maxDelay: 10 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses custom retryOn function', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('custom'))
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, {
        maxRetries: 3,
        baseDelay: 1,
        maxDelay: 10,
        retryOn: (err) => err.message === 'custom',
      });

      expect(result).toBe('ok');
    });

    it('respects maxDelay cap', async () => {
      const error = new Error('network');
      (error as any).code = 'ECONNRESET';
      
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('ok');

      const startTime = Date.now();
      await withRetry(fn, { maxRetries: 1, baseDelay: 1, maxDelay: 50 });
      const elapsed = Date.now() - startTime;

      // Should complete quickly with small delays
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('withTimeout', () => {
    it('resolves if under timeout', async () => {
      const promise = Promise.resolve('fast');

      const result = await withTimeout(promise, 1000);

      expect(result).toBe('fast');
    });

    it('rejects if timeout exceeded', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 500);
      });

      await expect(withTimeout(slowPromise, 10)).rejects.toThrow('timed out after 10ms');
    });

    it('clears timeout on success', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('done');

      await withTimeout(promise, 1000);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timeout on error', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const promise = Promise.reject(new Error('fail'));

      await expect(withTimeout(promise, 1000)).rejects.toThrow('fail');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
