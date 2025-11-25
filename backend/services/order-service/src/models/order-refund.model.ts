import { Pool } from 'pg';
import { OrderRefund, RefundStatus } from '../types';
import { logger } from '../utils/logger';

export class OrderRefundModel {
  constructor(private pool: Pool) {}

  async create(data: {
    orderId: string;
    tenantId: string;
    refundAmountCents: number;
    refundReason: string;
    refundStatus: RefundStatus;
    stripeRefundId?: string;
    initiatedBy?: string;
    metadata?: Record<string, any>;
  }): Promise<OrderRefund> {
    const query = `
      INSERT INTO order_refunds (
        tenant_id, order_id, refund_amount_cents, refund_reason,
        refund_status, stripe_refund_id, initiated_by, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      data.tenantId,
      data.orderId,
      data.refundAmountCents,
      data.refundReason,
      data.refundStatus,
      data.stripeRefundId,
      data.initiatedBy,
      JSON.stringify(data.metadata || {}),
    ];

    try {
      const result = await this.pool.query(query, values);
      return this.mapToOrderRefund(result.rows[0]);
    } catch (error) {
      logger.error('Error creating order refund', { error, data });
      throw error;
    }
  }

  async findByOrderId(orderId: string, tenantId: string): Promise<OrderRefund[]> {
    const query = 'SELECT * FROM order_refunds WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [orderId, tenantId]);
    return result.rows.map(this.mapToOrderRefund);
  }

  async updateStatus(id: string, tenantId: string, status: RefundStatus, stripeRefundId?: string): Promise<OrderRefund | null> {
    const query = `
      UPDATE order_refunds 
      SET refund_status = $2, stripe_refund_id = $3, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $4
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [id, status, stripeRefundId, tenantId]);
      return result.rows[0] ? this.mapToOrderRefund(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error updating refund status', { error, id, status });
      throw error;
    }
  }

  private mapToOrderRefund(row: any): OrderRefund {
    return {
      refundId: row.id, // Use id as refundId for now
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      refundAmountCents: parseInt(row.refund_amount_cents),
      refundReason: row.refund_reason,
      refundStatus: row.refund_status as RefundStatus,
      stripeRefundId: row.stripe_refund_id,
      initiatedBy: row.initiated_by,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
