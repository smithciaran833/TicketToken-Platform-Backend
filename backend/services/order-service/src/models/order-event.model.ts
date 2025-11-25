import { Pool } from 'pg';
import { OrderEvent, OrderEventType } from '../types';
import { logger } from '../utils/logger';

export class OrderEventModel {
  constructor(private pool: Pool) {}

  async create(data: {
    orderId: string;
    tenantId: string;
    eventType: OrderEventType;
    userId?: string;
    metadata?: Record<string, any>;
  }): Promise<OrderEvent> {
    const query = `
      INSERT INTO order_events (tenant_id, order_id, event_type, user_id, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      data.tenantId,
      data.orderId,
      data.eventType,
      data.userId,
      JSON.stringify(data.metadata || {}),
    ];

    try {
      const result = await this.pool.query(query, values);
      return this.mapToOrderEvent(result.rows[0]);
    } catch (error) {
      logger.error('Error creating order event', { error, data });
      throw error;
    }
  }

  async findByOrderId(orderId: string, tenantId: string): Promise<OrderEvent[]> {
    const query = 'SELECT * FROM order_events WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC';
    const result = await this.pool.query(query, [orderId, tenantId]);
    return result.rows.map(this.mapToOrderEvent);
  }

  private mapToOrderEvent(row: any): OrderEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      eventType: row.event_type as OrderEventType,
      userId: row.user_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}
