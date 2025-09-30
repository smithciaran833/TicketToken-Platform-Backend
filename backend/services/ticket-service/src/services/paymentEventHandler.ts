import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PaymentEventHandler' });

class PaymentEventHandlerClass {
  async handlePaymentSucceeded(orderId: string, paymentId: string) {
    const db = DatabaseService.getPool();
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update order status
      await client.query(
        `UPDATE orders 
         SET status = 'PAID', 
             payment_intent_id = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, paymentId]
      );
      
      // Get order details
      const orderResult = await client.query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );
      
      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      const order = orderResult.rows[0];
      
      // Queue NFT minting job
      const mintJob = {
        orderId: order.id,
        userId: order.user_id,
        eventId: order.event_id,
        quantity: order.ticket_quantity,
        timestamp: new Date().toISOString()
      };
      
      await QueueService.publish('ticket.mint', mintJob);
      
      // Write to outbox
      await client.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          'order',
          'order.paid',
          JSON.stringify(mintJob)
        ]
      );
      
      await client.query('COMMIT');
      
      log.info('Order marked as paid, NFT minting queued', { 
        orderId, 
        quantity: order.ticket_quantity 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to handle payment success', { orderId, error });
      throw error;
    } finally {
      client.release();
    }
  }
  
  async handlePaymentFailed(orderId: string, reason: string) {
    const db = DatabaseService.getPool();
    
    await db.query(
      `UPDATE orders 
       SET status = 'PAYMENT_FAILED', 
           updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );
    
    log.info('Order marked as payment failed', { orderId, reason });
  }
}

export const PaymentEventHandler = new PaymentEventHandlerClass();
