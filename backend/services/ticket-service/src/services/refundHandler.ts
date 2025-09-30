import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RefundHandler' });

class RefundHandlerClass {
  async initiateRefund(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    try {
      // Update order status
      await db.query(
        `UPDATE orders 
         SET status = 'REFUND_INITIATED', updated_at = NOW() 
         WHERE id = $1`,
        [orderId]
      );
      
      // Get payment details
      const result = await db.query(
        `SELECT payment_intent_id, total_amount FROM orders WHERE id = $1`,
        [orderId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      const order = result.rows[0];
      
      // Queue refund request to payment service
      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          'order',
          'refund.requested',
          JSON.stringify({
            orderId,
            paymentIntentId: order.payment_intent_id,
            amount: order.total_amount,
            reason
          })
        ]
      );
      
      log.info('Refund initiated', { orderId, reason });
      
      return { success: true, orderId, status: 'REFUND_INITIATED' };
      
    } catch (error) {
      log.error('Failed to initiate refund', { orderId, error });
      throw error;
    }
  }
}

export const RefundHandler = new RefundHandlerClass();
