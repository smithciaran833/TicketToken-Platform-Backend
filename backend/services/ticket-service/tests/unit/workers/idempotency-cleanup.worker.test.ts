// Mock DatabaseService
const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

// Mock idempotency metrics
jest.mock('../../../src/middleware/idempotency.middleware', () => ({
  idempotencyMetrics: {
    expirationsTotal: {
      inc: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { IdempotencyCleanupWorker, idempotencyCleanupWorker } from '../../../src/workers/idempotency-cleanup.worker';

describe('IdempotencyCleanupWorker', () => {
  let worker: IdempotencyCleanupWorker;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });

    worker = new IdempotencyCleanupWorker({
      intervalMs: 60000,
      maxKeyAgeMs: 604800000,
      batchSize: 100,
      verboseLogging: false,
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('start', () => {
    it('should start worker and run immediately', async () => {
      await worker.start();

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      await worker.start();
      await worker.start(); // Second call should be ignored
    });
  });

  describe('stop', () => {
    it('should stop the worker', async () => {
      await worker.start();
      await worker.stop();
    });
  });

  describe('runCleanup', () => {
    it('should delete expired keys', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '50' }] });

      const deleted = await worker.runCleanup();

      expect(deleted).toBe(50);
    });

    it('should handle no keys to delete', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });

      const deleted = await worker.runCleanup();

      expect(deleted).toBe(0);
    });

    it('should skip if already running', async () => {
      // Start a long-running cleanup
      let resolveQuery: Function;
      mockQuery.mockImplementationOnce(() => new Promise(resolve => {
        resolveQuery = resolve;
      }));

      const promise1 = worker.runCleanup();

      // Try to start second (should return 0)
      const result2 = await worker.runCleanup();

      expect(result2).toBe(0);

      // Cleanup
      resolveQuery!({ rows: [{ count: '0' }] });
      await promise1;
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection lost'));

      await expect(worker.runCleanup()).rejects.toThrow('Database connection lost');

      expect(worker.getMetrics().runsFailed).toBe(1);
      expect(worker.getMetrics().lastError).toBe('Database connection lost');
    });

    it('should update metrics on success', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '25' }] });

      await worker.runCleanup();

      const metrics = worker.getMetrics();
      expect(metrics.lastRunAt).toBeDefined();
      expect(metrics.lastRunDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const metrics = worker.getMetrics();

      expect(metrics).toHaveProperty('lastRunAt');
      expect(metrics).toHaveProperty('lastRunDurationMs');
      expect(metrics).toHaveProperty('totalKeysDeleted');
      expect(metrics).toHaveProperty('runsCompleted');
      expect(metrics).toHaveProperty('runsFailed');
      expect(metrics).toHaveProperty('lastError');
      expect(metrics).toHaveProperty('isRunning');
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return Prometheus format metrics', () => {
      const metrics = worker.getPrometheusMetrics();

      expect(metrics).toContain('idempotency_cleanup_last_run_timestamp');
      expect(metrics).toContain('idempotency_cleanup_last_duration_ms');
      expect(metrics).toContain('idempotency_cleanup_total_keys_deleted');
      expect(metrics).toContain('idempotency_cleanup_runs_completed_total');
      expect(metrics).toContain('idempotency_cleanup_runs_failed_total');
      expect(metrics).toContain('idempotency_cleanup_is_running');
    });
  });

  describe('forceCleanup', () => {
    it('should trigger immediate cleanup', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '15' }] });

      const deleted = await worker.forceCleanup();

      expect(deleted).toBe(15);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration at runtime', () => {
      worker.updateConfig({ batchSize: 500, maxKeyAgeMs: 86400000 });

      // Config should be updated (internal state)
    });
  });

  describe('singleton instance', () => {
    it('should export idempotencyCleanupWorker singleton', () => {
      expect(idempotencyCleanupWorker).toBeInstanceOf(IdempotencyCleanupWorker);
    });
  });
});
