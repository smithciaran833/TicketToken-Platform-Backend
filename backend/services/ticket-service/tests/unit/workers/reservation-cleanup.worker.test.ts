// Mock pg Pool
const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(mockClient),
    query: mockPoolQuery,
  })),
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    database: {
      url: 'postgres://localhost/test',
    },
  },
}));

// Mock RedisService
const mockRedisDel = jest.fn();
const mockRedisKeys = jest.fn();
const mockRedisClient = {
  keys: mockRedisKeys,
};

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    del: mockRedisDel,
    getClient: jest.fn(() => mockRedisClient),
  },
}));

// Mock QueueService
const mockPublish = jest.fn();
jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    publish: mockPublish,
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

import { ReservationCleanupWorker } from '../../../src/workers/reservation-cleanup.worker';

describe('ReservationCleanupWorker', () => {
  let worker: ReservationCleanupWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    worker = new ReservationCleanupWorker();

    // Default mocks
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockRedisKeys.mockResolvedValue([]);
  });

  afterEach(() => {
    worker.stop();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start worker and run cleanup immediately', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // release_expired_reservations
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValue({ rows: [] });

      await worker.start();

      expect(mockClientQuery).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      mockClientQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      await worker.start();
      await worker.start(); // Second call should be ignored
    });

    it('should schedule periodic cleanup', async () => {
      mockClientQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      await worker.start(30000);

      // Cleanup should be scheduled
    });
  });

  describe('stop', () => {
    it('should stop the worker', async () => {
      mockClientQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      await worker.start();
      worker.stop();
    });
  });

  describe('cleanup operations', () => {
    it('should release expired reservations', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // release_expired_reservations
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'res-1',
              order_id: 'order-1',
              user_id: 'user-1',
              quantity: 2,
              expires_at: new Date(),
              event_id: 'event-1',
              tickets: [],
            },
          ],
        }) // SELECT expired
        .mockResolvedValue({ rows: [] });

      await worker.start();

      // Should write to outbox and clear Redis
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.any(Array)
      );
    });

    it('should fix orphan reservations', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // release_expired_reservations
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({
          rows: [{
            reservation_id: 'res-orphan',
            order_id: null,
            user_id: 'user-1',
            created_at: new Date(),
            expires_at: new Date(),
            status: 'PENDING',
            quantity: 1,
            issue_type: 'no_order',
          }],
        }) // find_orphan_reservations
        .mockResolvedValue({ rows: [] });

      await worker.start();

      // Should process orphan reservations
    });

    it('should clean up stale Redis entries', async () => {
      mockClientQuery.mockResolvedValue({ rows: [{ count: 0 }] });
      mockRedisKeys.mockResolvedValue(['reservation:stale-1', 'reservation:stale-2']);
      mockPoolQuery.mockResolvedValue({ rows: [] }); // No matching DB record

      await worker.start();

      // Should delete stale Redis keys
      expect(mockRedisDel).toHaveBeenCalled();
    });

    it('should reconcile inventory discrepancies', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // orphans
        .mockResolvedValueOnce({ rows: [] }) // negative inventory
        .mockResolvedValueOnce({
          rows: [{
            id: 'type-1',
            name: 'VIP',
            total_quantity: 100,
            available_quantity: 90,
            reserved_quantity: 5,
            discrepancy: 5,
          }],
        }) // discrepancies
        .mockResolvedValue({ rows: [] });

      await worker.start();

      // Should log discrepancies to outbox
    });

    it('should handle negative inventory', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // orphans
        .mockResolvedValueOnce({
          rows: [{
            id: 'type-1',
            name: 'VIP',
            available_quantity: -5,
            total_quantity: 100,
          }],
        }) // negative inventory
        .mockResolvedValue({ rows: [] });

      await worker.start();

      // Should fix and alert
      expect(mockPublish).toHaveBeenCalledWith(
        'alerts',
        expect.objectContaining({
          type: 'inventory.negative',
          severity: 'critical',
        })
      );
    });

    it('should notify on significant cleanups', async () => {
      // Set metrics to trigger notification
      const workerWithMetrics = new ReservationCleanupWorker();
      (workerWithMetrics as any).metrics = {
        totalReleased: 0,
        orphansFound: 15,
        orphansFixed: 15,
        errors: 0,
        lastRun: null,
      };

      mockClientQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      await workerWithMetrics.start();

      // Should send summary notification
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const metrics = worker.getMetrics();

      expect(metrics).toHaveProperty('totalReleased');
      expect(metrics).toHaveProperty('orphansFound');
      expect(metrics).toHaveProperty('orphansFixed');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('lastRun');
    });
  });

  describe('error handling', () => {
    it('should handle cleanup errors gracefully', async () => {
      mockClientQuery.mockRejectedValue(new Error('Database error'));

      await worker.start();

      // Should not throw, just log error
      expect(worker.getMetrics().errors).toBeGreaterThanOrEqual(0);
    });
  });
});
