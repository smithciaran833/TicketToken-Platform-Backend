import { Pool } from 'pg';

export interface IOrder {
  id?: string;
  tenant_id: string;
  user_id: string;
  event_id: string;
  order_number?: string;
  status: 'PENDING' | 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  subtotal_cents: number;
  platform_fee_cents?: number;
  processing_fee_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  total_cents: number;
  currency?: string;
  payment_intent_id?: string;
  payment_status?: string;
  total_amount?: number;
  idempotency_key?: string;
  ticket_quantity: number;
  expires_at?: Date;
  confirmed_at?: Date;
  cancelled_at?: Date;
  refunded_at?: Date;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class OrderModel {
  constructor(private pool: Pool) {}

  private readonly UPDATABLE_FIELDS = [
    'status',
    'total_cents',
    'subtotal_cents',
    'platform_fee_cents',
    'processing_fee_cents',
    'tax_cents',
    'discount_cents',
    'currency',
    'payment_intent_id',
    'payment_status',
    'ticket_quantity',
    'expires_at',
    'confirmed_at',
    'cancelled_at',
    'refunded_at',
    'metadata'
  ];

  private generateOrderNumber(): string {
    return `ORD-${Date.now().toString().slice(-8)}`;
  }

  async create(data: IOrder): Promise<IOrder> {
    const orderNumber = data.order_number || this.generateOrderNumber();

    const query = `
      INSERT INTO orders (
        tenant_id, user_id, event_id, order_number, status,
        subtotal_cents, platform_fee_cents, processing_fee_cents,
        tax_cents, discount_cents, total_cents, currency,
        payment_intent_id, payment_status, idempotency_key,
        ticket_quantity, expires_at, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const values = [
      data.tenant_id,
      data.user_id,
      data.event_id,
      orderNumber,
      data.status || 'PENDING',
      data.subtotal_cents,
      data.platform_fee_cents || 0,
      data.processing_fee_cents || 0,
      data.tax_cents || 0,
      data.discount_cents || 0,
      data.total_cents,
      data.currency || 'USD',
      data.payment_intent_id || null,
      data.payment_status || null,
      data.idempotency_key || null,
      data.ticket_quantity,
      data.expires_at || null,
      data.metadata || null
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToOrder(result.rows[0]);
  }

  async findById(id: string): Promise<IOrder | null> {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.mapRowToOrder(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<IOrder[]> {
    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  async findByOrderNumber(orderNumber: string): Promise<IOrder | null> {
    const query = 'SELECT * FROM orders WHERE order_number = $1';
    const result = await this.pool.query(query, [orderNumber]);
    return result.rows[0] ? this.mapRowToOrder(result.rows[0]) : null;
  }

  async findByEventId(eventId: string): Promise<IOrder[]> {
    const query = 'SELECT * FROM orders WHERE event_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [eventId]);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  async update(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
    const validFields: string[] = [];
    const validValues: any[] = [];

    Object.keys(data).forEach(key => {
      if (this.UPDATABLE_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push((data as any)[key]);
      }
    });

    if (validFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const query = `UPDATE orders SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.mapRowToOrder(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRowToOrder(row: any): IOrder {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      event_id: row.event_id,
      order_number: row.order_number,
      status: row.status,
      subtotal_cents: Number(row.subtotal_cents),
      platform_fee_cents: Number(row.platform_fee_cents),
      processing_fee_cents: Number(row.processing_fee_cents),
      tax_cents: Number(row.tax_cents),
      discount_cents: Number(row.discount_cents),
      total_cents: Number(row.total_cents),
      currency: row.currency,
      payment_intent_id: row.payment_intent_id,
      payment_status: row.payment_status,
      total_amount: row.total_amount ? Number(row.total_amount) : undefined,
      idempotency_key: row.idempotency_key,
      ticket_quantity: row.ticket_quantity,
      expires_at: row.expires_at,
      confirmed_at: row.confirmed_at,
      cancelled_at: row.cancelled_at,
      refunded_at: row.refunded_at,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export default OrderModel;
