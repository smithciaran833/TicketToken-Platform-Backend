import { Pool } from 'pg';

export interface IOrder {
  id?: string;
  tenant_id?: string;
  user_id: string;
  event_id: string;
  order_number?: string;
  status: 'PENDING' | 'PAID' | 'AWAITING_MINT' | 'COMPLETED' | 'PAYMENT_FAILED' | 'CANCELLED' | 'EXPIRED' | 'MINT_FAILED';
  subtotal_cents: number;
  platform_fee_cents?: number;
  processing_fee_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  total_cents: number;  // INTEGER cents only
  ticket_quantity: number;
  currency?: string;
  discount_codes?: string[];
  payment_intent_id?: string;
  idempotency_key?: string;
  expires_at?: Date;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class OrderModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'user_id',
    'event_id',
    'status',
    'total_cents',
    'currency',
    'payment_intent_id',
    'metadata'
  ];

  async create(data: IOrder): Promise<IOrder> {
    const query = `
      INSERT INTO orders (
        user_id, event_id, order_number, status, 
        total_cents, currency, ticket_quantity, 
        payment_intent_id, idempotency_key, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const values = [
      data.user_id,
      data.event_id,
      data.order_number || `ORD-${Date.now().toString().slice(-8)}`,
      data.status || 'PENDING',
      data.total_cents,
      data.currency || 'USD',
      data.ticket_quantity,
      data.payment_intent_id,
      data.idempotency_key,
      data.metadata || {}
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IOrder | null> {
    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<IOrder[]> {
    const query = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async update(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
    // SECURITY FIX: Validate fields against whitelist
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
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default OrderModel;
