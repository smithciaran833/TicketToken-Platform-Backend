/**
 * Idempotency Key Cleanup Worker
 * 
 * Periodically cleans up expired idempotency keys from the database
 * Supports the key expiration policy added in Batch 24
 */

import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';
import { idempotencyMetrics } from '../middleware/idempotency.middleware';

const log = logger.child({ component: 'IdempotencyCleanupWorker' });

// =============================================================================
// CONFIGURATION
// =============================================================================

interface CleanupConfig {
  /** How often to run cleanup (ms) - default 1 hour */
  intervalMs: number;
  /** Maximum key age before cleanup (ms) - default 7 days */
  maxKeyAgeMs: number;
  /** Batch size for deletion - default 1000 */
  batchSize: number;
  /** Whether to log each deletion */
  verboseLogging: boolean;
}

const DEFAULT_CONFIG: CleanupConfig = {
  intervalMs: parseInt(process.env.IDEMPOTENCY_CLEANUP_INTERVAL_MS || '3600000', 10), // 1 hour
  maxKeyAgeMs: parseInt(process.env.IDEMPOTENCY_KEY_MAX_AGE_MS || '604800000', 10), // 7 days
  batchSize: parseInt(process.env.IDEMPOTENCY_CLEANUP_BATCH_SIZE || '1000', 10),
  verboseLogging: process.env.IDEMPOTENCY_CLEANUP_VERBOSE === 'true',
};

// =============================================================================
// CLEANUP METRICS
// =============================================================================

interface CleanupMetrics {
  lastRunAt: Date | null;
  lastRunDurationMs: number;
  totalKeysDeleted: number;
  runsCompleted: number;
  runsFailed: number;
  lastError: string | null;
}

const metrics: CleanupMetrics = {
  lastRunAt: null,
  lastRunDurationMs: 0,
  totalKeysDeleted: 0,
  runsCompleted: 0,
  runsFailed: 0,
  lastError: null,
};

// =============================================================================
// WORKER CLASS
// =============================================================================

export class IdempotencyCleanupWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private config: CleanupConfig;

  constructor(config?: Partial<CleanupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the cleanup worker
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      log.warn('Worker already started');
      return;
    }

    log.info('Starting idempotency cleanup worker', {
      intervalMs: this.config.intervalMs,
      maxKeyAgeMs: this.config.maxKeyAgeMs,
      batchSize: this.config.batchSize,
    });

    // Run immediately on start
    await this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(err => {
        log.error('Scheduled cleanup failed', { error: err });
      });
    }, this.config.intervalMs);

    log.info('Idempotency cleanup worker started');
  }

  /**
   * Stop the cleanup worker
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Idempotency cleanup worker stopped');
    }

    // Wait for any running cleanup to complete
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Run a single cleanup cycle
   */
  async runCleanup(): Promise<number> {
    if (this.isRunning) {
      log.warn('Cleanup already in progress, skipping');
      return 0;
    }

    this.isRunning = true;
    const startTime = Date.now();
    let totalDeleted = 0;

    try {
      const cutoffDate = new Date(Date.now() - this.config.maxKeyAgeMs);
      
      log.info('Starting idempotency key cleanup', {
        cutoffDate: cutoffDate.toISOString(),
        maxAgeMs: this.config.maxKeyAgeMs,
      });

      // Delete in batches to avoid long-running transactions
      let deletedInBatch = 0;
      do {
        deletedInBatch = await this.deleteExpiredKeysBatch(cutoffDate);
        totalDeleted += deletedInBatch;

        if (this.config.verboseLogging && deletedInBatch > 0) {
          log.debug('Deleted batch of idempotency keys', { count: deletedInBatch });
        }
      } while (deletedInBatch >= this.config.batchSize);

      // Update metrics
      metrics.lastRunAt = new Date();
      metrics.lastRunDurationMs = Date.now() - startTime;
      metrics.totalKeysDeleted += totalDeleted;
      metrics.runsCompleted++;
      metrics.lastError = null;

      // Update Prometheus metrics if available
      if (idempotencyMetrics?.expirationsTotal) {
        idempotencyMetrics.expirationsTotal.inc(totalDeleted);
      }

      log.info('Idempotency key cleanup completed', {
        keysDeleted: totalDeleted,
        durationMs: metrics.lastRunDurationMs,
      });

      return totalDeleted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      metrics.runsFailed++;
      metrics.lastError = errorMessage;

      log.error('Idempotency key cleanup failed', {
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Delete a batch of expired keys
   */
  private async deleteExpiredKeysBatch(cutoffDate: Date): Promise<number> {
    const result = await DatabaseService.query<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM ticket_idempotency_keys
        WHERE created_at < $1
        AND id IN (
          SELECT id FROM ticket_idempotency_keys
          WHERE created_at < $1
          LIMIT $2
        )
        RETURNING id
      )
      SELECT COUNT(*) as count FROM deleted`,
      [cutoffDate, this.config.batchSize]
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get cleanup metrics
   */
  getMetrics(): CleanupMetrics & { isRunning: boolean } {
    return {
      ...metrics,
      isRunning: this.isRunning,
    };
  }

  /**
   * Get Prometheus metrics format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    lines.push('# HELP idempotency_cleanup_last_run_timestamp Last cleanup run timestamp');
    lines.push('# TYPE idempotency_cleanup_last_run_timestamp gauge');
    lines.push(`idempotency_cleanup_last_run_timestamp ${metrics.lastRunAt?.getTime() || 0}`);

    lines.push('# HELP idempotency_cleanup_last_duration_ms Last cleanup duration in milliseconds');
    lines.push('# TYPE idempotency_cleanup_last_duration_ms gauge');
    lines.push(`idempotency_cleanup_last_duration_ms ${metrics.lastRunDurationMs}`);

    lines.push('# HELP idempotency_cleanup_total_keys_deleted Total keys deleted across all runs');
    lines.push('# TYPE idempotency_cleanup_total_keys_deleted counter');
    lines.push(`idempotency_cleanup_total_keys_deleted ${metrics.totalKeysDeleted}`);

    lines.push('# HELP idempotency_cleanup_runs_completed_total Total successful cleanup runs');
    lines.push('# TYPE idempotency_cleanup_runs_completed_total counter');
    lines.push(`idempotency_cleanup_runs_completed_total ${metrics.runsCompleted}`);

    lines.push('# HELP idempotency_cleanup_runs_failed_total Total failed cleanup runs');
    lines.push('# TYPE idempotency_cleanup_runs_failed_total counter');
    lines.push(`idempotency_cleanup_runs_failed_total ${metrics.runsFailed}`);

    lines.push('# HELP idempotency_cleanup_is_running Whether cleanup is currently running');
    lines.push('# TYPE idempotency_cleanup_is_running gauge');
    lines.push(`idempotency_cleanup_is_running ${this.isRunning ? 1 : 0}`);

    return lines.join('\n');
  }

  /**
   * Force a cleanup run (for testing/admin)
   */
  async forceCleanup(): Promise<number> {
    log.info('Forced cleanup triggered');
    return this.runCleanup();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    log.info('Cleanup configuration updated', this.config);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const idempotencyCleanupWorker = new IdempotencyCleanupWorker();

export default IdempotencyCleanupWorker;
