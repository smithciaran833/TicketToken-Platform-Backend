/**
 * Unit Tests for Bulkhead Middleware
 */

import { Bulkhead, bulkheads, getAllBulkheadStats, withBulkhead } from '../../../src/middleware/bulkhead';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('middleware/bulkhead', () => {
  describe('Bulkhead Class', () => {
    let bulkhead: Bulkhead;

    beforeEach(() => {
      bulkhead = new Bulkhead({
        name: `test-bulkhead-${Date.now()}-${Math.random()}`,
        maxConcurrent: 2,
        maxWaiting: 2,
        timeoutMs: 100,
      });
    });

    it('should execute task when under capacity', async () => {
      const task = jest.fn().mockResolvedValue('success');

      const result = await bulkhead.execute(task);

      expect(result).toBe('success');
      expect(task).toHaveBeenCalled();
    });

    it('should execute multiple tasks concurrently up to limit', async () => {
      const task1 = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('task1'), 50)));
      const task2 = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('task2'), 50)));

      const promise1 = bulkhead.execute(task1);
      const promise2 = bulkhead.execute(task2);

      const results = await Promise.all([promise1, promise2]);

      expect(results).toEqual(['task1', 'task2']);
      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();
    });

    it('should queue tasks when at capacity', async () => {
      // Use a bulkhead with longer timeout for this test
      const testBulkhead = new Bulkhead({
        name: `queue-test-${Date.now()}`,
        maxConcurrent: 2,
        maxWaiting: 2,
        timeoutMs: 500, // Longer timeout so queued task doesn't timeout
      });

      const longTask = () => new Promise(resolve => setTimeout(resolve, 50));
      const quickTask = jest.fn().mockResolvedValue('quick');

      // Fill capacity
      const p1 = testBulkhead.execute(longTask);
      const p2 = testBulkhead.execute(longTask);

      // This should queue
      const p3 = testBulkhead.execute(quickTask);

      const stats = testBulkhead.getStats();
      expect(stats.executing).toBe(2);
      expect(stats.waiting).toBe(1);

      await Promise.all([p1, p2, p3]);
      expect(quickTask).toHaveBeenCalled();
    });

    it('should reject when queue is full', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 200));

      // Fill capacity and queue - don't await, just capture promises
      const promises = [
        bulkhead.execute(longTask),
        bulkhead.execute(longTask),
        bulkhead.execute(longTask),
        bulkhead.execute(longTask),
      ];

      // This should be rejected immediately (queue is full)
      await expect(bulkhead.execute(longTask)).rejects.toThrow('is full');

      // Clean up - wait for all to settle (some will timeout, that's ok)
      await Promise.allSettled(promises);
    });

    it('should timeout waiting tasks', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 500));

      // Fill capacity - capture promises to clean up later
      const p1 = bulkhead.execute(longTask);
      const p2 = bulkhead.execute(longTask);

      // This should timeout (100ms timeout, but slots won't free for 500ms)
      await expect(bulkhead.execute(longTask)).rejects.toThrow('timed out after 100ms');

      // Clean up - let the long tasks settle
      await Promise.allSettled([p1, p2]);
    });

    it('should track statistics correctly', async () => {
      const task = jest.fn().mockResolvedValue('done');

      const stats1 = bulkhead.getStats();
      expect(stats1.executing).toBe(0);

      await bulkhead.execute(task);

      const stats2 = bulkhead.getStats();
      expect(stats2.totalRejected).toBe(0);
      expect(stats2.totalTimedOut).toBe(0);
    });

    it('should decrement executing count after task completes', async () => {
      const task = () => Promise.resolve('done');

      await bulkhead.execute(task);

      const stats = bulkhead.getStats();
      expect(stats.executing).toBe(0);
    });

    it('should handle task errors without affecting bulkhead state', async () => {
      const errorTask = () => Promise.reject(new Error('Task failed'));

      await expect(bulkhead.execute(errorTask)).rejects.toThrow('Task failed');

      const stats = bulkhead.getStats();
      expect(stats.executing).toBe(0);
    });
  });

  describe('Pre-configured Bulkheads', () => {
    it('should have upload bulkhead configured', () => {
      expect(bulkheads.upload).toBeDefined();
      const stats = bulkheads.upload.getStats();
      expect(stats.name).toBe('upload');
      expect(stats.config.maxConcurrent).toBe(20);
    });

    it('should have download bulkhead configured', () => {
      expect(bulkheads.download).toBeDefined();
      const stats = bulkheads.download.getStats();
      expect(stats.name).toBe('download');
      expect(stats.config.maxConcurrent).toBe(100);
    });

    it('should have imageProcessing bulkhead configured', () => {
      expect(bulkheads.imageProcessing).toBeDefined();
      const stats = bulkheads.imageProcessing.getStats();
      expect(stats.name).toBe('imageProcessing');
      expect(stats.config.maxConcurrent).toBe(10);
    });

    it('should have videoTranscode bulkhead configured', () => {
      expect(bulkheads.videoTranscode).toBeDefined();
      const stats = bulkheads.videoTranscode.getStats();
      expect(stats.name).toBe('videoTranscode');
      expect(stats.config.maxConcurrent).toBe(3);
    });

    it('should have different timeout settings per bulkhead', () => {
      const uploadStats = bulkheads.upload.getStats();
      const videoStats = bulkheads.videoTranscode.getStats();

      expect(uploadStats.config.timeoutMs).toBe(60000);
      expect(videoStats.config.timeoutMs).toBe(300000); // 5 minutes for video
    });
  });

  describe('getAllBulkheadStats', () => {
    it('should return stats for all bulkheads', () => {
      const allStats = getAllBulkheadStats();

      expect(allStats).toHaveProperty('upload');
      expect(allStats).toHaveProperty('download');
      expect(allStats).toHaveProperty('imageProcessing');
      expect(allStats).toHaveProperty('videoTranscode');
      expect(allStats).toHaveProperty('virusScan');
      expect(allStats).toHaveProperty('database');
      expect(allStats).toHaveProperty('s3');
      expect(allStats).toHaveProperty('default');
    });

    it('should return current state of each bulkhead', () => {
      const allStats = getAllBulkheadStats();

      Object.values(allStats).forEach(stats => {
        expect(stats).toHaveProperty('executing');
        expect(stats).toHaveProperty('waiting');
        expect(stats).toHaveProperty('totalRejected');
        expect(stats).toHaveProperty('totalTimedOut');
      });
    });
  });

  describe('withBulkhead', () => {
    it('should execute function with specified bulkhead', async () => {
      const task = jest.fn().mockResolvedValue('result');

      const result = await withBulkhead('default', task);

      expect(result).toBe('result');
      expect(task).toHaveBeenCalled();
    });

    it('should use default bulkhead for unknown bulkhead name', async () => {
      const task = jest.fn().mockResolvedValue('done');

      const result = await withBulkhead('nonexistent' as any, task);

      expect(result).toBe('done');
    });

    it('should propagate errors from wrapped function', async () => {
      const errorTask = () => Promise.reject(new Error('Wrapped error'));

      await expect(withBulkhead('upload', errorTask)).rejects.toThrow('Wrapped error');
    });
  });

  describe('Resource Isolation', () => {
    it('should isolate upload from download operations', async () => {
      const uploadTask = () => new Promise(resolve => setTimeout(resolve, 50));
      const downloadTask = () => new Promise(resolve => setTimeout(resolve, 50));

      // Fill upload bulkhead
      const uploadPromises = Array(20).fill(null).map(() =>
        bulkheads.upload.execute(uploadTask)
      );

      // Download should still work
      const downloadResult = await bulkheads.download.execute(downloadTask);

      await Promise.all(uploadPromises);
      expect(downloadResult).toBeUndefined();
    });

    it('should isolate processing from database operations', async () => {
      const processingTask = () => new Promise(resolve => setTimeout(resolve, 50));
      const dbTask = jest.fn().mockResolvedValue('db-result');

      // Fill processing bulkhead
      const processingPromises = Array(10).fill(null).map(() =>
        bulkheads.imageProcessing.execute(processingTask)
      );

      // Database should not be affected
      const dbResult = await bulkheads.database.execute(dbTask);

      expect(dbResult).toBe('db-result');
      await Promise.all(processingPromises);
    });
  });
});
