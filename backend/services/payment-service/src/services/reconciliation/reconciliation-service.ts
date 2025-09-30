import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import axios from 'axios';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';

export class ReconciliationService {
  private pool: Pool;
  private log = logger.child({ component: 'ReconciliationService' });
  private reconciliationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  async start() {
    this.log.info('Starting reconciliation service...');
    
    // Run every 5 minutes
    this.reconciliationInterval = setInterval(() => {
      this.reconcile();
    }, 5 * 60 * 1000);

    // Run immediately on start
    this.reconcile();
  }

  async stop() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
    this.log.info('Reconciliation service stopped');
  }

  async reconcile() {
    this.log.info('Starting reconciliation run...');

    try {
      await this.reconcileOrphanedPayments();
      await this.reconcileFailedOutboxEvents();
      await this.reconcilePendingOrders();
      
      this.log.info('Reconciliation run completed');
    } catch (error) {
      this.log.error('Reconciliation failed:', error);
    }
  }

  /**
   * Find orders marked as PAID but without tickets
   */
  private async reconcileOrphanedPayments() {
    const client = await this.pool.connect();

    try {
      // Find orders that are PAID but have no tickets after 5 minutes
      const result = await client.query(`
        SELECT o.* 
        FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.status = 'PAID'
          AND t.id IS NULL
          AND o.updated_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      if (result.rows.length > 0) {
        this.log.warn(`Found ${result.rows.length} orphaned paid orders without tickets`);

        for (const order of result.rows) {
          await this.fixOrphanedOrder(client, order);
        }
      }

    } catch (error) {
      this.log.error('Failed to reconcile orphaned payments:', error);
    } finally {
      client.release();
    }
  }

  private async fixOrphanedOrder(client: any, order: any) {
    this.log.info(`Fixing orphaned order ${order.id}`);

    try {
      // Check if there's already an outbox event for this order
      const existingOutbox = await client.query(`
        SELECT * FROM outbox
        WHERE aggregate_id = $1
          AND aggregate_type = 'order'
          AND event_type = 'order.paid'
          AND processed_at IS NULL
      `, [order.id]);

      if (existingOutbox.rows.length === 0) {
        // Create a new outbox event to trigger ticket creation
        await client.query(`
          INSERT INTO outbox (
            aggregate_id,
            aggregate_type,
            event_type,
            payload,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [
          order.id,
          'order',
          'order.paid',
          JSON.stringify({
            orderId: order.id,
            paymentId: order.payment_intent_id,
            userId: order.user_id,
            eventId: order.event_id,
            amount: order.total_amount,
            ticketQuantity: order.ticket_quantity,
            reconciliation: true,
            timestamp: new Date().toISOString()
          })
        ]);

        this.log.info(`Created reconciliation outbox event for order ${order.id}`);
      } else {
        // Reset the existing outbox event for retry
        await client.query(`
          UPDATE outbox
          SET attempts = 0,
              last_attempt_at = NULL,
              last_error = 'Reset by reconciliation'
          WHERE id = $1
        `, [existingOutbox.rows[0].id]);

        this.log.info(`Reset outbox event for order ${order.id}`);
      }

    } catch (error) {
      this.log.error(`Failed to fix orphaned order ${order.id}:`, error);
    }
  }

  /**
   * Retry failed outbox events that haven't exceeded max attempts
   */
  private async reconcileFailedOutboxEvents() {
    const client = await this.pool.connect();

    try {
      // Find stuck outbox events (not processed after 10 minutes)
      const result = await client.query(`
        UPDATE outbox
        SET attempts = 0,
            last_attempt_at = NULL,
            last_error = 'Reset by reconciliation'
        WHERE processed_at IS NULL
          AND attempts < 5
          AND created_at < NOW() - INTERVAL '10 minutes'
          AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '5 minutes')
        RETURNING id
      `);

      if (result.rows.length > 0) {
        this.log.info(`Reset ${result.rows.length} stuck outbox events`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile outbox events:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Check for orders stuck in PENDING state
   */
  private async reconcilePendingOrders() {
    const client = await this.pool.connect();

    try {
      // Find orders stuck in PENDING for more than 15 minutes
      const result = await client.query(`
        SELECT o.*, pi.status as payment_status
        FROM orders o
        LEFT JOIN payment_intents pi ON pi.order_id = o.id
        WHERE o.status = 'PENDING'
          AND o.created_at < NOW() - INTERVAL '15 minutes'
        LIMIT 10
      `);

      for (const order of result.rows) {
        if (order.payment_status === 'succeeded') {
          // Payment succeeded but order not updated
          this.log.warn(`Found order ${order.id} in PENDING with successful payment`);

          await client.query(`
            UPDATE orders
            SET status = 'PAID',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);

          // Create outbox event for ticket creation
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            order.id,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: order.id,
              paymentId: order.payment_intent_id,
              userId: order.user_id,
              eventId: order.event_id,
              amount: order.total_amount,
              ticketQuantity: order.ticket_quantity,
              reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

        } else {
          // Payment failed or expired
          this.log.info(`Expiring stale PENDING order ${order.id}`);

          await client.query(`
            UPDATE orders
            SET status = 'EXPIRED',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);
        }
      }

      if (result.rows.length > 0) {
        this.log.info(`Reconciled ${result.rows.length} pending orders`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile pending orders:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Manual reconciliation for specific order
   */
  async reconcileOrder(orderId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const order = await client.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      if (order.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderData = order.rows[0];

      // Check payment status
      const payment = await client.query(`
        SELECT * FROM payment_intents WHERE order_id = $1
      `, [orderId]);

      if (payment.rows.length > 0 && payment.rows[0].status === 'succeeded') {
        // Ensure order is marked as paid
        if (orderData.status !== 'PAID') {
          await client.query(`
            UPDATE orders SET status = 'PAID', updated_at = NOW()
            WHERE id = $1
          `, [orderId]);
        }

        // Check for tickets
        const tickets = await client.query(`
          SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
        `, [orderId]);

        if (tickets.rows[0].count === 0) {
          // Create outbox event to generate tickets
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            orderId,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: orderId,
              paymentId: payment.rows[0].stripe_intent_id,
              userId: orderData.user_id,
              eventId: orderData.event_id,
              amount: orderData.total_amount,
              ticketQuantity: orderData.ticket_quantity,
              manual_reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

          this.log.info(`Created manual reconciliation event for order ${orderId}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const reconciliationService = new ReconciliationService();
