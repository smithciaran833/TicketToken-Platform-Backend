import { OrderService } from '../services/order.service';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';

export class ReconciliationJob {
  private _orderService?: OrderService;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Lightweight constructor - no database calls
  }

  private get db() {
    return getDatabase();
  }

  private get orderService() {
    if (!this._orderService) {
      this._orderService = new OrderService(this.db);
    }
    return this._orderService;
  }

  /**
   * Start the reconciliation job
   * Runs every hour
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Reconciliation job already running');
      return;
    }

    logger.info('Starting reconciliation job');

    this.intervalId = setInterval(
      () => this.reconcileOrderState(),
      60 * 60 * 1000 // Every hour
    );

    // Run after 5 minutes on start
    setTimeout(() => this.reconcileOrderState(), 5 * 60 * 1000);
  }

  /**
   * Stop the reconciliation job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Reconciliation job stopped');
    }
  }

  /**
   * Reconcile order state with ticket-service and payment-service
   */
  private async reconcileOrderState(): Promise<void> {
    try {
      logger.info('Starting order reconciliation');

      let reconciledCount = 0;
      let errorCount = 0;

      // 1. Find orders in RESERVED state that may need attention
      const reservedOrders = await this.findStaleReservedOrders();
      logger.info(`Found ${reservedOrders.length} reserved orders to check`);

      for (const order of reservedOrders) {
        try {
          await this.reconcileOrder(order);
          reconciledCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to reconcile order', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            error
          });
        }
      }

      // 2. Find orders in CONFIRMED state without payment confirmation
      const unconfirmedOrders = await this.findUnconfirmedPaymentOrders();
      logger.info(`Found ${unconfirmedOrders.length} orders with unconfirmed payments`);

      for (const order of unconfirmedOrders) {
        try {
          await this.verifyPaymentStatus(order);
          reconciledCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to verify payment for order', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            error
          });
        }
      }

      logger.info('Order reconciliation completed', {
        reconciledCount,
        errorCount,
        totalChecked: reservedOrders.length + unconfirmedOrders.length
      });
    } catch (error) {
      logger.error('Reconciliation job failed', { error });
    }
  }

  /**
   * Find orders in RESERVED state for more than 1 hour
   * These may be stuck due to failed payment confirmation
   */
  private async findStaleReservedOrders(): Promise<any[]> {
    const query = `
      SELECT * FROM orders 
      WHERE status = 'RESERVED' 
      AND created_at < NOW() - INTERVAL '1 hour'
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at ASC
      LIMIT 100
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Find orders in CONFIRMED state created in last 24 hours
   * Verify they have proper payment confirmation
   */
  private async findUnconfirmedPaymentOrders(): Promise<any[]> {
    const query = `
      SELECT * FROM orders 
      WHERE status = 'CONFIRMED' 
      AND confirmed_at > NOW() - INTERVAL '24 hours'
      AND payment_intent_id IS NOT NULL
      ORDER BY confirmed_at DESC
      LIMIT 50
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Reconcile a single order by verifying ticket reservation status
   */
  private async reconcileOrder(order: any): Promise<void> {
    logger.info('Reconciling order', {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status
    });

    // Check if this order's tickets are actually reserved in ticket-service
    // If not, either:
    // 1. Re-reserve the tickets (if still available)
    // 2. Expire the order (if tickets no longer available)
    
    // For now, we'll log this for manual review
    // In a full implementation, you'd call ticket-service API here
    logger.warn('Order may need manual review', {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at,
      expiresAt: order.expires_at
    });

    // Add order event for tracking
    await this.db.query(
      `INSERT INTO order_events (order_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [
        order.id,
        'RECONCILIATION_CHECK',
        JSON.stringify({
          checkType: 'stale_reservation',
          timestamp: new Date().toISOString()
        })
      ]
    );
  }

  /**
   * Verify payment status for a confirmed order
   */
  private async verifyPaymentStatus(order: any): Promise<void> {
    logger.info('Verifying payment status', {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentIntentId: order.payment_intent_id
    });

    // In a full implementation, you'd call payment-service API here
    // to verify the payment was actually processed
    
    // For now, we'll just log for audit purposes
    logger.info('Payment verification logged', {
      orderId: order.id,
      paymentIntentId: order.payment_intent_id
    });

    // Add order event for tracking
    await this.db.query(
      `INSERT INTO order_events (order_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [
        order.id,
        'RECONCILIATION_CHECK',
        JSON.stringify({
          checkType: 'payment_verification',
          paymentIntentId: order.payment_intent_id,
          timestamp: new Date().toISOString()
        })
      ]
    );
  }
}
