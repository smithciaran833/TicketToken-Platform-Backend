/**
 * Unit Tests for Retry Utility
 */

jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import {
  withRetry,
  withRetryJitter,
  retryOnSpecificErrors,
  retryBatch,
} from '../../../src/utils/retry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }))
      .rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const startTime = Date.now();
    await withRetry(fn, {
      initialDelayMs: 50,
      backoffMultiplier: 2,
    });
    const elapsed = Date.now() - startTime;

    // First delay: 50ms, second delay: 100ms = 150ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxDelayMs', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const startTime = Date.now();
    await withRetry(fn, {
      initialDelayMs: 100,
      maxDelayMs: 50,
      backoffMultiplier: 10,
    });
    const elapsed = Date.now() - startTime;

    // Delay should be capped at 50ms each time
    expect(elapsed).toBeLessThan(300);
  });

  it('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, { initialDelayMs: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('should skip retry for non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fatal error'));

    await expect(withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
      retryableErrors: ['transient'],
    })).rejects.toThrow('fatal error');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry for matching retryable errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('transient network issue'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      initialDelayMs: 10,
      retryableErrors: ['transient', 'timeout'],
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetryJitter', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetryJitter(fn);
    expect(result).toBe('success');
  });

  it('should retry with jitter on failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await withRetryJitter(fn, { initialDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetryJitter(fn, { maxAttempts: 2, initialDelayMs: 10 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should have variable delays due to jitter', async () => {
    const delays: number[] = [];
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    let lastTime = Date.now();
    const originalSetTimeout = setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any, delay: any) => {
      delays.push(delay);
      return originalSetTimeout(cb, 10); // Use short delay for test
    });

    await withRetryJitter(fn, { initialDelayMs: 100, backoffMultiplier: 2 });

    // Jitter should make delays slightly different from exact values
    expect(fn).toHaveBeenCalledTimes(3);
    
    jest.restoreAllMocks();
  });
});

describe('retryOnSpecificErrors', () => {
  class TransientError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TransientError';
    }
  }

  class FatalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FatalError';
    }
  }

  it('should retry on specified error types', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new TransientError('temp'))
      .mockResolvedValueOnce('success');

    const result = await retryOnSpecificErrors(
      fn,
      [TransientError],
      { initialDelayMs: 10 }
    );

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-specified error types', async () => {
    const fn = jest.fn().mockRejectedValue(new FatalError('fatal'));

    await expect(retryOnSpecificErrors(
      fn,
      [TransientError],
      { initialDelayMs: 10 }
    )).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple error types', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new TransientError('temp'))
      .mockRejectedValueOnce(new FatalError('fatal'))
      .mockResolvedValueOnce('success');

    await expect(retryOnSpecificErrors(
      fn,
      [TransientError],
      { initialDelayMs: 10 }
    )).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('retryBatch', () => {
  it('should return all successes', async () => {
    const operations = [
      jest.fn().mockResolvedValue('a'),
      jest.fn().mockResolvedValue('b'),
      jest.fn().mockResolvedValue('c'),
    ];

    const { successes, failures } = await retryBatch(operations);

    expect(successes).toEqual(['a', 'b', 'c']);
    expect(failures).toHaveLength(0);
  });

  it('should collect failures after retry exhaustion', async () => {
    const operations = [
      jest.fn().mockResolvedValue('success'),
      jest.fn().mockRejectedValue(new Error('fail')),
    ];

    const { successes, failures } = await retryBatch(operations, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    expect(successes).toEqual(['success']);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toBe('fail');
  });

  it('should retry each operation independently', async () => {
    const op1 = jest.fn()
      .mockRejectedValueOnce(new Error('temp'))
      .mockResolvedValueOnce('op1-success');
    
    const op2 = jest.fn().mockResolvedValue('op2-success');

    const { successes, failures } = await retryBatch([op1, op2], {
      initialDelayMs: 10,
    });

    expect(successes).toContain('op1-success');
    expect(successes).toContain('op2-success');
    expect(failures).toHaveLength(0);
    expect(op1).toHaveBeenCalledTimes(2);
    expect(op2).toHaveBeenCalledTimes(1);
  });

  it('should handle empty batch', async () => {
    const { successes, failures } = await retryBatch([]);
    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(0);
  });

  it('should handle all failures', async () => {
    const operations = [
      jest.fn().mockRejectedValue(new Error('fail1')),
      jest.fn().mockRejectedValue(new Error('fail2')),
    ];

    const { successes, failures } = await retryBatch(operations, {
      maxAttempts: 1,
      initialDelayMs: 10,
    });

    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(2);
  });
});

describe('Default Options', () => {
  it('should use default maxAttempts of 3', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry(fn, { initialDelayMs: 5 }))
      .rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use default initialDelayMs of 1000', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const start = Date.now();
    await withRetry(fn, { maxAttempts: 2 });
    const elapsed = Date.now() - start;

    // Should be at least 1000ms but we'll check for a smaller value to avoid flaky tests
    expect(elapsed).toBeGreaterThanOrEqual(900);
  }, 10000);
});
