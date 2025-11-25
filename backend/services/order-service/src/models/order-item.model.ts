import { Pool } from 'pg';
import { OrderItem } from '../types/order.types';
import { logger } from '../utils/logger';

export class OrderItemModel {
  constructor(private pool: Pool) {}

  private mapRow(row: any): OrderItem {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      ticketTypeId: row.ticket_type_id,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      totalPriceCents: row.total_price_cents,
      createdAt: row.created_at,
    };
  }

  async create(data: {
    tenantId: string;
    orderId: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }): Promise<OrderItem> {
    const result = await this.pool.query(
      `INSERT INTO order_items (tenant_id, order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.tenantId, data.orderId, data.ticketTypeId, data.quantity, data.unitPriceCents, data.totalPriceCents]
    );

    return this.mapRow(result.rows[0]);
  }

  async createBulk(orderId: string, tenantId: string, items: Array<{
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>): Promise<OrderItem[]> {
    try {
      const values = items.map(item => [
        tenantId,
        orderId,
        item.ticketTypeId,
        item.quantity,
        item.unitPriceCents,
        item.totalPriceCents,
      ]);

      const placeholders = values.map((_, i) => {
        const offset = i * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(', ');

      const flatValues = values.flat();

      const result = await this.pool.query(
        `INSERT INTO order_items (tenant_id, order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents)
         VALUES ${placeholders}
         RETURNING *`,
        flatValues
      );

      return result.rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Error creating order items', { error, orderId, items });
      throw error;
    }
  }

  async findByOrderId(orderId: string, tenantId: string): Promise<OrderItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM order_items WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at`,
      [orderId, tenantId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async findById(id: string, tenantId: string): Promise<OrderItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM order_items WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }
}
