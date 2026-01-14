/**
 * Transaction Timeout Service
 * Auto-cancels stale/abandoned transactions
 */

import { Pool } from 'pg';
import { SafeLogger } from '../utils/pci-log-scrubber.util';
import { metricsService } from './metrics.service';

const logger = new SafeLogger('TransactionTimeoutService');

export interface TimeoutConfig {
  pendingTimeoutMinutes: number;    // 15 minutes for pending payments
  processingTimeoutMinutes: number; // 5 minutes for processing payments
  checkIntervalMinutes: number;     // How often to check (default: 1 minute)
}

export interface TimeoutResult {
  timedOutCount: number;
  releasedInventoryCount: number;
  notifiedUserCount: number;
  errors: string[];
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
      logger.warn('Timeout service already running');
      return;
    }

    logger.info({
      pendingTimeout: this.config.pendingTimeoutMinutes,
      processingTimeout: this.config.processingTimeoutMinutes,
      checkInterval: this.config.checkIntervalMinutes,
    }, 'Starting transaction timeout service');

    // Run immediately
    this.checkTimeouts().catch((error) => {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Initial timeout check failed');
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkTimeouts().catch((error) => {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Scheduled timeout check failed');
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
      logger.info('Stopped transaction timeout service');
    }
  }

  /**
   * Check for and handle timed out transactions
   */
  async checkTimeouts(): Promise<TimeoutResult> {
    const startTime = Date.now();
    const result: TimeoutResult = {
      timedOutCount: 0,
      releasedInventoryCount: 0,
      notifiedUserCount: 0,
      errors: [],
    };

    try {
      // Find timed out pending transactions
      const pendingTimeouts = await this.findTimedOutTransactions('pending');

      // Find timed out processing transactions
      const processingTimeouts = await this.findTimedOutTransactions('processing');

      const allTimeouts = [...pendingTimeouts, ...processingTimeouts];

      if (allTimeouts.length === 0) {
        logger.debug('No timed out transactions found');
        return result;
      }

      logger.info({
        count: allTimeouts.length,
        pending: pendingTimeouts.length,
        processing: processingTimeouts.length,
      }, 'Found timed out transactions');

      // Process each timeout
      for (const transaction of allTimeouts) {
        try {
          await this.handleTimeout(transaction);
          result.timedOutCount++;

          if (transaction.has_reserved_inventory) {
            result.releasedInventoryCount++;
          }

          result.notifiedUserCount++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Transaction ${transaction.transaction_id}: ${errorMsg}`);

          logger.error({
            transactionId: transaction.transaction_id,
            error: errorMsg,
          }, 'Failed to handle timeout');
        }
      }

      const duration = (Date.now() - startTime) / 1000;

      logger.info({
        timedOutCount: result.timedOutCount,
        releasedInventory: result.releasedInventoryCount,
        errorCount: result.errors.length,
        durationSeconds: duration,
      }, 'Timeout check completed');

      // Record metrics
      metricsService.paymentTotal.inc({
        status: 'timeout',
        payment_method: 'timeout_cleanup',
      }, result.timedOutCount);

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Timeout check failed');
      result.errors.push('Timeout check process failed');
    }

    return result;
  }

  /**
   * Find transactions that have timed out
   */
  private async findTimedOutTransactions(status: 'pending' | 'processing'): Promise<any[]> {
    const timeoutMinutes = status === 'pending'
      ? this.config.pendingTimeoutMinutes
      : this.config.processingTimeoutMinutes;

    const query = `
      SELECT
        pt.transaction_id,
        pt.tenant_id,
        pt.user_id,
        pt.amount_cents,
        pt.status,
        pt.created_at,
        pt.payment_method,
        COALESCE(inv.reserved, false) as has_reserved_inventory,
        u.email as user_email
      FROM payment_transactions pt
      LEFT JOIN inventory_reservations inv ON pt.transaction_id = inv.transaction_id
      LEFT JOIN users u ON pt.user_id = u.user_id
      WHERE pt.status = $1
        AND pt.created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
        AND pt.timeout_handled = false
      ORDER BY pt.created_at ASC
      LIMIT 100
    `;

    const result = await this.pool.query(query, [status]);
    return result.rows;
  }

  /**
   * Handle a single timed out transaction
   */
  private async handleTimeout(transaction: any): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update transaction status
      await client.query(
        `UPDATE payment_transactions
         SET status = 'timeout',
             timeout_handled = true,
             updated_at = NOW(),
             timeout_at = NOW(),
             timeout_reason = $1
         WHERE transaction_id = $2`,
        [
          `Transaction timed out after ${this.getTimeoutDuration(transaction)} minutes`,
          transaction.transaction_id,
        ]
      );

      // Release inventory if reserved
      if (transaction.has_reserved_inventory) {
        await client.query(
          `UPDATE inventory_reservations
           SET status = 'released',
               released_at = NOW(),
               release_reason = 'transaction_timeout'
           WHERE transaction_id = $1
             AND status = 'reserved'`,
          [transaction.transaction_id]
        );

        // Update ticket availability
        await client.query(
          `UPDATE tickets
           SET status = 'available',
               reserved_until = NULL,
               updated_at = NOW()
           WHERE transaction_id = $1
             AND status = 'reserved'`,
          [transaction.transaction_id]
        );
      }

      // Create notification record
      await client.query(
        `INSERT INTO payment_notifications (
           tenant_id,
           user_id,
           transaction_id,
           notification_type,
           notification_status,
           scheduled_for
         ) VALUES ($1, $2, $3, 'transaction_timeout', 'pending', NOW())`,
        [transaction.tenant_id, transaction.user_id, transaction.transaction_id]
      );

      await client.query('COMMIT');

      logger.info({
        transactionId: transaction.transaction_id,
        status: transaction.status,
        ageMinutes: this.getTimeoutDuration(transaction),
      }, 'Transaction timeout handled');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate how long transaction has been in current status
   */
  private getTimeoutDuration(transaction: any): number {
    const createdAt = new Date(transaction.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
  }

  /**
   * Manually timeout a specific transaction
   */
  async timeoutTransaction(transactionId: string, reason: string): Promise<boolean> {
    const query = `
      SELECT
        pt.*,
        COALESCE(inv.reserved, false) as has_reserved_inventory
      FROM payment_transactions pt
      LEFT JOIN inventory_reservations inv ON pt.transaction_id = inv.transaction_id
      WHERE pt.transaction_id = $1
    `;

    const result = await this.pool.query(query, [transactionId]);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const transaction = result.rows[0];

    if (!['pending', 'processing'].includes(transaction.status)) {
      throw new Error(`Cannot timeout transaction in status: ${transaction.status}`);
    }

    await this.handleTimeout({
      ...transaction,
      timeout_reason: reason,
    });

    logger.info({
      transactionId,
      reason,
    }, 'Transaction manually timed out');

    return true;
  }

  /**
   * Get timeout statistics
   */
  async getTimeoutStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const query = `
      SELECT
        COUNT(*) as total_timeouts,
        SUM(amount_cents) as total_amount_cents,
        AVG(EXTRACT(EPOCH FROM (timeout_at - created_at))/60) as avg_duration_minutes,
        COUNT(CASE WHEN status = 'timeout' AND previous_status = 'pending' THEN 1 END) as pending_timeouts,
        COUNT(CASE WHEN status = 'timeout' AND previous_status = 'processing' THEN 1 END) as processing_timeouts,
        payment_method,
        COUNT(*) as count
      FROM payment_transactions
      WHERE tenant_id = $1
        AND status = 'timeout'
        AND timeout_at BETWEEN $2 AND $3
      GROUP BY payment_method
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    return result.rows;
  }
}
