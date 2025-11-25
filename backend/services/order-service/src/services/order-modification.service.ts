import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import {
  ModificationType,
  ModificationStatus,
  ModificationRequest,
  UpgradeRequest,
  OrderModification,
  ModificationCalculation,
} from '../types/modification.types';

/**
 * Order Modification Service
 * Handles order upgrades, downgrades, and modifications
 */
export class OrderModificationService {
  /**
   * Calculate financial impact of modification
   */
  async calculateModificationImpact(
    orderId: string,
    modificationType: ModificationType,
    originalItemId?: string,
    newTicketTypeId?: string,
    quantityChange?: number
  ): Promise<ModificationCalculation> {
    const db = getDatabase();

    try {
      let priceDifferenceCents = 0;
      let additionalFeesCents = 0;

      if (modificationType === ModificationType.UPGRADE_ITEM || modificationType === ModificationType.DOWNGRADE_ITEM) {
        // Get original item price
        const originalResult = await db.query(
          'SELECT unit_price_cents FROM order_items WHERE id = $1',
          [originalItemId]
        );
        const originalPrice = originalResult.rows[0]?.unit_price_cents || 0;

        // Get new ticket type price (would typically come from ticket service)
        // For now, we'll use a placeholder - in production, call ticket service
        const newPrice = 0; // TODO: Fetch from ticket service

        priceDifferenceCents = newPrice - originalPrice;
        
        // Calculate additional fees (2% of price increase)
        if (priceDifferenceCents > 0) {
          additionalFeesCents = Math.round(priceDifferenceCents * 0.02);
        }
      }

      if (modificationType === ModificationType.CHANGE_QUANTITY && quantityChange) {
        // Calculate price for quantity change
        const itemResult = await db.query(
          'SELECT unit_price_cents FROM order_items WHERE id = $1',
          [originalItemId]
        );
        const unitPrice = itemResult.rows[0]?.unit_price_cents || 0;
        
        priceDifferenceCents = unitPrice * quantityChange;
        
        if (quantityChange > 0) {
          additionalFeesCents = Math.round(priceDifferenceCents * 0.02);
        }
      }

      const totalAdjustmentCents = priceDifferenceCents + additionalFeesCents;

      return {
        priceDifferenceCents,
        additionalFeesCents,
        totalAdjustmentCents,
        requiresPayment: totalAdjustmentCents > 0,
        requiresRefund: totalAdjustmentCents < 0,
      };
    } catch (error) {
      logger.error('Error calculating modification impact', { error, orderId });
      throw error;
    }
  }

  /**
   * Request order modification
   */
  async requestModification(
    tenantId: string,
    userId: string,
    request: ModificationRequest
  ): Promise<OrderModification> {
    const db = getDatabase();

    try {
      // Validate order exists and belongs to user
      const orderResult = await db.query(
        'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
        [request.orderId, tenantId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      // Check order status - can only modify CONFIRMED or COMPLETED orders
      if (order.status !== 'CONFIRMED' && order.status !== 'COMPLETED') {
        throw new Error(`Cannot modify order with status: ${order.status}`);
      }

      // Calculate financial impact
      const calculation = await this.calculateModificationImpact(
        request.orderId,
        request.modificationType,
        request.originalItemId,
        request.newTicketTypeId,
        request.quantityChange
      );

      // Create modification record
      const result = await db.query(
        `
        INSERT INTO order_modifications (
          id, order_id, tenant_id, modification_type, status,
          original_item_id, new_ticket_type_id, quantity_change,
          price_difference_cents, additional_fees_cents, total_adjustment_cents,
          requested_by, reason, notes, requested_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW(), NOW()
        )
        RETURNING *
        `,
        [
          request.orderId,
          tenantId,
          request.modificationType,
          ModificationStatus.PENDING,
          request.originalItemId || null,
          request.newTicketTypeId || null,
          request.quantityChange || 0,
          calculation.priceDifferenceCents,
          calculation.additionalFeesCents,
          calculation.totalAdjustmentCents,
          userId,
          request.reason,
          request.notes || null,
        ]
      );

      const modification = result.rows[0];

      logger.info('Order modification requested', {
        modificationId: modification.id,
        orderId: request.orderId,
        type: request.modificationType,
        adjustment: calculation.totalAdjustmentCents,
      });

      return this.mapToModification(modification);
    } catch (error) {
      logger.error('Error requesting modification', { error, request });
      throw error;
    }
  }

  /**
   * Upgrade order item to different ticket type
   */
  async upgradeItem(
    tenantId: string,
    userId: string,
    request: UpgradeRequest
  ): Promise<OrderModification> {
    return this.requestModification(tenantId, userId, {
      orderId: request.orderId,
      modificationType: ModificationType.UPGRADE_ITEM,
      originalItemId: request.originalItemId,
      newTicketTypeId: request.newTicketTypeId,
      reason: request.reason,
      notes: request.notes,
    });
  }

  /**
   * Approve modification
   */
  async approveModification(
    modificationId: string,
    approvedBy: string
  ): Promise<OrderModification> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        UPDATE order_modifications
        SET status = $1,
            approved_by = $2,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $3 AND status = $4
        RETURNING *
        `,
        [ModificationStatus.APPROVED, approvedBy, modificationId, ModificationStatus.PENDING]
      );

      if (result.rows.length === 0) {
        throw new Error('Modification not found or already processed');
      }

      const modification = result.rows[0];

      logger.info('Modification approved', {
        modificationId,
        approvedBy,
        orderId: modification.order_id,
      });

      // Auto-process if approved
      await this.processModification(modificationId);

      return this.mapToModification(modification);
    } catch (error) {
      logger.error('Error approving modification', { error, modificationId });
      throw error;
    }
  }

  /**
   * Reject modification
   */
  async rejectModification(
    modificationId: string,
    rejectedBy: string,
    reason: string
  ): Promise<OrderModification> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        UPDATE order_modifications
        SET status = $1,
            rejected_by = $2,
            rejected_at = NOW(),
            rejection_reason = $3,
            updated_at = NOW()
        WHERE id = $4 AND status = $5
        RETURNING *
        `,
        [ModificationStatus.REJECTED, rejectedBy, reason, modificationId, ModificationStatus.PENDING]
      );

      if (result.rows.length === 0) {
        throw new Error('Modification not found or already processed');
      }

      logger.info('Modification rejected', {
        modificationId,
        rejectedBy,
        reason,
      });

      return this.mapToModification(result.rows[0]);
    } catch (error) {
      logger.error('Error rejecting modification', { error, modificationId });
      throw error;
    }
  }

  /**
   * Process approved modification
   */
  async processModification(modificationId: string): Promise<void> {
    const db = getDatabase();

    try {
      // Update status to processing
      await db.query(
        `UPDATE order_modifications SET status = $1, updated_at = NOW() WHERE id = $2`,
        [ModificationStatus.PROCESSING, modificationId]
      );

      // Get modification details
      const modResult = await db.query(
        'SELECT * FROM order_modifications WHERE id = $1',
        [modificationId]
      );

      const modification = modResult.rows[0];

      // Process based on type
      switch (modification.modification_type) {
        case ModificationType.UPGRADE_ITEM:
        case ModificationType.DOWNGRADE_ITEM:
          await this.processItemChange(modification);
          break;
        case ModificationType.CHANGE_QUANTITY:
          await this.processQuantityChange(modification);
          break;
        case ModificationType.ADD_ITEM:
          await this.processAddItem(modification);
          break;
        case ModificationType.REMOVE_ITEM:
          await this.processRemoveItem(modification);
          break;
      }

      // Update status to completed
      await db.query(
        `UPDATE order_modifications 
         SET status = $1, completed_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [ModificationStatus.COMPLETED, modificationId]
      );

      logger.info('Modification processed successfully', { modificationId });
    } catch (error) {
      logger.error('Error processing modification', { error, modificationId });
      
      // Update status to failed
      await db.query(
        `UPDATE order_modifications SET status = $1, updated_at = NOW() WHERE id = $2`,
        [ModificationStatus.FAILED, modificationId]
      );
      
      throw error;
    }
  }

  /**
   * Process item change (upgrade/downgrade)
   */
  private async processItemChange(modification: any): Promise<void> {
    const db = getDatabase();

    // Update order item with new ticket type
    await db.query(
      `UPDATE order_items 
       SET ticket_type_id = $1, 
           unit_price_cents = unit_price_cents + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        modification.new_ticket_type_id,
        modification.price_difference_cents,
        modification.original_item_id,
      ]
    );

    // Update order total
    await db.query(
      `UPDATE orders 
       SET total_cents = total_cents + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [modification.total_adjustment_cents, modification.order_id]
    );
  }

  /**
   * Process quantity change
   */
  private async processQuantityChange(modification: any): Promise<void> {
    const db = getDatabase();

    await db.query(
      `UPDATE order_items 
       SET quantity = quantity + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [modification.quantity_change, modification.original_item_id]
    );

    await db.query(
      `UPDATE orders 
       SET total_cents = total_cents + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [modification.total_adjustment_cents, modification.order_id]
    );
  }

  /**
   * Process add item
   */
  private async processAddItem(modification: any): Promise<void> {
    // Implementation for adding new item to order
    logger.info('Processing add item modification', { modification });
  }

  /**
   * Process remove item
   */
  private async processRemoveItem(modification: any): Promise<void> {
    // Implementation for removing item from order
    logger.info('Processing remove item modification', { modification });
  }

  /**
   * Get modifications for an order
   */
  async getOrderModifications(orderId: string): Promise<OrderModification[]> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT * FROM order_modifications WHERE order_id = $1 ORDER BY created_at DESC',
        [orderId]
      );

      return result.rows.map(row => this.mapToModification(row));
    } catch (error) {
      logger.error('Error getting order modifications', { error, orderId });
      throw error;
    }
  }

  /**
   * Get modification by ID
   */
  async getModification(modificationId: string): Promise<OrderModification | null> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT * FROM order_modifications WHERE id = $1',
        [modificationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToModification(result.rows[0]);
    } catch (error) {
      logger.error('Error getting modification', { error, modificationId });
      throw error;
    }
  }

  /**
   * Map database row to OrderModification
   */
  private mapToModification(row: any): OrderModification {
    return {
      id: row.id,
      orderId: row.order_id,
      tenantId: row.tenant_id,
      modificationType: row.modification_type,
      status: row.status,
      originalItemId: row.original_item_id,
      newItemId: row.new_item_id,
      newTicketTypeId: row.new_ticket_type_id,
      quantityChange: row.quantity_change,
      priceDifferenceCents: row.price_difference_cents,
      additionalFeesCents: row.additional_fees_cents,
      totalAdjustmentCents: row.total_adjustment_cents,
      paymentIntentId: row.payment_intent_id,
      refundId: row.refund_id,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      rejectedBy: row.rejected_by,
      rejectionReason: row.rejection_reason,
      reason: row.reason,
      notes: row.notes,
      metadata: row.metadata,
      requestedAt: row.requested_at,
      approvedAt: row.approved_at,
      rejectedAt: row.rejected_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const orderModificationService = new OrderModificationService();
