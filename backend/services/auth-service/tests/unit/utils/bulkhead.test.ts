import {
  Bulkhead,
  BulkheadRejectError,
  BulkheadTimeoutError,
  bulkheads,
  withBulkhead,
} from '../../../src/utils/bulkhead';

// Mock the logger to avoid console noise
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('bulkhead utils', () => {
  describe('Bulkhead class', () => {
    it('executes immediately when under maxConcurrent', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 2, maxQueue: 2 });
      const result = await bulkhead.execute(() => Promise.resolve('done'));
      expect(result).toBe('done');
    });

    it('returns correct stats', () => {
      const bulkhead = new Bulkhead('test-stats', { maxConcurrent: 5, maxQueue: 10 });
      const stats = bulkhead.getStats();
      expect(stats).toEqual({
        name: 'test-stats',
        concurrent: 0,
        maxConcurrent: 5,
        queued: 0,
        maxQueue: 10,
      });
    });

    it('increments concurrent count during execution', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 5, maxQueue: 5 });
      let concurrentDuringExec = 0;

      await bulkhead.execute(async () => {
        concurrentDuringExec = bulkhead.getStats().concurrent;
        return 'done';
      });

      expect(concurrentDuringExec).toBe(1);
      expect(bulkhead.getStats().concurrent).toBe(0);
    });

    it('queues request when at maxConcurrent', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 1, maxQueue: 5 });
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      const first = bulkhead.execute(() => firstPromise);

      const secondStarted = jest.fn();
      const second = bulkhead.execute(async () => {
        secondStarted();
        return 'second';
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(bulkhead.getStats().queued).toBe(1);
      expect(secondStarted).not.toHaveBeenCalled();

      resolveFirst!();
      await first;

      const result = await second;
      expect(result).toBe('second');
      expect(secondStarted).toHaveBeenCalled();
    });

    it('throws BulkheadRejectError when queue is full', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 1, maxQueue: 1, timeout: 5000 });
      
      let resolveFirst: () => void;

      // Fill the concurrent slot with a blocking promise
      const first = bulkhead.execute(
        () => new Promise<string>((resolve) => {
          resolveFirst = () => resolve('first');
        })
      );

      // Fill the queue with another request (it won't start executing yet)
      const second = bulkhead.execute(() => Promise.resolve('second'));

      // Give time for queue to register
      await new Promise((r) => setTimeout(r, 10));

      // Verify state: 1 concurrent, 1 queued
      expect(bulkhead.getStats().concurrent).toBe(1);
      expect(bulkhead.getStats().queued).toBe(1);

      // This should reject immediately - queue is full
      await expect(
        bulkhead.execute(() => Promise.resolve('overflow'))
      ).rejects.toThrow(BulkheadRejectError);

      // Cleanup - release the first one so the rest can complete
      resolveFirst!();
      await first;
      await second;
    });

    it('throws BulkheadTimeoutError when queued request times out', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 1, maxQueue: 5, timeout: 50 });
      let resolveBlocking: () => void;

      const blocking = bulkhead.execute(
        () => new Promise<void>((resolve) => {
          resolveBlocking = resolve;
        })
      );

      const timeoutPromise = bulkhead.execute(() => Promise.resolve('should timeout'));

      await expect(timeoutPromise).rejects.toThrow(BulkheadTimeoutError);

      resolveBlocking!();
      await blocking;
    });

    it('processes queue after completion', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 1, maxQueue: 3 });
      const results: number[] = [];
      let resolveFirst: () => void;

      const first = bulkhead.execute(
        () => new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
      );

      const second = bulkhead.execute(async () => {
        results.push(2);
        return 2;
      });
      const third = bulkhead.execute(async () => {
        results.push(3);
        return 3;
      });

      resolveFirst!();
      await first;
      await second;
      await third;

      expect(results).toEqual([2, 3]);
    });

    it('handles errors in executed function', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 2, maxQueue: 2 });

      await expect(
        bulkhead.execute(() => Promise.reject(new Error('test error')))
      ).rejects.toThrow('test error');

      const result = await bulkhead.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(bulkhead.getStats().concurrent).toBe(0);
    });
  });

  describe('BulkheadRejectError', () => {
    it('has correct name', () => {
      const error = new BulkheadRejectError('test message');
      expect(error.name).toBe('BulkheadRejectError');
      expect(error.message).toBe('test message');
    });

    it('is instance of Error', () => {
      const error = new BulkheadRejectError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('BulkheadTimeoutError', () => {
    it('has correct name', () => {
      const error = new BulkheadTimeoutError('test message');
      expect(error.name).toBe('BulkheadTimeoutError');
      expect(error.message).toBe('test message');
    });

    it('is instance of Error', () => {
      const error = new BulkheadTimeoutError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('pre-configured bulkheads', () => {
    it('database bulkhead has correct settings', () => {
      const stats = bulkheads.database.getStats();
      expect(stats.name).toBe('database');
      expect(stats.maxConcurrent).toBe(20);
      expect(stats.maxQueue).toBe(50);
    });

    it('externalApi bulkhead has correct settings', () => {
      const stats = bulkheads.externalApi.getStats();
      expect(stats.name).toBe('external-api');
      expect(stats.maxConcurrent).toBe(10);
      expect(stats.maxQueue).toBe(20);
    });

    it('auth bulkhead has correct settings', () => {
      const stats = bulkheads.auth.getStats();
      expect(stats.name).toBe('auth');
      expect(stats.maxConcurrent).toBe(50);
      expect(stats.maxQueue).toBe(100);
    });

    it('email bulkhead has correct settings', () => {
      const stats = bulkheads.email.getStats();
      expect(stats.name).toBe('email');
      expect(stats.maxConcurrent).toBe(5);
      expect(stats.maxQueue).toBe(100);
    });
  });

  describe('withBulkhead helper', () => {
    it('executes function through bulkhead', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 2, maxQueue: 2 });
      const result = await withBulkhead(bulkhead, () => Promise.resolve('helper result'));
      expect(result).toBe('helper result');
    });

    it('propagates errors from function', async () => {
      const bulkhead = new Bulkhead('test', { maxConcurrent: 2, maxQueue: 2 });
      await expect(
        withBulkhead(bulkhead, () => Promise.reject(new Error('helper error')))
      ).rejects.toThrow('helper error');
    });
  });
});
