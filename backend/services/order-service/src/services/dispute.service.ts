import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { publishEvent } from '../config/rabbitmq';

/**
 * CRITICAL: Dispute/Chargeback handling service
 * Handles dispute.created, dispute.updated, dispute.closed webhooks
 * 
 * Key responsibilities:
 * - Link disputes to orders
 * - Lock refunds during active disputes
 * - Track dispute status and outcomes
 * - Alert team on new disputes
 */

export interface DisputeData {
  disputeId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  evidenceDueBy?: Date;
  metadata?: Record<string, any>;
}

export interface DisputeOutcome {
  status: 'won' | 'lost' | 'withdrawn' | 'needs_response';
  networkReasonCode?: string;
}

export class DisputeService {
  private db = getDatabase();

  /**
   * CRITICAL: Handle dispute.created webhook
   * Links dispute to order and locks refunds
   */
  async handleDisputeCreated(dispute: DisputeData): Promise<void> {
    logger.warn('DISPUTE CREATED - Immediate action required', {
      disputeId: dispute.disputeId,
      paymentIntentId: dispute.paymentIntentId,
      amount: dispute.amount,
      reason: dispute.reason,
    });

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Find the order by payment intent
      const orderResult = await client.query(
        `SELECT id, user_id, tenant_id, status, total_amount_cents
         FROM orders 
         WHERE stripe_payment_intent_id = $1`,
        [dispute.paymentIntentId]
      );

      if (orderResult.rows.length === 0) {
        logger.error('Dispute created for unknown order', {
          disputeId: dispute.disputeId,
          paymentIntentId: dispute.paymentIntentId,
        });
        await client.query('ROLLBACK');
        return;
      }

      const order = orderResult.rows[0];

      // Link dispute to order and lock refunds
      await client.query(
        `UPDATE orders SET
          has_dispute = true,
          dispute_id = $1,
          dispute_status = $2,
          dispute_reason = $3,
          dispute_amount_cents = $4,
          refund_locked = true,
          dispute_created_at = NOW(),
          updated_at = NOW()
         WHERE id = $5`,
        [
          dispute.disputeId,
          dispute.status,
          dispute.reason,
          dispute.amount,
          order.id,
        ]
      );

      // Record dispute event
      await client.query(
        `INSERT INTO order_events (order_id, event_type, event_data, created_at)
         VALUES ($1, 'DISPUTE_CREATED', $2, NOW())`,
        [order.id, JSON.stringify(dispute)]
      );

      // Create dispute record for tracking
      await client.query(
        `INSERT INTO order_disputes (
          order_id, dispute_id, payment_intent_id, amount_cents,
          currency, reason, status, evidence_due_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (dispute_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()`,
        [
          order.id,
          dispute.disputeId,
          dispute.paymentIntentId,
          dispute.amount,
          dispute.currency,
          dispute.reason,
          dispute.status,
          dispute.evidenceDueBy || null,
        ]
      );

      await client.query('COMMIT');

      // Publish alert event
      await this.alertDisputeCreated(order, dispute);

      // Publish event for other services
      await publishEvent('order.dispute.created', {
        orderId: order.id,
        disputeId: dispute.disputeId,
        userId: order.user_id,
        tenantId: order.tenant_id,
        amount: dispute.amount,
        reason: dispute.reason,
      });

      logger.info('Dispute linked to order, refunds locked', {
        orderId: order.id,
        disputeId: dispute.disputeId,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to handle dispute created', { error, dispute });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle dispute.updated webhook
   */
  async handleDisputeUpdated(dispute: DisputeData): Promise<void> {
    logger.info('Dispute updated', {
      disputeId: dispute.disputeId,
      status: dispute.status,
    });

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update order dispute status
      await client.query(
        `UPDATE orders SET
          dispute_status = $1,
          updated_at = NOW()
         WHERE dispute_id = $2`,
        [dispute.status, dispute.disputeId]
      );

      // Update dispute record
      await client.query(
        `UPDATE order_disputes SET
          status = $1,
          updated_at = NOW()
         WHERE dispute_id = $2`,
        [dispute.status, dispute.disputeId]
      );

      // Get order for event publishing
      const orderResult = await client.query(
        `SELECT id, user_id, tenant_id FROM orders WHERE dispute_id = $1`,
        [dispute.disputeId]
      );

      if (orderResult.rows.length > 0) {
        const order = orderResult.rows[0];

        // Record update event
        await client.query(
          `INSERT INTO order_events (order_id, event_type, event_data, created_at)
           VALUES ($1, 'DISPUTE_UPDATED', $2, NOW())`,
          [order.id, JSON.stringify(dispute)]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to handle dispute updated', { error, dispute });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * CRITICAL: Handle dispute.closed webhook
   * Unlocks refunds if won, handles lost dispute consequences
   */
  async handleDisputeClosed(dispute: DisputeData, outcome: DisputeOutcome): Promise<void> {
    logger.info('Dispute closed', {
      disputeId: dispute.disputeId,
      outcome: outcome.status,
    });

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get the order
      const orderResult = await client.query(
        `SELECT id, user_id, tenant_id, total_amount_cents
         FROM orders WHERE dispute_id = $1`,
        [dispute.disputeId]
      );

      if (orderResult.rows.length === 0) {
        logger.warn('Dispute closed for unknown order', { disputeId: dispute.disputeId });
        await client.query('ROLLBACK');
        return;
      }

      const order = orderResult.rows[0];
      const disputeWon = outcome.status === 'won' || outcome.status === 'withdrawn';

      // Update order
      await client.query(
        `UPDATE orders SET
          dispute_status = $1,
          dispute_outcome = $2,
          refund_locked = $3,
          dispute_closed_at = NOW(),
          updated_at = NOW()
         WHERE id = $4`,
        [
          outcome.status,
          outcome.status,
          !disputeWon, // Keep locked if lost
          order.id,
        ]
      );

      // Update dispute record
      await client.query(
        `UPDATE order_disputes SET
          status = 'closed',
          outcome = $1,
          closed_at = NOW(),
          updated_at = NOW()
         WHERE dispute_id = $2`,
        [outcome.status, dispute.disputeId]
      );

      // Record closure event
      await client.query(
        `INSERT INTO order_events (order_id, event_type, event_data, created_at)
         VALUES ($1, 'DISPUTE_CLOSED', $2, NOW())`,
        [order.id, JSON.stringify({ dispute, outcome })]
      );

      await client.query('COMMIT');

      // Handle lost dispute consequences
      if (outcome.status === 'lost') {
        await this.handleLostDispute(order.id, dispute);
      }

      // Publish event
      await publishEvent('order.dispute.closed', {
        orderId: order.id,
        disputeId: dispute.disputeId,
        userId: order.user_id,
        tenantId: order.tenant_id,
        outcome: outcome.status,
        won: disputeWon,
      });

      logger.info('Dispute closed and order updated', {
        orderId: order.id,
        disputeId: dispute.disputeId,
        outcome: outcome.status,
        refundsUnlocked: disputeWon,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to handle dispute closed', { error, dispute, outcome });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle lost dispute - may need to reverse transfers or take other action
   */
  private async handleLostDispute(orderId: string, dispute: DisputeData): Promise<void> {
    logger.warn('DISPUTE LOST - Manual review may be required', {
      orderId,
      disputeId: dispute.disputeId,
      amount: dispute.amount,
    });

    // Publish event for manual review and potential transfer reversal
    await publishEvent('order.dispute.lost', {
      orderId,
      disputeId: dispute.disputeId,
      amount: dispute.amount,
      reason: dispute.reason,
      requiresManualReview: true,
    });

    // Alert team
    await this.alertDisputeLost(orderId, dispute);
  }

  /**
   * Check if order has active dispute (blocks refunds)
   */
  async hasActiveDispute(orderId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT has_dispute, refund_locked, dispute_status
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) return false;

    const order = result.rows[0];
    return order.has_dispute && order.refund_locked;
  }

  /**
   * Get dispute info for order
   */
  async getDisputeInfo(orderId: string): Promise<any> {
    const result = await this.db.query(
      `SELECT d.*, o.status as order_status
       FROM order_disputes d
       JOIN orders o ON o.id = d.order_id
       WHERE d.order_id = $1
       ORDER BY d.created_at DESC
       LIMIT 1`,
      [orderId]
    );

    return result.rows[0] || null;
  }

  /**
   * Alert team about new dispute
   */
  private async alertDisputeCreated(order: any, dispute: DisputeData): Promise<void> {
    // Publish to alerting channel
    await publishEvent('alert.critical', {
      type: 'DISPUTE_CREATED',
      severity: 'critical',
      title: 'New Dispute Received',
      message: `Dispute ${dispute.disputeId} created for order ${order.id}. Amount: ${dispute.amount} ${dispute.currency}. Reason: ${dispute.reason}`,
      data: {
        orderId: order.id,
        disputeId: dispute.disputeId,
        amount: dispute.amount,
        currency: dispute.currency,
        reason: dispute.reason,
        evidenceDueBy: dispute.evidenceDueBy,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Alert team about lost dispute
   */
  private async alertDisputeLost(orderId: string, dispute: DisputeData): Promise<void> {
    await publishEvent('alert.critical', {
      type: 'DISPUTE_LOST',
      severity: 'high',
      title: 'Dispute Lost',
      message: `Dispute ${dispute.disputeId} was lost for order ${orderId}. Amount: ${dispute.amount}. Manual review required.`,
      data: {
        orderId,
        disputeId: dispute.disputeId,
        amount: dispute.amount,
        reason: dispute.reason,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const disputeService = new DisputeService();
