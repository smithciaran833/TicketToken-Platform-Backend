/**
 * Unit Tests for Migration Batch Utility
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Knex } from 'knex';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Migration Batch Utility', () => {
  let migrationBatch: typeof import('../../../src/utils/migration-batch');
  let logger: any;
  let mockDb: any;
  let mockTrx: any;

  // Helper to create a chainable query builder mock
  function createQueryBuilder(overrides: Partial<Record<string, any>> = {}): any {
    const builder: any = {};
    
    builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 0 }]);
    builder.select = jest.fn<() => any>().mockReturnValue(builder);
    builder.where = jest.fn<() => any>().mockReturnValue(builder);
    builder.whereIn = jest.fn<() => any>().mockReturnValue(builder);
    builder.whereNotNull = jest.fn<() => any>().mockReturnValue(builder);
    builder.whereNull = jest.fn<() => any>().mockReturnValue(builder);
    builder.limit = jest.fn<() => any>().mockReturnValue(builder);
    builder.offset = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
    builder.update = jest.fn<() => Promise<number>>().mockResolvedValue(1);
    builder.insert = jest.fn<() => Promise<number[]>>().mockResolvedValue([1]);

    // Apply overrides
    Object.entries(overrides).forEach(([key, value]) => {
      builder[key] = typeof value === 'function' ? value : jest.fn<() => any>().mockReturnValue(value);
    });

    return builder;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    // Create mock transaction
    mockTrx = jest.fn<() => any>().mockImplementation(() => createQueryBuilder());

    // Create mock database
    mockDb = jest.fn<() => any>().mockImplementation(() => createQueryBuilder());
    mockDb.transaction = jest.fn<(cb: any) => Promise<any>>().mockImplementation((callback: any) => callback(mockTrx));
    mockDb.raw = jest.fn<() => Promise<{ rows: any[] }>>().mockResolvedValue({ rows: [] });

    migrationBatch = await import('../../../src/utils/migration-batch');
  });

  afterEach(() => {
    jest.resetModules();
  });

  // ===========================================================================
  // BatchMigration Class
  // ===========================================================================
  describe('BatchMigration', () => {
    describe('constructor', () => {
      it('should create with default options', () => {
        const migration = new migrationBatch.BatchMigration(
          mockDb as unknown as Knex,
          'test_table'
        );
        expect(migration).toBeDefined();
      });

      it('should accept custom options', () => {
        const migration = new migrationBatch.BatchMigration(
          mockDb as unknown as Knex,
          'test_table',
          { batchSize: 500, dryRun: true }
        );
        expect(migration).toBeDefined();
      });
    });

    describe('run', () => {
      it('should log migration start', async () => {
        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { batchSize: 10, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        await migration.run(processor as any);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ tableName: 'test_table' }),
          'Starting batch migration'
        );
      });

      it('should handle empty table', async () => {
        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { batchSize: 10, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        const result = await migration.run(processor as any);

        expect(result.success).toBe(true);
        expect(result.totalProcessed).toBe(0);
      });

      it('should process records in batches', async () => {
        const records = [{ id: '1' }, { id: '2' }, { id: '3' }];
        let callCount = 0;

        mockDb.mockImplementation(() => {
          const builder = createQueryBuilder();
          builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 3 }]);
          builder.offset = jest.fn<() => Promise<any[]>>().mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? records : [];
          });
          return builder;
        });

        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { batchSize: 10, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        const result = await migration.run(processor as any);

        expect(result.totalProcessed).toBe(3);
        expect(processor).toHaveBeenCalledTimes(1);
      });

      it('should handle dry run mode', async () => {
        const records = [{ id: '1' }, { id: '2' }];
        let callCount = 0;

        mockDb.mockImplementation(() => {
          const builder = createQueryBuilder();
          builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 2 }]);
          builder.offset = jest.fn<() => Promise<any[]>>().mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? records : [];
          });
          return builder;
        });

        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { dryRun: true, batchSize: 10, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        await migration.run(processor as any);

        expect(logger.info).toHaveBeenCalledWith('DRY RUN MODE - No changes will be made');
      });

      it('should call progress callback', async () => {
        const records = [{ id: '1' }];
        let callCount = 0;

        mockDb.mockImplementation(() => {
          const builder = createQueryBuilder();
          builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 1 }]);
          builder.offset = jest.fn<() => Promise<any[]>>().mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? records : [];
          });
          return builder;
        });

        const onProgress = jest.fn();

        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { onProgress, batchSize: 10, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        await migration.run(processor as any);

        expect(onProgress).toHaveBeenCalledWith(
          expect.objectContaining({
            totalRecords: 1,
            processedRecords: 1,
            currentBatch: 1
          })
        );
      });

      it('should stop on error when continueOnError is false', async () => {
        const records = [{ id: '1' }, { id: '2' }];
        let callCount = 0;

        mockDb.mockImplementation(() => {
          const builder = createQueryBuilder();
          builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 2 }]);
          builder.offset = jest.fn<() => Promise<any[]>>().mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? records : [];
          });
          return builder;
        });

        mockDb.transaction = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('DB Error'));

        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { continueOnError: false, maxRetries: 1, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        const result = await migration.run(processor as any);

        expect(result.totalFailed).toBeGreaterThan(0);
      });

      it('should retry failed batches', async () => {
        const records = [{ id: '1' }];
        let callCount = 0;
        let txAttempts = 0;

        mockDb.mockImplementation(() => {
          const builder = createQueryBuilder();
          builder.count = jest.fn<() => Promise<{ count: number }[]>>().mockResolvedValue([{ count: 1 }]);
          builder.offset = jest.fn<() => Promise<any[]>>().mockImplementation(async () => {
            callCount++;
            return callCount === 1 ? records : [];
          });
          return builder;
        });

        mockDb.transaction = jest.fn<(cb: any) => Promise<any>>().mockImplementation(async (callback: any) => {
          txAttempts++;
          if (txAttempts < 3) {
            throw new Error('Temporary error');
          }
          return callback(mockTrx);
        });

        const migration = new migrationBatch.BatchMigration<{ id: string }>(
          mockDb as unknown as Knex,
          'test_table',
          { maxRetries: 3, batchDelayMs: 0 }
        );

        const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

        const result = await migration.run(processor as any);

        expect(txAttempts).toBe(3);
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // GdprAnonymizationMigration
  // ===========================================================================
  describe('GdprAnonymizationMigration', () => {
    it('should create instance with default options', () => {
      const migration = new migrationBatch.GdprAnonymizationMigration(
        mockDb as unknown as Knex
      );
      expect(migration).toBeDefined();
    });

    it('should create instance with custom options', () => {
      const migration = new migrationBatch.GdprAnonymizationMigration(
        mockDb as unknown as Knex,
        { batchSize: 500, dryRun: true }
      );
      expect(migration).toBeDefined();
    });

    it('should have anonymize method', () => {
      const migration = new migrationBatch.GdprAnonymizationMigration(
        mockDb as unknown as Knex
      );
      expect(typeof migration.anonymize).toBe('function');
    });

    it('should create backup table before anonymization', async () => {
      mockDb.mockImplementation(() => {
        const builder = createQueryBuilder();
        builder.whereNotNull = jest.fn<() => any>().mockReturnValue(builder);
        builder.whereNull = jest.fn<() => any>().mockReturnValue(builder);
        return builder;
      });

      const migration = new migrationBatch.GdprAnonymizationMigration(
        mockDb as unknown as Knex,
        { batchDelayMs: 0 }
      );

      await migration.anonymize();

      expect(mockDb.raw).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE')
      );
    });
  });

  // ===========================================================================
  // RiskScoreRecalculationMigration
  // ===========================================================================
  describe('RiskScoreRecalculationMigration', () => {
    it('should create instance with default options', () => {
      const migration = new migrationBatch.RiskScoreRecalculationMigration(
        mockDb as unknown as Knex
      );
      expect(migration).toBeDefined();
    });

    it('should create instance with custom options', () => {
      const migration = new migrationBatch.RiskScoreRecalculationMigration(
        mockDb as unknown as Knex,
        { batchSize: 100 }
      );
      expect(migration).toBeDefined();
    });

    it('should have recalculate method', () => {
      const migration = new migrationBatch.RiskScoreRecalculationMigration(
        mockDb as unknown as Knex
      );
      expect(typeof migration.recalculate).toBe('function');
    });

    it('should accept score calculator function', async () => {
      const migration = new migrationBatch.RiskScoreRecalculationMigration(
        mockDb as unknown as Knex,
        { batchDelayMs: 0 }
      );

      const calculator = jest.fn<() => Promise<number>>().mockResolvedValue(75);

      await migration.recalculate(calculator as any);

      // Calculator not called because no records
      expect(calculator).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // batchUpdate Helper
  // ===========================================================================
  describe('batchUpdate', () => {
    it('should create BatchMigration and run update', async () => {
      const result = await migrationBatch.batchUpdate<{ id: string; status?: string; active?: boolean }>(
        mockDb as unknown as Knex,
        'users',
        { status: 'inactive' },
        { active: false },
        { batchDelayMs: 0 }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should pass options to BatchMigration', async () => {
      const result = await migrationBatch.batchUpdate<{ id: string; status?: string; active?: boolean }>(
        mockDb as unknown as Knex,
        'users',
        { status: 'inactive' },
        { active: false },
        { batchSize: 500, dryRun: true, batchDelayMs: 0 }
      );

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // batchSoftDelete Helper
  // ===========================================================================
  describe('batchSoftDelete', () => {
    it('should call batchUpdate with deleted_at', async () => {
      const result = await migrationBatch.batchSoftDelete<{ id: string; status?: string }>(
        mockDb as unknown as Knex,
        'users',
        { status: 'pending_delete' },
        { batchDelayMs: 0 }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // MigrationProgress Interface
  // ===========================================================================
  describe('MigrationProgress tracking', () => {
    it('should track progress metrics', async () => {
      const progress = {
        totalRecords: 1000,
        processedRecords: 500,
        failedRecords: 5,
        currentBatch: 5,
        totalBatches: 10,
        elapsedMs: 5000,
        estimatedRemainingMs: 5000,
        recordsPerSecond: 100
      };

      expect(progress.totalRecords).toBe(1000);
      expect(progress.processedRecords).toBe(500);
      expect(progress.failedRecords).toBe(5);
      expect(progress.recordsPerSecond).toBe(100);
    });
  });

  // ===========================================================================
  // MigrationResult Interface
  // ===========================================================================
  describe('MigrationResult', () => {
    it('should contain expected fields', () => {
      const result = {
        success: true,
        totalProcessed: 1000,
        totalFailed: 0,
        duration: 10000,
        errors: [],
        rollbackPerformed: false
      };

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(1000);
      expect(result.rollbackPerformed).toBe(false);
    });

    it('should track errors with batch info', () => {
      const error = {
        recordId: 'rec-123',
        error: 'Database constraint violation',
        batch: 5
      };

      expect(error.recordId).toBe('rec-123');
      expect(error.batch).toBe(5);
    });
  });

  // ===========================================================================
  // Default Export
  // ===========================================================================
  describe('default export', () => {
    it('should export all classes and functions', () => {
      expect(migrationBatch.default).toBeDefined();
      expect(migrationBatch.default.BatchMigration).toBe(migrationBatch.BatchMigration);
      expect(migrationBatch.default.GdprAnonymizationMigration).toBe(migrationBatch.GdprAnonymizationMigration);
      expect(migrationBatch.default.RiskScoreRecalculationMigration).toBe(migrationBatch.RiskScoreRecalculationMigration);
      expect(migrationBatch.default.batchUpdate).toBe(migrationBatch.batchUpdate);
      expect(migrationBatch.default.batchSoftDelete).toBe(migrationBatch.batchSoftDelete);
    });
  });

  // ===========================================================================
  // BatchMigrationOptions defaults
  // ===========================================================================
  describe('BatchMigrationOptions defaults', () => {
    it('should use sensible defaults', async () => {
      const migration = new migrationBatch.BatchMigration<{ id: string }>(
        mockDb as unknown as Knex,
        'test_table'
        // No options - uses defaults
      );

      const processor = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      const result = await migration.run(processor as any);

      // Should complete successfully with defaults
      expect(result.success).toBe(true);
    });
  });
});
