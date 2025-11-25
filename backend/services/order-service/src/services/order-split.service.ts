import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { OrderSplit, SplitOrderRequest, PaymentAllocation } from '../types/split.types';

/**
 * Order Split Service
 * Handles splitting orders into multiple child orders
 */
export class OrderSplitService {
  /**
   * Split an order into multiple child orders
   */
  async splitOrder(
    tenantId: string,
    userId: string,
    request: SplitOrderRequest
  ): Promise<OrderSplit> {
    const db = getDatabase();

    try {
      // Validate parent order
      const orderResult = await db.query(
        'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
        [request.orderId, tenantId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const parentOrder = orderResult.rows[0];

      // Generate split group ID
      const splitGroupId = crypto.randomUUID();

      // Create child orders (simplified - would need full implementation)
      const childOrderIds: string[] = [];
      const paymentAllocations: PaymentAllocation[] = [];

      for (let i = 0; i < request.splitCount; i++) {
        const childOrderId = crypto.randomUUID();
        childOrderIds.push(childOrderId);
        
        // Simplified payment allocation
        const allocation: PaymentAllocation = {
          childOrderId,
          amountCents: Math.floor(parentOrder.total_cents / request.splitCount),
          percentage: 100 / request.splitCount,
        };
        paymentAllocations.push(allocation);
      }

      // Create split record
      const splitResult = await db.query(
        `INSERT INTO order_splits (
          id, parent_order_id, tenant_id, split_count, split_reason,
          split_by, child_order_ids, payment_allocations, created_at, completed_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        ) RETURNING *`,
        [
          request.orderId,
          tenantId,
          request.splitCount,
          request.reason || 'Order split',
          userId,
          childOrderIds,
          JSON.stringify(paymentAllocations),
        ]
      );

      logger.info('Order split completed', {
        splitId: splitResult.rows[0].id,
        parentOrderId: request.orderId,
        childCount: request.splitCount,
      });

      return this.mapToOrderSplit(splitResult.rows[0]);
    } catch (error) {
      logger.error('Error splitting order', { error, request });
      throw error;
    }
  }

  /**
   * Get split details for an order
   */
  async getOrderSplit(parentOrderId: string): Promise<OrderSplit | null> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT * FROM order_splits WHERE parent_order_id = $1',
        [parentOrderId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToOrderSplit(result.rows[0]);
    } catch (error) {
      logger.error('Error getting order split', { error, parentOrderId });
      throw error;
    }
  }

  private mapToOrderSplit(row: any): OrderSplit {
    return {
      id: row.id,
      parentOrderId: row.parent_order_id,
      tenantId: row.tenant_id,
      splitCount: row.split_count,
      splitReason: row.split_reason,
      splitBy: row.split_by,
      childOrderIds: row.child_order_ids,
      paymentAllocations: JSON.parse(row.payment_allocations),
      metadata: row.metadata,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}

export const orderSplitService = new OrderSplitService();
