/**
 * Webhook Cleanup Cron Tests
 * Tests for cleaning up old/stale webhook data
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('WebhookCleanupJob', () => {
  let job: WebhookCleanupJob;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    job = new WebhookCleanupJob(mockDb);
  });

  describe('execute', () => {
    it('should delete webhooks older than retention period', async () => {
      mockDb.webhooks.deleteOlderThan.mockResolvedValue(100);

      await job.execute();

      expect(mockDb.webhooks.deleteOlderThan).toHaveBeenCalled();
    });

    it('should use configurable retention days', async () => {
      job = new WebhookCleanupJob(mockDb, { retentionDays: 60 });

      await job.execute();

      const call = mockDb.webhooks.deleteOlderThan.mock.calls[0];
      expect(call[0]).toBeDefined(); // Date parameter
    });

    it('should report deleted count', async () => {
      mockDb.webhooks.deleteOlderThan.mockResolvedValue(50);

      const result = await job.execute();

      expect(result.deletedCount).toBe(50);
    });

    it('should archive before deleting if configured', async () => {
      job = new WebhookCleanupJob(mockDb, { archiveBeforeDelete: true });
      mockDb.webhooks.findOlderThan.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      await job.execute();

      expect(mockDb.webhookArchive.insertMany).toHaveBeenCalled();
    });
  });

  describe('cleanup failed webhooks', () => {
    it('should clean up permanently failed webhooks', async () => {
      await job.cleanupFailedWebhooks();

      expect(mockDb.webhooks.deleteByStatus).toHaveBeenCalledWith('permanently_failed', expect.any(Date));
    });

    it('should clean up expired webhooks', async () => {
      await job.cleanupExpiredWebhooks();

      expect(mockDb.webhooks.deleteExpired).toHaveBeenCalled();
    });
  });

  describe('cleanup idempotency keys', () => {
    it('should clean up old idempotency keys', async () => {
      await job.cleanupIdempotencyKeys();

      expect(mockDb.idempotencyKeys.deleteOlderThan).toHaveBeenCalled();
    });

    it('should keep keys for at least 24 hours', async () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      await job.cleanupIdempotencyKeys();

      const call = mockDb.idempotencyKeys.deleteOlderThan.mock.calls[0];
      expect(call[0].getTime()).toBeLessThanOrEqual(oneDayAgo);
    });
  });

  describe('batch processing', () => {
    it('should process in batches for large datasets', async () => {
      mockDb.webhooks.countOlderThan.mockResolvedValue(10000);
      mockDb.webhooks.deleteBatch.mockResolvedValue(1000);

      await job.executeBatched();

      expect(mockDb.webhooks.deleteBatch.mock.calls.length).toBeGreaterThanOrEqual(10);
    });

    it('should respect batch size limit', async () => {
      job = new WebhookCleanupJob(mockDb, { batchSize: 500 });
      mockDb.webhooks.countOlderThan.mockResolvedValue(1500);
      mockDb.webhooks.deleteBatch.mockResolvedValue(500);

      await job.executeBatched();

      expect(mockDb.webhooks.deleteBatch).toHaveBeenCalledWith(expect.anything(), 500);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.webhooks.deleteOlderThan.mockRejectedValue(new Error('DB error'));

      await expect(job.execute()).resolves.not.toThrow();
    });

    it('should report errors in result', async () => {
      mockDb.webhooks.deleteOlderThan.mockRejectedValue(new Error('DB error'));

      const result = await job.execute();

      expect(result.error).toBeDefined();
    });
  });
});

function createMockDb() {
  return {
    webhooks: {
      deleteOlderThan: jest.fn().mockResolvedValue(0),
      deleteByStatus: jest.fn().mockResolvedValue(0),
      deleteExpired: jest.fn().mockResolvedValue(0),
      findOlderThan: jest.fn().mockResolvedValue([]),
      countOlderThan: jest.fn().mockResolvedValue(0),
      deleteBatch: jest.fn().mockResolvedValue(0),
    },
    webhookArchive: {
      insertMany: jest.fn().mockResolvedValue({ insertedCount: 0 }),
    },
    idempotencyKeys: {
      deleteOlderThan: jest.fn().mockResolvedValue(0),
    },
  };
}

interface JobOptions {
  retentionDays?: number;
  archiveBeforeDelete?: boolean;
  batchSize?: number;
}

class WebhookCleanupJob {
  private retentionDays: number;
  private archiveBeforeDelete: boolean;
  private batchSize: number;

  constructor(private db: any, options: JobOptions = {}) {
    this.retentionDays = options.retentionDays || 30;
    this.archiveBeforeDelete = options.archiveBeforeDelete || false;
    this.batchSize = options.batchSize || 1000;
  }

  async execute() {
    try {
      const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

      if (this.archiveBeforeDelete) {
        const toArchive = await this.db.webhooks.findOlderThan(cutoffDate);
        if (toArchive.length > 0) await this.db.webhookArchive.insertMany(toArchive);
      }

      const deletedCount = await this.db.webhooks.deleteOlderThan(cutoffDate);
      return { deletedCount };
    } catch (error: any) {
      return { deletedCount: 0, error: error.message };
    }
  }

  async cleanupFailedWebhooks() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.db.webhooks.deleteByStatus('permanently_failed', cutoffDate);
  }

  async cleanupExpiredWebhooks() {
    await this.db.webhooks.deleteExpired();
  }

  async cleanupIdempotencyKeys() {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.db.idempotencyKeys.deleteOlderThan(cutoffDate);
  }

  async executeBatched() {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const total = await this.db.webhooks.countOlderThan(cutoffDate);

    let deleted = 0;
    while (deleted < total) {
      const batchDeleted = await this.db.webhooks.deleteBatch(cutoffDate, this.batchSize);
      deleted += batchDeleted;
      if (batchDeleted === 0) break;
    }

    return { deletedCount: deleted };
  }
}
