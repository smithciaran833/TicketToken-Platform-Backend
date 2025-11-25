import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { RefundType, RefundedItem, PartialRefundRequest, RefundCalculation, RefundValidationResult, OrderRefund } from '../types/refund.types';
import { Order, OrderItem } from '../types/order.types';

/**
 * Partial Refund Service
 * Handles partial refunds with proportional fee calculations
 */
export class PartialRefundService {
  /**
   * Calculate refund amounts for partial refund
   */
  calculatePartialRefundAmount(
    order: Order,
    items: OrderItem[],
    refundItems: RefundedItem[]
  ): RefundCalculation {
    // Calculate total subtotal being refunded
    const subtotalRefundCents = refundItems.reduce((sum, refundItem) => {
      const orderItem = items.find(item => item.id === refundItem.orderItemId);
      if (!orderItem) return sum;
      
      const unitPrice = orderItem.unitPriceCents;
      return sum + (unitPrice * refundItem.quantity);
    }, 0);

    // Calculate refund percentage
    const refundPercentage = subtotalRefundCents / order.subtotalCents;

    // Calculate proportional fees
    const proportionalPlatformFeeCents = Math.round(order.platformFeeCents * refundPercentage);
    const proportionalProcessingFeeCents = 0; // Processing fees are typically non-refundable
    const proportionalTaxCents = Math.round(order.taxCents * refundPercentage);

    // Total refund amount
    const totalRefundCents = subtotalRefundCents + proportionalPlatformFeeCents + proportionalTaxCents;

    return {
      subtotalRefundCents,
      proportionalPlatformFeeCents,
      proportionalProcessingFeeCents,
      proportionalTaxCents,
      totalRefundCents,
      refundPercentage,
    };
  }

  /**
   * Validate partial refund request
   */
  async validatePartialRefundItems(
    orderId: string,
    refundItems: RefundedItem[]
  ): Promise<RefundValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const db = getDatabase();

    try {
      // Get order and items
      const orderResult = await db.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        errors.push('Order not found');
        return { valid: false, errors, warnings };
      }

      const order = orderResult.rows[0];

      // Check order status
      if (order.status !== 'CONFIRMED' && order.status !== 'COMPLETED') {
        errors.push(`Cannot refund order with status: ${order.status}`);
      }

      // Get order items
      const itemsResult = await db.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );

      const orderItems = itemsResult.rows;

      // Get existing refunds
      const refundsResult = await db.query(
        'SELECT * FROM order_refunds WHERE order_id = $1',
        [orderId]
      );

      const existingRefunds = refundsResult.rows;

      // Build refunded quantities map
      const refundedQuantities = new Map<string, number>();
      for (const refund of existingRefunds) {
        if (refund.refund_type === 'FULL') {
          // Full refund - all items refunded
          for (const item of orderItems) {
            refundedQuantities.set(item.id, item.quantity);
          }
        } else if (refund.refunded_items) {
          // Partial refund - add refunded quantities
          const items = Array.isArray(refund.refunded_items) 
            ? refund.refunded_items 
            : JSON.parse(refund.refunded_items);
          for (const refundedItem of items) {
            const current = refundedQuantities.get(refundedItem.orderItemId) || 0;
            refundedQuantities.set(refundedItem.orderItemId, current + refundedItem.quantity);
          }
        }
      }

      // Validate each refund item
      for (const refundItem of refundItems) {
        const orderItem = orderItems.find((item: any) => item.id === refundItem.orderItemId);

        if (!orderItem) {
          errors.push(`Order item ${refundItem.orderItemId} not found in order`);
          continue;
        }

        // Check quantity
        const alreadyRefunded = refundedQuantities.get(refundItem.orderItemId) || 0;
        const availableToRefund = orderItem.quantity - alreadyRefunded;

        if (refundItem.quantity > availableToRefund) {
          errors.push(
            `Cannot refund ${refundItem.quantity} of item ${refundItem.orderItemId}. ` +
            `Only ${availableToRefund} available (${alreadyRefunded} already refunded)`
          );
        }

        if (refundItem.quantity <= 0) {
          errors.push(`Refund quantity must be positive for item ${refundItem.orderItemId}`);
        }

        // Validate amount matches expected
        const expectedAmount = orderItem.unit_price_cents * refundItem.quantity;
        if (refundItem.amountCents !== expectedAmount) {
          warnings.push(
            `Amount mismatch for item ${refundItem.orderItemId}: ` +
            `expected ${expectedAmount}, got ${refundItem.amountCents}`
          );
        }
      }

      // Check minimum refund amount
      const totalRefundAmount = refundItems.reduce((sum, item) => sum + item.amountCents, 0);
      if (totalRefundAmount < 50) {
        // Minimum 50 cents
        errors.push('Refund amount must be at least $0.50');
      }

    } catch (error) {
      logger.error('Error validating partial refund', { error, orderId });
      errors.push('Validation error occurred');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Process partial refund
   */
  async processPartialRefund(request: PartialRefundRequest): Promise<OrderRefund> {
    const db = getDatabase();

    try {
      // Validate request
      const validation = await this.validatePartialRefundItems(request.orderId, request.items);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Get order and items
      const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [request.orderId]);
      const order = orderResult.rows[0];

      const itemsResult = await db.query('SELECT * FROM order_items WHERE order_id = $1', [request.orderId]);
      const items = itemsResult.rows;

      // Calculate refund amounts
      const calculation = this.calculatePartialRefundAmount(order, items, request.items);

      // Create refund record
      const refundResult = await db.query(
        `
        INSERT INTO order_refunds (
          id, order_id, refund_type, amount_cents, original_amount_cents,
          refunded_items, proportional_platform_fee_cents, 
          proportional_processing_fee_cents, proportional_tax_cents,
          reason, notes, refund_status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
        )
        RETURNING *
        `,
        [
          request.orderId,
          RefundType.PARTIAL,
          calculation.totalRefundCents,
          order.total_cents,
          JSON.stringify(request.items),
          calculation.proportionalPlatformFeeCents,
          calculation.proportionalProcessingFeeCents,
          calculation.proportionalTaxCents,
          request.reason,
          request.notes || null,
          'PENDING',
        ]
      );

      const refund = refundResult.rows[0];

      // Here you would integrate with payment service to process the actual refund
      // await paymentClient.refund(order.payment_intent_id, calculation.totalRefundCents);

      logger.info('Partial refund processed', {
        orderId: request.orderId,
        refundId: refund.id,
        amount: calculation.totalRefundCents,
        items: request.items.length,
      });

      return {
        id: refund.id,
        orderId: refund.order_id,
        refundType: refund.refund_type,
        amountCents: refund.amount_cents,
        originalAmountCents: refund.original_amount_cents,
        refundedItems: request.items,
        proportionalPlatformFeeCents: refund.proportional_platform_fee_cents,
        proportionalProcessingFeeCents: refund.proportional_processing_fee_cents,
        proportionalTaxCents: refund.proportional_tax_cents,
        reason: refund.reason,
        notes: refund.notes,
        refundStatus: refund.refund_status,
        createdAt: refund.created_at,
        updatedAt: refund.updated_at,
      };
    } catch (error) {
      logger.error('Error processing partial refund', { error, request });
      throw error;
    }
  }

  /**
   * Update order totals after partial refund
   */
  async updateOrderTotals(orderId: string): Promise<void> {
    const db = getDatabase();

    try {
      // Get all refunds for order
      const refundsResult = await db.query(
        'SELECT * FROM order_refunds WHERE order_id = $1 AND refund_status = $2',
        [orderId, 'COMPLETED']
      );

      const refunds = refundsResult.rows;
      const totalRefunded = refunds.reduce((sum: number, r: any) => sum + r.amount_cents, 0);

      // Update order with refunded amount (store in metadata or add column)
      await db.query(
        `UPDATE orders 
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('total_refunded_cents', $1),
             updated_at = NOW()
         WHERE id = $2`,
        [totalRefunded, orderId]
      );

      logger.info('Order totals updated after refund', { orderId, totalRefunded });
    } catch (error) {
      logger.error('Error updating order totals', { error, orderId });
      throw error;
    }
  }

  /**
   * Get refund history for an order
   */
  async getRefundHistory(orderId: string): Promise<OrderRefund[]> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT * FROM order_refunds WHERE order_id = $1 ORDER BY created_at DESC',
        [orderId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        orderId: row.order_id,
        refundType: row.refund_type,
        amountCents: row.amount_cents,
        originalAmountCents: row.original_amount_cents,
        refundedItems: row.refunded_items,
        proportionalPlatformFeeCents: row.proportional_platform_fee_cents,
        proportionalProcessingFeeCents: row.proportional_processing_fee_cents,
        proportionalTaxCents: row.proportional_tax_cents,
        reason: row.reason,
        notes: row.notes,
        paymentIntentId: row.payment_intent_id,
        refundStatus: row.refund_status,
        processedAt: row.processed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('Error getting refund history', { error, orderId });
      throw error;
    }
  }
}

export const partialRefundService = new PartialRefundService();
