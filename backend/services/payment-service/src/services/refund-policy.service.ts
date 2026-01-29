/**
 * Refund Policy Enforcement Service
 *
 * Handles refund eligibility checks and policy enforcement.
 * Works with payment_transactions and payment_refunds tables.
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RefundPolicyService' });

export interface RefundWindow {
  transactionDate: Date;
  eventDate?: Date;
  refundDeadline: Date;
  isEligible: boolean;
  reason?: string;
  hoursRemaining?: number;
}

export interface RefundStatistics {
  totalRefunds: number;
  totalRefundedCents: number;
  avgRefundCents: number;
  completedRefunds: number;
  pendingRefunds: number;
  failedRefunds: number;
}

export interface RefundPolicy {
  defaultWindowHours: number;
  minimumWindowHours: number;
  maxRefundPercent: number;
}

export interface RefundRequest {
  transactionId: string;
  tenantId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface RefundResult {
  success: boolean;
  message: string;
  refundId?: string;
  amount?: number;
}

export class RefundPolicyService {
  private pool: Pool;
  private defaultPolicy: RefundPolicy = {
    defaultWindowHours: 48,
    minimumWindowHours: 2,
    maxRefundPercent: 100,
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if a transaction is eligible for refund
   */
  async checkRefundEligibility(
    transactionId: string,
    tenantId: string
  ): Promise<RefundWindow> {
    const query = `
      SELECT
        pt.id,
        pt.amount,
        pt.status,
        pt.created_at,
        pt.event_id,
        e.start_date as event_date
      FROM payment_transactions pt
      LEFT JOIN events e ON pt.event_id = e.id
      WHERE pt.id = $1
        AND pt.tenant_id = $2
        AND pt.status NOT IN ('refunded', 'failed')
    `;

    const result = await this.pool.query(query, [transactionId, tenantId]);

    if (result.rows.length === 0) {
      return {
        transactionDate: new Date(),
        refundDeadline: new Date(),
        isEligible: false,
        reason: 'Transaction not found, already refunded, or failed',
      };
    }

    const transaction = result.rows[0];
    const transactionDate = new Date(transaction.created_at);
    const eventDate = transaction.event_date ? new Date(transaction.event_date) : undefined;

    // Check existing refunds for this transaction
    const existingRefundsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_refunded
      FROM payment_refunds
      WHERE transaction_id = $1 AND tenant_id = $2 AND status != 'failed'
    `;
    const refundsResult = await this.pool.query(existingRefundsQuery, [transactionId, tenantId]);
    const totalRefunded = parseFloat(refundsResult.rows[0].total_refunded) || 0;
    const originalAmount = parseFloat(transaction.amount);

    if (totalRefunded >= originalAmount) {
      return {
        transactionDate,
        eventDate,
        refundDeadline: new Date(),
        isEligible: false,
        reason: 'Transaction has already been fully refunded',
      };
    }

    // Calculate refund deadline based on event date or transaction date
    const referenceDate = eventDate || new Date(transactionDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days if no event
    const refundDeadline = new Date(
      referenceDate.getTime() - (this.defaultPolicy.defaultWindowHours * 60 * 60 * 1000)
    );

    const now = new Date();
    const isEligible = now <= refundDeadline;
    const hoursRemaining = Math.max(0, (refundDeadline.getTime() - now.getTime()) / (1000 * 60 * 60));

    let reason: string | undefined;
    if (!isEligible) {
      const minimumDeadline = new Date(
        referenceDate.getTime() - (this.defaultPolicy.minimumWindowHours * 60 * 60 * 1000)
      );
      if (now > minimumDeadline) {
        reason = `Event is within ${this.defaultPolicy.minimumWindowHours} hours, refunds not allowed`;
      } else {
        reason = `Refund window closed (deadline was ${refundDeadline.toISOString()})`;
      }
    }

    log.info({
      transactionId,
      isEligible,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      totalRefunded,
      originalAmount,
    }, 'Refund eligibility checked');

    return {
      transactionDate,
      eventDate,
      refundDeadline,
      isEligible,
      reason,
      hoursRemaining: isEligible ? hoursRemaining : undefined,
    };
  }

  /**
   * Process a refund request
   */
  async processRefundRequest(request: RefundRequest): Promise<RefundResult> {
    const eligibility = await this.checkRefundEligibility(request.transactionId, request.tenantId);

    if (!eligibility.isEligible) {
      log.warn({
        transactionId: request.transactionId,
        reason: eligibility.reason,
      }, 'Refund request denied');

      return {
        success: false,
        message: eligibility.reason || 'Refund not eligible',
      };
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get transaction details
      const txnQuery = `
        SELECT id, amount, status
        FROM payment_transactions
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `;
      const txnResult = await client.query(txnQuery, [request.transactionId, request.tenantId]);

      if (txnResult.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const transaction = txnResult.rows[0];
      const maxRefundable = parseFloat(transaction.amount);

      // Validate refund amount
      if (request.amount <= 0) {
        throw new Error('Refund amount must be positive');
      }

      if (request.amount > maxRefundable) {
        throw new Error(`Refund amount (${request.amount}) exceeds transaction amount (${maxRefundable})`);
      }

      // Check for existing refunds
      const existingQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_refunded
        FROM payment_refunds
        WHERE transaction_id = $1 AND tenant_id = $2 AND status != 'failed'
      `;
      const existingResult = await client.query(existingQuery, [request.transactionId, request.tenantId]);
      const totalRefunded = parseFloat(existingResult.rows[0].total_refunded) || 0;

      if (totalRefunded + request.amount > maxRefundable) {
        throw new Error(`Total refunds would exceed transaction amount`);
      }

      // Create refund record
      const refundQuery = `
        INSERT INTO payment_refunds (
          tenant_id,
          transaction_id,
          amount,
          reason,
          status,
          metadata,
          idempotency_key
        ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
        RETURNING id, amount
      `;

      const refundResult = await client.query(refundQuery, [
        request.tenantId,
        request.transactionId,
        request.amount,
        request.reason,
        JSON.stringify(request.metadata || {}),
        request.idempotencyKey || null,
      ]);

      const refundId = refundResult.rows[0].id;

      // Update transaction status if fully refunded
      const newTotalRefunded = totalRefunded + request.amount;
      if (newTotalRefunded >= maxRefundable) {
        await client.query(
          `UPDATE payment_transactions SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [request.transactionId]
        );
      } else if (newTotalRefunded > 0) {
        await client.query(
          `UPDATE payment_transactions SET status = 'partially_refunded', updated_at = NOW() WHERE id = $1`,
          [request.transactionId]
        );
      }

      await client.query('COMMIT');

      log.info({
        refundId,
        transactionId: request.transactionId,
        amount: request.amount,
      }, 'Refund request created');

      return {
        success: true,
        message: 'Refund request submitted successfully',
        refundId,
        amount: request.amount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error({
        transactionId: request.transactionId,
        error: message,
      }, 'Refund request failed');

      return {
        success: false,
        message: `Failed to process refund: ${message}`,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Complete a refund (called after Stripe confirms)
   */
  async completeRefund(
    refundId: string,
    tenantId: string,
    stripeRefundId: string
  ): Promise<RefundResult> {
    const query = `
      UPDATE payment_refunds
      SET status = 'completed',
          stripe_refund_id = $3,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, amount
    `;

    const result = await this.pool.query(query, [refundId, tenantId, stripeRefundId]);

    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Refund not found',
      };
    }

    log.info({ refundId, stripeRefundId }, 'Refund completed');

    return {
      success: true,
      message: 'Refund completed',
      refundId,
      amount: parseFloat(result.rows[0].amount),
    };
  }

  /**
   * Mark a refund as failed
   */
  async failRefund(
    refundId: string,
    tenantId: string,
    reason: string
  ): Promise<RefundResult> {
    const query = `
      UPDATE payment_refunds
      SET status = 'failed',
          metadata = jsonb_set(COALESCE(metadata, '{}'), '{failure_reason}', $3::jsonb),
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
    `;

    const result = await this.pool.query(query, [refundId, tenantId, JSON.stringify(reason)]);

    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Refund not found',
      };
    }

    log.warn({ refundId, reason }, 'Refund failed');

    return {
      success: true,
      message: 'Refund marked as failed',
      refundId,
    };
  }

  /**
   * Get refund statistics for a tenant
   */
  async getRefundStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RefundStatistics> {
    const query = `
      SELECT
        COUNT(*)::int as total_refunds,
        COALESCE(SUM(amount), 0)::int as total_refunded_cents,
        COALESCE(AVG(amount), 0)::int as avg_refund_cents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed_refunds,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::int as pending_refunds,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed_refunds
      FROM payment_refunds
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    return {
      totalRefunds: row.total_refunds,
      totalRefundedCents: row.total_refunded_cents,
      avgRefundCents: row.avg_refund_cents,
      completedRefunds: row.completed_refunds,
      pendingRefunds: row.pending_refunds,
      failedRefunds: row.failed_refunds,
    };
  }

  /**
   * Get refund policy
   */
  getPolicy(): RefundPolicy {
    return { ...this.defaultPolicy };
  }

  /**
   * Update refund policy
   */
  updatePolicy(policy: Partial<RefundPolicy>): void {
    if (policy.defaultWindowHours !== undefined) {
      this.defaultPolicy.defaultWindowHours = policy.defaultWindowHours;
    }
    if (policy.minimumWindowHours !== undefined) {
      this.defaultPolicy.minimumWindowHours = policy.minimumWindowHours;
    }
    if (policy.maxRefundPercent !== undefined) {
      this.defaultPolicy.maxRefundPercent = policy.maxRefundPercent;
    }

    log.info({ policy: this.defaultPolicy }, 'Refund policy updated');
  }
}
