import { Pool } from 'pg';
import { Order, OrderStatus, OrderUpdateData } from '../types';
import { logger } from '../utils/logger';

export class OrderModel {
  constructor(private pool: Pool) {}

  async create(data: {
    tenantId: string;
    userId: string;
    eventId: string;
    orderNumber: string;
    status: OrderStatus;
    subtotalCents: number;
    platformFeeCents: number;
    processingFeeCents: number;
    taxCents: number;
    discountCents: number;
    totalCents: number;
    currency: string;
    idempotencyKey?: string;
    reservationExpiresAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<Order> {
    const query = `
      INSERT INTO orders (
        tenant_id, user_id, event_id, order_number, status,
        subtotal_cents, platform_fee_cents, processing_fee_cents,
        tax_cents, discount_cents, total_cents, currency,
        idempotency_key, expires_at, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      data.tenantId,
      data.userId,
      data.eventId,
      data.orderNumber,
      data.status,
      data.subtotalCents,
      data.platformFeeCents,
      data.processingFeeCents,
      data.taxCents,
      data.discountCents,
      data.totalCents,
      data.currency,
      data.idempotencyKey,
      data.reservationExpiresAt,
      JSON.stringify(data.metadata || {}),
    ];

    try {
      const result = await this.pool.query(query, values);
      return this.mapToOrder(result.rows[0]);
    } catch (error) {
      logger.error('Error creating order', { error, data });
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2';
    const result = await this.pool.query(query, [id, tenantId]);
    return result.rows[0] ? this.mapToOrder(result.rows[0]) : null;
  }


  async findByUserId(userId: string, tenantId: string, limit = 50, offset = 0): Promise<Order[]> {
    const query = `
      SELECT * FROM orders
      WHERE user_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;
    const result = await this.pool.query(query, [userId, tenantId, limit, offset]);
    return result.rows.map((row) => this.mapToOrder(row));
  }

  async findByIdempotencyKey(idempotencyKey: string, tenantId: string): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE idempotency_key = $1 AND tenant_id = $2';
    const result = await this.pool.query(query, [idempotencyKey, tenantId]);
    return result.rows[0] ? this.mapToOrder(result.rows[0]) : null;
  }

  async findByPaymentIntentId(paymentIntentId: string, tenantId: string): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE payment_intent_id = $1 AND tenant_id = $2';
    const result = await this.pool.query(query, [paymentIntentId, tenantId]);
    return result.rows[0] ? this.mapToOrder(result.rows[0]) : null;
  }

  async findExpiredReservations(tenantId: string, limit = 100): Promise<Order[]> {
    const query = `
      SELECT * FROM orders
      WHERE tenant_id = $1
      AND status = $2
      AND expires_at <= NOW()
      LIMIT $3
    `;
    const result = await this.pool.query(query, [tenantId, OrderStatus.RESERVED, limit]);
    return result.rows.map((row) => this.mapToOrder(row));
  }

  async findExpiringReservations(tenantId: string, minutesFromNow: number, limit = 100): Promise<Order[]> {
    const query = `
      SELECT * FROM orders
      WHERE tenant_id = $1
      AND status = $2
      AND expires_at > NOW()
      AND expires_at <= NOW() + INTERVAL '${minutesFromNow} minutes'
      LIMIT $3
    `;
    const result = await this.pool.query(query, [tenantId, OrderStatus.RESERVED, limit]);
    return result.rows.map((row) => this.mapToOrder(row));
  }

  async findByEvent(eventId: string, tenantId: string, statuses?: OrderStatus[]): Promise<Order[]> {
    let query = `
      SELECT * FROM orders
      WHERE event_id = $1 AND tenant_id = $2
    `;
    
    const values: any[] = [eventId, tenantId];
    
    if (statuses && statuses.length > 0) {
      query += ` AND status = ANY($3)`;
      values.push(statuses);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapToOrder(row));
  }

  async update(
    id: string,
    data: Partial<{
      status: OrderStatus;
      paymentIntentId: string;
      reservationExpiresAt: Date | null;
      confirmedAt: Date | null;
      cancelledAt: Date | null;
      refundedAt: Date | null;
      metadata: Record<string, any>;
    }>
  ): Promise<Order | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 2;

    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.paymentIntentId !== undefined) {
      fields.push(`payment_intent_id = $${paramIndex++}`);
      values.push(data.paymentIntentId);
    }
    if (data.reservationExpiresAt !== undefined) {
      fields.push(`expires_at = $${paramIndex++}`);
      values.push(data.reservationExpiresAt);
    }
    if (data.confirmedAt !== undefined) {
      fields.push(`confirmed_at = $${paramIndex++}`);
      values.push(data.confirmedAt);
    }
    if (data.cancelledAt !== undefined) {
      fields.push(`cancelled_at = $${paramIndex++}`);
      values.push(data.cancelledAt);
    }
    if (data.refundedAt !== undefined) {
      fields.push(`refunded_at = $${paramIndex++}`);
      values.push(data.refundedAt);
    }
    if (data.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      return existing;
    }

    const query = `
      UPDATE orders
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [id, ...values]);
      return result.rows[0] ? this.mapToOrder(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error updating order', { error, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapToOrder(row: any): Order {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      eventId: row.event_id,
      orderNumber: row.order_number,
      status: row.status as OrderStatus,
      subtotalCents: parseInt(row.subtotal_cents),
      platformFeeCents: parseInt(row.platform_fee_cents),
      processingFeeCents: parseInt(row.processing_fee_cents),
      taxCents: parseInt(row.tax_cents),
      discountCents: parseInt(row.discount_cents),
      totalCents: parseInt(row.totalCents),
      currency: row.currency,
      paymentIntentId: row.payment_intent_id,
      idempotencyKey: row.idempotency_key,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
      refundedAt: row.refunded_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
