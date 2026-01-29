import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'ReconciliationService' });

/**
 * SECURITY: Explicit field lists for reconciliation queries.
 */
const ORDER_RECONCILE_FIELDS = 'id, tenant_id, user_id, event_id, status, total_cents, ticket_quantity, payment_intent_id, created_at, updated_at';
const OUTBOX_RECONCILE_FIELDS = 'id, aggregate_id, aggregate_type, event_type, processed_at, attempts, last_attempt_at, created_at';

/**
 * Valid order status transitions:
 * PENDING → RESERVED, CANCELLED, EXPIRED
 * RESERVED → CONFIRMED, CANCELLED, EXPIRED  
 * CONFIRMED → COMPLETED, CANCELLED, REFUNDED
 * COMPLETED → REFUNDED
 */

export interface ReconciliationResult {
  orphanedPaymentsFixed: number;
  outboxEventsReset: number;
  pendingOrdersReconciled: number;
  errors: string[];
}

export interface OrderToReconcile {
  id: string;
  tenant_id: string;
  user_id: string;
  event_id: string;
  status: string;
  total_cents: number;
  ticket_quantity: number;
  payment_intent_id: string | null;
  payment_status?: string;
}

export class ReconciliationService {
  private pool: Pool;
  private reconciliationInterval: NodeJS.Timeout | null = null;
  private intervalMinutes: number;

  constructor(pool: Pool, intervalMinutes: number = 5) {
    this.pool = pool;
    this.intervalMinutes = intervalMinutes;
  }

  start(): void {
    if (this.reconciliationInterval) {
      log.warn('Reconciliation service already running');
      return;
    }

    log.info({ intervalMinutes: this.intervalMinutes }, 'Starting reconciliation service');

    this.reconcile().catch((error) => {
      log.error({ error }, 'Initial reconciliation failed');
    });

    this.reconciliationInterval = setInterval(() => {
      this.reconcile().catch((error) => {
        log.error({ error }, 'Scheduled reconciliation failed');
      });
    }, this.intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
      log.info('Reconciliation service stopped');
    }
  }

  async reconcile(): Promise<ReconciliationResult> {
    log.info('Starting reconciliation run');

    const result: ReconciliationResult = {
      orphanedPaymentsFixed: 0,
      outboxEventsReset: 0,
      pendingOrdersReconciled: 0,
      errors: [],
    };

    try {
      result.orphanedPaymentsFixed = await this.reconcileOrphanedPayments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Orphaned payments: ${msg}`);
      log.error({ error }, 'Failed to reconcile orphaned payments');
    }

    try {
      result.outboxEventsReset = await this.reconcileFailedOutboxEvents();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Outbox events: ${msg}`);
      log.error({ error }, 'Failed to reconcile outbox events');
    }

    try {
      result.pendingOrdersReconciled = await this.reconcilePendingOrders();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Pending orders: ${msg}`);
      log.error({ error }, 'Failed to reconcile pending orders');
    }

    log.info({ result }, 'Reconciliation run completed');
    return result;
  }

  /**
   * Find CONFIRMED orders without tickets (should have been created)
   */
  async reconcileOrphanedPayments(): Promise<number> {
    const client = await this.pool.connect();
    let fixedCount = 0;

    try {
      // Find orders that are CONFIRMED but have no tickets after 5 minutes
      const result = await client.query(`
        SELECT ${ORDER_RECONCILE_FIELDS.split(', ').map(f => 'o.' + f).join(', ')}
        FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.status = 'CONFIRMED'
          AND t.id IS NULL
          AND o.updated_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      if (result.rows.length > 0) {
        log.warn({ count: result.rows.length }, 'Found orphaned confirmed orders without tickets');

        for (const order of result.rows) {
          try {
            await this.fixOrphanedOrder(client, order);
            fixedCount++;
          } catch (error) {
            log.error({ orderId: order.id, error }, 'Failed to fix orphaned order');
          }
        }
      }

      return fixedCount;
    } finally {
      client.release();
    }
  }

  private async fixOrphanedOrder(client: PoolClient, order: OrderToReconcile): Promise<void> {
    log.info({ orderId: order.id }, 'Fixing orphaned order');

    const existingOutbox = await client.query(`
      SELECT ${OUTBOX_RECONCILE_FIELDS} FROM outbox
      WHERE aggregate_id = $1
        AND aggregate_type = 'order'
        AND event_type = 'order.confirmed'
        AND processed_at IS NULL
    `, [order.id]);

    if (existingOutbox.rows.length === 0) {
      await client.query(`
        INSERT INTO outbox (
          tenant_id,
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        order.tenant_id,
        order.id,
        'order',
        'order.confirmed',
        JSON.stringify({
          orderId: order.id,
          paymentId: order.payment_intent_id,
          userId: order.user_id,
          eventId: order.event_id,
          amount: order.total_cents,
          ticketQuantity: order.ticket_quantity,
          reconciliation: true,
          timestamp: new Date().toISOString()
        })
      ]);

      log.info({ orderId: order.id }, 'Created reconciliation outbox event');
    } else {
      await client.query(`
        UPDATE outbox
        SET attempts = 0,
            last_attempt_at = NULL,
            last_error = 'Reset by reconciliation'
        WHERE id = $1
      `, [existingOutbox.rows[0].id]);

      log.info({ orderId: order.id }, 'Reset existing outbox event');
    }
  }

  async reconcileFailedOutboxEvents(): Promise<number> {
    const result = await this.pool.query(`
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
      log.info({ count: result.rows.length }, 'Reset stuck outbox events');
    }

    return result.rows.length;
  }

  /**
   * Check for orders stuck in PENDING/RESERVED state
   * Valid transitions: PENDING → EXPIRED, RESERVED → EXPIRED
   */
  async reconcilePendingOrders(): Promise<number> {
    const client = await this.pool.connect();
    let reconciledCount = 0;

    try {
      // Find orders stuck in PENDING for more than 15 minutes
      const result = await client.query(`
        SELECT ${ORDER_RECONCILE_FIELDS.split(', ').map(f => 'o.' + f).join(', ')}, pi.status as payment_status
        FROM orders o
        LEFT JOIN payment_intents pi ON pi.order_id = o.id
        WHERE o.status IN ('PENDING', 'RESERVED')
          AND o.created_at < NOW() - INTERVAL '15 minutes'
        LIMIT 10
      `);

      for (const order of result.rows) {
        try {
          if (order.payment_status === 'succeeded' || order.payment_status === 'PAID') {
            // Payment succeeded - advance order through proper state machine
            // PENDING → RESERVED → CONFIRMED
            log.warn({ orderId: order.id, currentStatus: order.status }, 'Found stale order with successful payment');
            
            if (order.status === 'PENDING') {
              await client.query(`
                UPDATE orders SET status = 'RESERVED', updated_at = NOW()
                WHERE id = $1 AND status = 'PENDING'
              `, [order.id]);
            }
            
            await client.query(`
              UPDATE orders SET status = 'CONFIRMED', updated_at = NOW()
              WHERE id = $1 AND status = 'RESERVED'
            `, [order.id]);

            // Create outbox event for ticket creation
            await client.query(`
              INSERT INTO outbox (
                tenant_id,
                aggregate_id,
                aggregate_type,
                event_type,
                payload
              ) VALUES ($1, $2, $3, $4, $5)
            `, [
              order.tenant_id,
              order.id,
              'order',
              'order.confirmed',
              JSON.stringify({
                orderId: order.id,
                paymentId: order.payment_intent_id,
                userId: order.user_id,
                eventId: order.event_id,
                amount: order.total_cents,
                ticketQuantity: order.ticket_quantity,
                reconciliation: true,
                timestamp: new Date().toISOString()
              })
            ]);

            reconciledCount++;
          } else {
            // Payment failed or expired - mark order as expired
            log.info({ orderId: order.id }, 'Expiring stale order');

            await client.query(`
              UPDATE orders
              SET status = 'EXPIRED',
                  updated_at = NOW()
              WHERE id = $1 AND status IN ('PENDING', 'RESERVED')
            `, [order.id]);

            reconciledCount++;
          }
        } catch (error) {
          log.error({ orderId: order.id, error }, 'Failed to reconcile pending order');
        }
      }

      return reconciledCount;
    } finally {
      client.release();
    }
  }

  /**
   * Manual reconciliation for specific order
   */
  async reconcileOrder(orderId: string, tenantId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const order = await client.query(`
        SELECT ${ORDER_RECONCILE_FIELDS} FROM orders 
        WHERE id = $1 AND tenant_id = $2
      `, [orderId, tenantId]);

      if (order.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderData = order.rows[0];

      // Check payment status
      const payment = await client.query(`
        SELECT id, order_id, status, amount FROM payment_intents 
        WHERE order_id = $1
      `, [orderId]);

      if (payment.rows.length > 0 && 
          (payment.rows[0].status === 'succeeded' || payment.rows[0].status === 'PAID')) {
        
        // Check for tickets
        const tickets = await client.query(`
          SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
        `, [orderId]);

        if (parseInt(tickets.rows[0].count) === 0) {
          // Create outbox event to generate tickets
          await client.query(`
            INSERT INTO outbox (
              tenant_id,
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4, $5)
          `, [
            tenantId,
            orderId,
            'order',
            'order.confirmed',
            JSON.stringify({
              orderId: orderId,
              paymentId: payment.rows[0].id,
              userId: orderData.user_id,
              eventId: orderData.event_id,
              amount: orderData.total_cents,
              ticketQuantity: orderData.ticket_quantity,
              manual_reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

          log.info({ orderId }, 'Created manual reconciliation event');
        }
      }

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getStats(tenantId: string): Promise<{
    pendingOrders: number;
    paidWithoutTickets: number;
    stuckOutboxEvents: number;
  }> {
    const [pending, orphaned, stuck] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*) as count FROM orders 
        WHERE tenant_id = $1 AND status IN ('PENDING', 'RESERVED')
          AND created_at < NOW() - INTERVAL '15 minutes'
      `, [tenantId]),
      
      this.pool.query(`
        SELECT COUNT(*) as count FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.tenant_id = $1 AND o.status = 'CONFIRMED' AND t.id IS NULL
      `, [tenantId]),
      
      this.pool.query(`
        SELECT COUNT(*) as count FROM outbox
        WHERE tenant_id = $1 AND processed_at IS NULL
          AND created_at < NOW() - INTERVAL '10 minutes'
      `, [tenantId]),
    ]);

    return {
      pendingOrders: parseInt(pending.rows[0].count) || 0,
      paidWithoutTickets: parseInt(orphaned.rows[0].count) || 0,
      stuckOutboxEvents: parseInt(stuck.rows[0].count) || 0,
    };
  }
}
