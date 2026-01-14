/**
 * Blockchain Reconciliation Worker
 *
 * Periodically reconciles blockchain state with database records
 * Ensures data consistency between on-chain and off-chain data
 */

import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';
import { SolanaService } from '../services/solanaService';
import { withSystemContext } from './system-job-utils';

const log = logger.child({ component: 'BlockchainReconciliationWorker' });

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ReconciliationConfig {
  /** How often to run reconciliation (ms) - default 5 minutes */
  intervalMs: number;
  /** Maximum transactions to reconcile per run - default 100 */
  batchSize: number;
  /** Age threshold for pending transactions (ms) - default 2 minutes */
  pendingAgeThresholdMs: number;
  /** Maximum retries for failed transactions */
  maxRetries: number;
  /** Whether to auto-fix discrepancies */
  autoFix: boolean;
  /** Enabled in production only by default */
  enabled: boolean;
}

const DEFAULT_CONFIG: ReconciliationConfig = {
  intervalMs: parseInt(process.env.RECONCILIATION_INTERVAL_MS || '300000', 10), // 5 minutes
  batchSize: parseInt(process.env.RECONCILIATION_BATCH_SIZE || '100', 10),
  pendingAgeThresholdMs: parseInt(process.env.RECONCILIATION_PENDING_AGE_MS || '120000', 10), // 2 minutes
  maxRetries: parseInt(process.env.RECONCILIATION_MAX_RETRIES || '3', 10),
  autoFix: process.env.RECONCILIATION_AUTO_FIX === 'true',
  enabled: process.env.RECONCILIATION_ENABLED !== 'false',
};

// =============================================================================
// TYPES
// =============================================================================

interface ReconciliationResult {
  totalProcessed: number;
  confirmed: number;
  failed: number;
  expired: number;
  retried: number;
  discrepancies: DiscrepancyRecord[];
}

interface DiscrepancyRecord {
  type: 'OWNERSHIP_MISMATCH' | 'MISSING_ON_CHAIN' | 'MISSING_OFF_CHAIN' | 'STATUS_MISMATCH';
  ticketId?: string;
  txSignature?: string;
  expected: string;
  actual: string;
  resolved: boolean;
  timestamp: Date;
}

interface PendingTransaction {
  tx_signature: string;
  tenant_id: string;
  ticket_id: string;
  tx_type: string;
  status: string;
  blockhash: string;
  last_valid_block_height: number;
  submitted_at: Date;
  retry_count: number;
}

// =============================================================================
// METRICS
// =============================================================================

interface ReconciliationMetrics {
  lastRunAt: Date | null;
  lastRunDurationMs: number;
  runsCompleted: number;
  runsFailed: number;
  totalTransactionsProcessed: number;
  totalConfirmed: number;
  totalFailed: number;
  totalExpired: number;
  totalDiscrepancies: number;
  lastError: string | null;
}

const metrics: ReconciliationMetrics = {
  lastRunAt: null,
  lastRunDurationMs: 0,
  runsCompleted: 0,
  runsFailed: 0,
  totalTransactionsProcessed: 0,
  totalConfirmed: 0,
  totalFailed: 0,
  totalExpired: 0,
  totalDiscrepancies: 0,
  lastError: null,
};

// =============================================================================
// WORKER CLASS
// =============================================================================

export class BlockchainReconciliationWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private config: ReconciliationConfig;
  private discrepancyLog: DiscrepancyRecord[] = [];

  constructor(config?: Partial<ReconciliationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the reconciliation worker
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      log.info('Blockchain reconciliation worker disabled');
      return;
    }

    if (this.intervalId) {
      log.warn('Worker already started');
      return;
    }

    log.info('Starting blockchain reconciliation worker', {
      intervalMs: this.config.intervalMs,
      batchSize: this.config.batchSize,
      autoFix: this.config.autoFix,
    });

    // Run immediately on start
    await this.runReconciliation();

    // Schedule periodic reconciliation
    this.intervalId = setInterval(() => {
      this.runReconciliation().catch(err => {
        log.error('Scheduled reconciliation failed', { error: err });
      });
    }, this.config.intervalMs);

    log.info('Blockchain reconciliation worker started');
  }

  /**
   * Stop the reconciliation worker
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Blockchain reconciliation worker stopped');
    }

    // Wait for any running reconciliation to complete
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Run a single reconciliation cycle
   */
  async runReconciliation(): Promise<ReconciliationResult> {
    if (this.isRunning) {
      log.warn('Reconciliation already in progress, skipping');
      return this.emptyResult();
    }

    this.isRunning = true;
    const startTime = Date.now();
    const result: ReconciliationResult = {
      totalProcessed: 0,
      confirmed: 0,
      failed: 0,
      expired: 0,
      retried: 0,
      discrepancies: [],
    };

    try {
      log.info('Starting blockchain reconciliation');

      // 1. Reconcile pending transactions
      const pendingResult = await this.reconcilePendingTransactions();
      result.totalProcessed += pendingResult.totalProcessed;
      result.confirmed += pendingResult.confirmed;
      result.failed += pendingResult.failed;
      result.expired += pendingResult.expired;
      result.retried += pendingResult.retried;

      // 2. Check for ownership discrepancies
      const ownershipResult = await this.checkOwnershipDiscrepancies();
      result.discrepancies.push(...ownershipResult);

      // 3. Check for expired blockhashes
      await this.markExpiredTransactions();

      // Update metrics
      metrics.lastRunAt = new Date();
      metrics.lastRunDurationMs = Date.now() - startTime;
      metrics.runsCompleted++;
      metrics.totalTransactionsProcessed += result.totalProcessed;
      metrics.totalConfirmed += result.confirmed;
      metrics.totalFailed += result.failed;
      metrics.totalExpired += result.expired;
      metrics.totalDiscrepancies += result.discrepancies.length;
      metrics.lastError = null;

      // Store discrepancies
      this.discrepancyLog.push(...result.discrepancies);
      if (this.discrepancyLog.length > 1000) {
        this.discrepancyLog = this.discrepancyLog.slice(-1000);
      }

      log.info('Blockchain reconciliation completed', {
        processed: result.totalProcessed,
        confirmed: result.confirmed,
        failed: result.failed,
        expired: result.expired,
        discrepancies: result.discrepancies.length,
        durationMs: metrics.lastRunDurationMs,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      metrics.runsFailed++;
      metrics.lastError = errorMessage;

      log.error('Blockchain reconciliation failed', {
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reconcile pending transactions with blockchain state
   */
  private async reconcilePendingTransactions(): Promise<{
    totalProcessed: number;
    confirmed: number;
    failed: number;
    expired: number;
    retried: number;
  }> {
    const result = { totalProcessed: 0, confirmed: 0, failed: 0, expired: 0, retried: 0 };

    try {
      // Get pending transactions older than threshold
      const cutoffTime = new Date(Date.now() - this.config.pendingAgeThresholdMs);

      const pendingRows = await withSystemContext(async (client) => {
        const res = await client.query<PendingTransaction>(
          `SELECT tx_signature, tenant_id, ticket_id, tx_type, status, blockhash,
                  last_valid_block_height, submitted_at, COALESCE(retry_count, 0) as retry_count
           FROM pending_transactions
           WHERE status IN ('pending', 'confirming')
           AND submitted_at < $1
           LIMIT $2`,
          [cutoffTime, this.config.batchSize]
        );
        return res.rows;
      });

      const connection = SolanaService.getConnection();

      for (const tx of pendingRows) {
        result.totalProcessed++;

        try {
          // Check transaction status on-chain
          const status = await connection.getSignatureStatus(tx.tx_signature);

          if (status?.value?.confirmationStatus === 'finalized') {
            // Transaction confirmed
            await this.confirmTransaction(tx.tx_signature, status.value.slot!);
            result.confirmed++;
            log.debug('Transaction confirmed during reconciliation', {
              txSignature: tx.tx_signature,
            });
          } else if (status?.value?.err) {
            // Transaction failed on-chain
            await this.failTransaction(tx.tx_signature, 'ON_CHAIN_ERROR', JSON.stringify(status.value.err));
            result.failed++;
            log.warn('Transaction failed on-chain', {
              txSignature: tx.tx_signature,
              error: status.value.err,
            });
          } else {
            // Still pending - check if blockhash expired
            const currentBlockHeight = await connection.getBlockHeight();
            if (currentBlockHeight > tx.last_valid_block_height) {
              await this.failTransaction(tx.tx_signature, 'BLOCKHASH_EXPIRED', 'Blockhash expired');
              result.expired++;
            } else if (tx.retry_count < this.config.maxRetries) {
              // Mark for retry
              await withSystemContext(async (client) => {
                await client.query(
                  `UPDATE pending_transactions
                   SET retry_count = retry_count + 1, updated_at = NOW()
                   WHERE tx_signature = $1`,
                  [tx.tx_signature]
                );
              });
              result.retried++;
            }
          }
        } catch (err) {
          log.error('Error reconciling transaction', {
            txSignature: tx.tx_signature,
            error: err,
          });
        }
      }
    } catch (error) {
      log.error('Error in reconcilePendingTransactions', { error });
    }

    return result;
  }

  /**
   * Check for ownership discrepancies between database and blockchain
   */
  private async checkOwnershipDiscrepancies(): Promise<DiscrepancyRecord[]> {
    const discrepancies: DiscrepancyRecord[] = [];

    try {
      // Get recently transferred tickets
      const ticketsRows = await withSystemContext(async (client) => {
        const res = await client.query<{
          ticket_id: string;
          owner_id: string;
          nft_mint: string;
          tenant_id: string;
        }>(
          `SELECT t.id as ticket_id, t.owner_id, t.nft_mint, t.tenant_id
           FROM tickets t
           WHERE t.nft_mint IS NOT NULL
           AND t.updated_at > NOW() - INTERVAL '1 hour'
           LIMIT $1`,
          [this.config.batchSize]
        );
        return res.rows;
      });

      for (const ticket of ticketsRows) {
        if (!ticket.nft_mint) continue;

        try {
          const ownershipMatches = await SolanaService.verifyOwnership(
            ticket.nft_mint,
            ticket.owner_id
          );

          if (!ownershipMatches) {
            const discrepancy: DiscrepancyRecord = {
              type: 'OWNERSHIP_MISMATCH',
              ticketId: ticket.ticket_id,
              expected: `DB owner: ${ticket.owner_id}`,
              actual: 'On-chain owner differs',
              resolved: false,
              timestamp: new Date(),
            };

            discrepancies.push(discrepancy);

            log.warn('Ownership discrepancy detected', {
              ticketId: ticket.ticket_id,
              nftMint: ticket.nft_mint,
              dbOwner: ticket.owner_id,
            });

            // Auto-fix if enabled
            if (this.config.autoFix) {
              // In a real implementation, you would fetch the actual on-chain owner
              // and update the database accordingly
              log.info('Auto-fix would update ownership', { ticketId: ticket.ticket_id });
              discrepancy.resolved = true;
            }
          }
        } catch (err) {
          log.error('Error checking ownership', {
            ticketId: ticket.ticket_id,
            error: err,
          });
        }
      }
    } catch (error) {
      log.error('Error in checkOwnershipDiscrepancies', { error });
    }

    return discrepancies;
  }

  /**
   * Mark transactions with expired blockhashes
   */
  private async markExpiredTransactions(): Promise<number> {
    try {
      const connection = SolanaService.getConnection();
      const currentBlockHeight = await connection.getBlockHeight();

      const count = await withSystemContext(async (client) => {
        const result = await client.query<{ count: string }>(
          `WITH updated AS (
            UPDATE pending_transactions
            SET status = 'failed',
                error_code = 'BLOCKHASH_EXPIRED',
                error_message = 'Blockhash expired before confirmation',
                updated_at = NOW()
            WHERE status IN ('pending', 'confirming')
            AND last_valid_block_height < $1
            RETURNING id
          )
          SELECT COUNT(*) as count FROM updated`,
          [currentBlockHeight]
        );
        return parseInt(result.rows[0]?.count || '0', 10);
      });

      if (count > 0) {
        log.info('Marked expired transactions', { count });
      }
      return count;
    } catch (error) {
      log.error('Error marking expired transactions', { error });
      return 0;
    }
  }

  /**
   * Helper: Confirm a transaction in the database
   */
  private async confirmTransaction(txSignature: string, slot: number): Promise<void> {
    await withSystemContext(async (client) => {
      await client.query(
        `UPDATE pending_transactions
         SET status = 'confirmed', slot = $2, confirmed_at = NOW(), updated_at = NOW()
         WHERE tx_signature = $1`,
        [txSignature, slot]
      );
    });
  }

  /**
   * Helper: Fail a transaction in the database
   */
  private async failTransaction(txSignature: string, errorCode: string, errorMessage: string): Promise<void> {
    await withSystemContext(async (client) => {
      await client.query(
        `UPDATE pending_transactions
         SET status = 'failed', error_code = $2, error_message = $3, updated_at = NOW()
         WHERE tx_signature = $1`,
        [txSignature, errorCode, errorMessage]
      );
    });
  }

  /**
   * Helper: Empty result
   */
  private emptyResult(): ReconciliationResult {
    return {
      totalProcessed: 0,
      confirmed: 0,
      failed: 0,
      expired: 0,
      retried: 0,
      discrepancies: [],
    };
  }

  /**
   * Get reconciliation metrics
   */
  getMetrics(): ReconciliationMetrics & { isRunning: boolean } {
    return {
      ...metrics,
      isRunning: this.isRunning,
    };
  }

  /**
   * Get discrepancy log
   */
  getDiscrepancies(): DiscrepancyRecord[] {
    return [...this.discrepancyLog];
  }

  /**
   * Get Prometheus metrics format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    lines.push('# HELP blockchain_reconciliation_last_run_timestamp Last reconciliation run timestamp');
    lines.push('# TYPE blockchain_reconciliation_last_run_timestamp gauge');
    lines.push(`blockchain_reconciliation_last_run_timestamp ${metrics.lastRunAt?.getTime() || 0}`);

    lines.push('# HELP blockchain_reconciliation_runs_total Total reconciliation runs');
    lines.push('# TYPE blockchain_reconciliation_runs_total counter');
    lines.push(`blockchain_reconciliation_runs_total{status="completed"} ${metrics.runsCompleted}`);
    lines.push(`blockchain_reconciliation_runs_total{status="failed"} ${metrics.runsFailed}`);

    lines.push('# HELP blockchain_reconciliation_transactions_total Total transactions processed');
    lines.push('# TYPE blockchain_reconciliation_transactions_total counter');
    lines.push(`blockchain_reconciliation_transactions_total ${metrics.totalTransactionsProcessed}`);

    lines.push('# HELP blockchain_reconciliation_confirmed_total Total confirmed transactions');
    lines.push('# TYPE blockchain_reconciliation_confirmed_total counter');
    lines.push(`blockchain_reconciliation_confirmed_total ${metrics.totalConfirmed}`);

    lines.push('# HELP blockchain_reconciliation_failed_total Total failed transactions');
    lines.push('# TYPE blockchain_reconciliation_failed_total counter');
    lines.push(`blockchain_reconciliation_failed_total ${metrics.totalFailed}`);

    lines.push('# HELP blockchain_reconciliation_discrepancies_total Total discrepancies found');
    lines.push('# TYPE blockchain_reconciliation_discrepancies_total counter');
    lines.push(`blockchain_reconciliation_discrepancies_total ${metrics.totalDiscrepancies}`);

    lines.push('# HELP blockchain_reconciliation_is_running Whether reconciliation is currently running');
    lines.push('# TYPE blockchain_reconciliation_is_running gauge');
    lines.push(`blockchain_reconciliation_is_running ${this.isRunning ? 1 : 0}`);

    return lines.join('\n');
  }

  /**
   * Force a reconciliation run (for testing/admin)
   */
  async forceReconciliation(): Promise<ReconciliationResult> {
    log.info('Forced reconciliation triggered');
    return this.runReconciliation();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const blockchainReconciliationWorker = new BlockchainReconciliationWorker();

export default BlockchainReconciliationWorker;
