/**
 * Transaction Timeout Service
 * Auto-cancels stale/abandoned transactions
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'TransactionTimeoutService' });

export interface TimeoutConfig {
  pendingTimeoutMinutes: number;
  processingTimeoutMinutes: number;
  checkIntervalMinutes: number;
}

export interface TimeoutResult {
  timedOutCount: number;
  releasedInventoryCount: number;
  errors: string[];
}

export interface TimedOutTransaction {
  id: string;
  tenant_id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: Date;
  has_reserved_inventory: boolean;
}

export class TransactionTimeoutService {
  private pool: Pool;
  private config: TimeoutConfig;
  private intervalId?: NodeJS.Timeout;

  constructor(pool: Pool, config?: Partial<TimeoutConfig>) {
    this.pool = pool;
    this.config = {
      pendingTimeoutMinutes: 15,
      processingTimeoutMinutes: 5,
      checkIntervalMinutes: 1,
      ...config,
    };
  }

  /**
   * Start automatic timeout checking
   */
  start(): void {
    if (this.intervalId) {
      log.warn('Timeout service already running');
      return;
    }

    log.info({
      pendingTimeout: this.config.pendingTimeoutMinutes,
      processingTimeout: this.config.processingTimeoutMinutes,
      checkInterval: this.config.checkIntervalMinutes,
    }, 'Starting transaction timeout service');

    this.checkTimeouts().catch((error) => {
      log.error({ error }, 'Initial timeout check failed');
    });

    this.intervalId = setInterval(() => {
      this.checkTimeouts().catch((error) => {
        log.error({ error }, 'Scheduled timeout check failed');
      });
    }, this.config.checkIntervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic timeout checking
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      log.info('Stopped transaction timeout service');
    }
  }

  /**
   * Get current config
   */
  getConfig(): TimeoutConfig {
    return { ...this.config };
  }

  /**
   * Check for and handle timed out transactions
   */
  async checkTimeouts(): Promise<TimeoutResult> {
    const result: TimeoutResult = {
      timedOutCount: 0,
      releasedInventoryCount: 0,
      errors: [],
    };

    try {
      const pendingTimeouts = await this.findTimedOutTransactions('pending');
      const processingTimeouts = await this.findTimedOutTransactions('processing');
      const allTimeouts = [...pendingTimeouts, ...processingTimeouts];

      if (allTimeouts.length === 0) {
        log.debug('No timed out transactions found');
        return result;
      }

      log.info({
        count: allTimeouts.length,
        pending: pendingTimeouts.length,
        processing: processingTimeouts.length,
      }, 'Found timed out transactions');

      for (const transaction of allTimeouts) {
        try {
          const released = await this.handleTimeout(transaction);
          result.timedOutCount++;
          if (released) {
            result.releasedInventoryCount++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Transaction ${transaction.id}: ${errorMsg}`);
          log.error({ transactionId: transaction.id, error: errorMsg }, 'Failed to handle timeout');
        }
      }

      log.info({
        timedOutCount: result.timedOutCount,
        releasedInventory: result.releasedInventoryCount,
        errorCount: result.errors.length,
      }, 'Timeout check completed');

    } catch (error) {
      log.error({ error }, 'Timeout check failed');
      result.errors.push('Timeout check process failed');
    }

    return result;
  }

  /**
   * Find transactions that have timed out
   */
  async findTimedOutTransactions(status: 'pending' | 'processing'): Promise<TimedOutTransaction[]> {
    const timeoutMinutes = status === 'pending'
      ? this.config.pendingTimeoutMinutes
      : this.config.processingTimeoutMinutes;

    const result = await this.pool.query(`
      SELECT
        pt.id,
        pt.tenant_id,
        pt.user_id,
        pt.amount,
        pt.status,
        pt.created_at,
        CASE WHEN ir.id IS NOT NULL THEN true ELSE false END as has_reserved_inventory
      FROM payment_transactions pt
      LEFT JOIN inventory_reservations ir 
        ON pt.id = ir.transaction_id AND ir.status = 'held'
      WHERE pt.status = $1
        AND pt.created_at < NOW() - INTERVAL '1 minute' * $2
      ORDER BY pt.created_at ASC
      LIMIT 100
    `, [status, timeoutMinutes]);

    return result.rows;
  }

  /**
   * Handle a single timed out transaction
   * Note: Uses 'failed' status with metadata since schema doesn't support 'timeout'
   */
  async handleTimeout(transaction: TimedOutTransaction): Promise<boolean> {
    const client = await this.pool.connect();
    let releasedInventory = false;

    try {
      await client.query('BEGIN');

      // Update transaction status to failed (with timeout reason in metadata)
      await client.query(`
        UPDATE payment_transactions
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `, [
        JSON.stringify({ 
          failure_reason: 'timeout',
          timeout_at: new Date().toISOString(),
          previous_status: transaction.status
        }),
        transaction.id, 
        transaction.tenant_id
      ]);

      // Release inventory if reserved
      if (transaction.has_reserved_inventory) {
        const releaseResult = await client.query(`
          UPDATE inventory_reservations
          SET status = 'released',
              updated_at = NOW()
          WHERE transaction_id = $1 AND tenant_id = $2 AND status = 'held'
        `, [transaction.id, transaction.tenant_id]);

        releasedInventory = (releaseResult.rowCount || 0) > 0;
      }

      await client.query('COMMIT');

      log.info({
        transactionId: transaction.id,
        previousStatus: transaction.status,
        releasedInventory,
      }, 'Transaction timeout handled');

      return releasedInventory;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Manually timeout a specific transaction
   */
  async timeoutTransaction(
    transactionId: string,
    tenantId: string,
    reason?: string
  ): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT
        pt.id,
        pt.tenant_id,
        pt.user_id,
        pt.amount,
        pt.status,
        pt.created_at,
        CASE WHEN ir.id IS NOT NULL THEN true ELSE false END as has_reserved_inventory
      FROM payment_transactions pt
      LEFT JOIN inventory_reservations ir 
        ON pt.id = ir.transaction_id AND ir.status = 'held'
      WHERE pt.id = $1 AND pt.tenant_id = $2
    `, [transactionId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const transaction = result.rows[0];

    if (!['pending', 'processing'].includes(transaction.status)) {
      throw new Error(`Cannot timeout transaction in status: ${transaction.status}`);
    }

    await this.handleTimeout(transaction);

    log.info({ transactionId, reason }, 'Transaction manually timed out');

    return true;
  }

  /**
   * Get timeout statistics (looks for failed transactions with timeout reason)
   */
  async getTimeoutStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalTimeouts: number;
    totalAmount: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_timeouts,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions
      WHERE tenant_id = $1
        AND status = 'failed'
        AND metadata->>'failure_reason' = 'timeout'
        AND updated_at BETWEEN $2 AND $3
    `, [tenantId, startDate, endDate]);

    return {
      totalTimeouts: parseInt(result.rows[0].total_timeouts) || 0,
      totalAmount: parseFloat(result.rows[0].total_amount) || 0,
    };
  }

  /**
   * Get pending transaction count (for monitoring)
   */
  async getPendingCount(tenantId: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM payment_transactions
      WHERE tenant_id = $1 AND status IN ('pending', 'processing')
    `, [tenantId]);

    return parseInt(result.rows[0].count) || 0;
  }
}
