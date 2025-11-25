import { withRetry } from '../../../src/utils/retry';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Retry Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // withRetry Success - 2 test cases
  // =============================================================================

  describe('withRetry Success', () => {
    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom max attempts', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await withRetry(fn, { maxAttempts: 5 });

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // withRetry Failure - 3 test cases
  // =============================================================================

  describe('withRetry Failure', () => {
    it('should retry on retryable errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      const result = await withRetry(fn, { initialDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue({ response: { status: 400 } });

      await expect(withRetry(fn)).rejects.toEqual({ response: { status: 400 } });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(withRetry(fn, { maxAttempts: 2, initialDelay: 10 })).rejects.toEqual({ code: 'ETIMEDOUT' });
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // withRetry Custom Options - 3 test cases
  // =============================================================================

  describe('withRetry Custom Options', () => {
    it('should use custom shouldRetry function', async () => {
      const shouldRetry = jest.fn().mockReturnValue(false);
      const fn = jest.fn().mockRejectedValue(new Error('Custom error'));

      await expect(withRetry(fn, { shouldRetry })).rejects.toThrow('Custom error');
      expect(shouldRetry).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      await withRetry(fn, { onRetry, initialDelay: 10 });

      expect(onRetry).toHaveBeenCalledWith({ code: 'ECONNREFUSED' }, 1);
    });

    it('should respect custom initial delay', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const start = Date.now();
      await withRetry(fn, { initialDelay: 50, maxDelay: 50 });
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(40); // Allow some margin
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // Default Retry Logic - 3 test cases
  // =============================================================================

  describe('Default Retry Logic', () => {
    it('should retry on ECONNREFUSED', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
        .mockResolvedValue('success');

      await withRetry(fn, { initialDelay: 10 });

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx errors', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue('success');

      await withRetry(fn, { initialDelay: 10 });

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx errors', async () => {
      const fn = jest.fn().mockRejectedValue({ response: { status: 404 } });

      await expect(withRetry(fn)).rejects.toEqual({ response: { status: 404 } });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
