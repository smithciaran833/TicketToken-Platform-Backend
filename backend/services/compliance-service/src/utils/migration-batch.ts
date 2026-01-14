/**
 * Data Migration Batching Utility
 * 
 * AUDIT FIX: MIG-M2 - No data migration batching
 * 
 * Provides utilities for safe, batched data migrations with
 * progress tracking, error handling, and rollback support.
 * 
 * PHASE 5 BYPASS EXCEPTION:
 * These utilities operate directly on database tables (users, venues) for
 * bulk data migrations. This is intentional because:
 * 1. Migration utilities need direct DB access for transactional consistency
 * 2. These run as admin-only scheduled batch operations
 * 3. GdprAnonymizationMigration requires direct user data manipulation
 * 4. RiskScoreRecalculationMigration needs venue data in same transaction
 * 
 * These operations should be run with appropriate admin credentials and
 * database access controls.
 */
import { Knex } from 'knex';
import { logger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchMigrationOptions {
  /** Batch size for processing */
  batchSize: number;
  /** Delay between batches (ms) */
  batchDelayMs: number;
  /** Maximum retries per batch */
  maxRetries: number;
  /** Whether to continue on error */
  continueOnError: boolean;
  /** Progress callback */
  onProgress?: (progress: MigrationProgress) => void;
  /** Whether to run in dry-run mode */
  dryRun: boolean;
  /** Timeout per batch (ms) */
  batchTimeout: number;
}

export interface MigrationProgress {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  currentBatch: number;
  totalBatches: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  recordsPerSecond: number;
}

export interface BatchResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: BatchError[];
}

export interface BatchError {
  recordId: string;
  error: string;
  batch: number;
}

export interface MigrationResult {
  success: boolean;
  totalProcessed: number;
  totalFailed: number;
  duration: number;
  errors: BatchError[];
  rollbackPerformed: boolean;
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: BatchMigrationOptions = {
  batchSize: 1000,
  batchDelayMs: 100,
  maxRetries: 3,
  continueOnError: false,
  dryRun: false,
  batchTimeout: 30000
};

// =============================================================================
// BATCH MIGRATION CLASS
// =============================================================================

export class BatchMigration<T extends { id: string }> {
  private options: BatchMigrationOptions;
  private db: Knex;
  private tableName: string;
  private processedIds: Set<string> = new Set();
  private errors: BatchError[] = [];
  
  constructor(
    db: Knex,
    tableName: string,
    options: Partial<BatchMigrationOptions> = {}
  ) {
    this.db = db;
    this.tableName = tableName;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  /**
   * Run batched migration
   */
  async run(
    processor: (records: T[], trx: Knex.Transaction) => Promise<void>,
    query?: (qb: Knex.QueryBuilder) => Knex.QueryBuilder
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalFailed = 0;
    let rollbackPerformed = false;
    
    logger.info({
      tableName: this.tableName,
      options: this.options
    }, 'Starting batch migration');
    
    try {
      // Get total count
      let countQuery = this.db(this.tableName).count('* as count');
      if (query) {
        countQuery = query(countQuery);
      }
      const [{ count }] = await countQuery;
      const totalRecords = Number(count);
      const totalBatches = Math.ceil(totalRecords / this.options.batchSize);
      
      logger.info({
        totalRecords,
        totalBatches,
        batchSize: this.options.batchSize
      }, 'Migration analysis complete');
      
      if (this.options.dryRun) {
        logger.info('DRY RUN MODE - No changes will be made');
      }
      
      let currentBatch = 0;
      let offset = 0;
      
      while (true) {
        currentBatch++;
        
        // Fetch batch
        let batchQuery = this.db(this.tableName)
          .select('*')
          .limit(this.options.batchSize)
          .offset(offset);
        
        if (query) {
          batchQuery = query(batchQuery);
        }
        
        const records = await batchQuery as T[];
        
        if (records.length === 0) {
          break;
        }
        
        // Process batch with retries
        const result = await this.processBatchWithRetry(
          records,
          processor,
          currentBatch
        );
        
        totalProcessed += result.processedCount;
        totalFailed += result.failedCount;
        
        // Record processed IDs for potential rollback
        records.forEach(r => {
          if (!result.errors.find(e => e.recordId === r.id)) {
            this.processedIds.add(r.id);
          }
        });
        
        // Report progress
        const elapsed = Date.now() - startTime;
        const recordsPerSecond = totalProcessed / (elapsed / 1000);
        const remaining = totalRecords - totalProcessed - totalFailed;
        const estimatedRemaining = remaining / recordsPerSecond * 1000;
        
        const progress: MigrationProgress = {
          totalRecords,
          processedRecords: totalProcessed,
          failedRecords: totalFailed,
          currentBatch,
          totalBatches,
          elapsedMs: elapsed,
          estimatedRemainingMs: estimatedRemaining,
          recordsPerSecond
        };
        
        this.options.onProgress?.(progress);
        
        logger.info({
          batch: currentBatch,
          totalBatches,
          processed: totalProcessed,
          failed: totalFailed,
          recordsPerSecond: recordsPerSecond.toFixed(2)
        }, 'Batch complete');
        
        // Check for failure threshold
        if (!this.options.continueOnError && result.failedCount > 0) {
          logger.error('Batch failed, stopping migration');
          break;
        }
        
        offset += this.options.batchSize;
        
        // Delay between batches
        if (this.options.batchDelayMs > 0) {
          await this.delay(this.options.batchDelayMs);
        }
      }
      
    } catch (error) {
      logger.error({ error }, 'Migration failed with unexpected error');
      
      if (!this.options.dryRun) {
        logger.info('Attempting rollback...');
        rollbackPerformed = await this.rollback();
      }
    }
    
    const duration = Date.now() - startTime;
    
    const result: MigrationResult = {
      success: totalFailed === 0 && !rollbackPerformed,
      totalProcessed,
      totalFailed,
      duration,
      errors: this.errors,
      rollbackPerformed
    };
    
    logger.info({
      ...result,
      durationSeconds: (duration / 1000).toFixed(2)
    }, 'Migration complete');
    
    return result;
  }
  
  /**
   * Process batch with retry logic
   */
  private async processBatchWithRetry(
    records: T[],
    processor: (records: T[], trx: Knex.Transaction) => Promise<void>,
    batchNumber: number
  ): Promise<BatchResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (this.options.dryRun) {
          // In dry run, just log what would happen
          logger.debug({
            batch: batchNumber,
            recordCount: records.length,
            recordIds: records.slice(0, 5).map(r => r.id)
          }, 'DRY RUN: Would process batch');
          
          return {
            success: true,
            processedCount: records.length,
            failedCount: 0,
            errors: []
          };
        }
        
        // Process in transaction with timeout
        await this.withTimeout(
          this.db.transaction(async (trx) => {
            await processor(records, trx);
          }),
          this.options.batchTimeout
        );
        
        return {
          success: true,
          processedCount: records.length,
          failedCount: 0,
          errors: []
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.warn({
          batch: batchNumber,
          attempt,
          maxRetries: this.options.maxRetries,
          error: lastError.message
        }, 'Batch processing failed, retrying...');
        
        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.batchDelayMs * attempt);
        }
      }
    }
    
    // All retries exhausted
    const batchErrors: BatchError[] = records.map(r => ({
      recordId: r.id,
      error: lastError?.message || 'Unknown error',
      batch: batchNumber
    }));
    
    this.errors.push(...batchErrors);
    
    return {
      success: false,
      processedCount: 0,
      failedCount: records.length,
      errors: batchErrors
    };
  }
  
  /**
   * Rollback processed records
   * Override this method for custom rollback logic
   */
  protected async rollback(): Promise<boolean> {
    logger.warn({
      processedCount: this.processedIds.size
    }, 'Rollback not implemented - override rollback() method');
    return false;
  }
  
  /**
   * Helper to add timeout to promise
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Batch timeout')), ms)
      )
    ]);
  }
  
  /**
   * Helper for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SPECIFIC MIGRATIONS
// =============================================================================

/**
 * GDPR data anonymization migration
 */
export class GdprAnonymizationMigration extends BatchMigration<{ id: string; user_id: string }> {
  private backupTable: string;
  
  constructor(db: Knex, options?: Partial<BatchMigrationOptions>) {
    super(db, 'users', options);
    this.backupTable = `users_backup_${Date.now()}`;
  }
  
  async anonymize(): Promise<MigrationResult> {
    // Create backup table first
    const db = (this as any).db as Knex;
    await db.raw(`CREATE TABLE ${this.backupTable} AS SELECT * FROM users WHERE deleted_at IS NOT NULL`);
    
    return this.run(
      async (records, trx) => {
        for (const record of records) {
          await trx('users')
            .where('id', record.id)
            .update({
              email: `deleted_${record.id}@anonymized.local`,
              first_name: 'DELETED',
              last_name: 'USER',
              phone: null,
              address: null,
              anonymized_at: new Date()
            });
        }
      },
      (qb) => qb.whereNotNull('deleted_at').whereNull('anonymized_at')
    );
  }
  
  protected async rollback(): Promise<boolean> {
    const db = (this as any).db as Knex;
    try {
      // Restore from backup
      await db.raw(`
        UPDATE users u
        SET 
          email = b.email,
          first_name = b.first_name,
          last_name = b.last_name,
          phone = b.phone,
          address = b.address,
          anonymized_at = NULL
        FROM ${this.backupTable} b
        WHERE u.id = b.id
      `);
      
      // Drop backup table
      await db.raw(`DROP TABLE IF EXISTS ${this.backupTable}`);
      
      logger.info('Rollback completed successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Rollback failed');
      return false;
    }
  }
}

/**
 * Risk score recalculation migration
 */
export class RiskScoreRecalculationMigration extends BatchMigration<{ id: string; venue_id: string }> {
  constructor(db: Knex, options?: Partial<BatchMigrationOptions>) {
    super(db, 'venues', options);
  }
  
  async recalculate(
    calculateScore: (venueId: string) => Promise<number>
  ): Promise<MigrationResult> {
    return this.run(
      async (records, trx) => {
        for (const record of records) {
          const newScore = await calculateScore(record.id);
          
          await trx('venues')
            .where('id', record.id)
            .update({
              risk_score: newScore,
              risk_score_updated_at: new Date()
            });
          
          // Log score changes for audit
          await trx('risk_score_history').insert({
            venue_id: record.id,
            old_score: (record as any).risk_score,
            new_score: newScore,
            reason: 'bulk_recalculation',
            created_at: new Date()
          });
        }
      }
    );
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Run a simple batched update
 */
export async function batchUpdate<T extends { id: string }>(
  db: Knex,
  tableName: string,
  updates: Partial<T>,
  where: Partial<T>,
  options?: Partial<BatchMigrationOptions>
): Promise<MigrationResult> {
  const migration = new BatchMigration<T>(db, tableName, options);
  
  return migration.run(
    async (records, trx) => {
      const ids = records.map(r => r.id);
      await trx(tableName)
        .whereIn('id', ids)
        .update(updates);
    },
    (qb) => {
      Object.entries(where).forEach(([key, value]) => {
        qb.where(key, value);
      });
      return qb;
    }
  );
}

/**
 * Run a batched delete (soft delete)
 */
export async function batchSoftDelete<T extends { id: string }>(
  db: Knex,
  tableName: string,
  where: Partial<T>,
  options?: Partial<BatchMigrationOptions>
): Promise<MigrationResult> {
  return batchUpdate<T>(
    db,
    tableName,
    { deleted_at: new Date() } as unknown as Partial<T>,
    where,
    options
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  BatchMigration,
  GdprAnonymizationMigration,
  RiskScoreRecalculationMigration,
  batchUpdate,
  batchSoftDelete
};
