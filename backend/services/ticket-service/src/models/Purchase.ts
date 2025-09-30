import { Pool } from 'pg';

export interface IPurchase {
  id?: string;
  order_id: string;
  user_id: string;
  ticket_ids: string[];
  amount: number;
  payment_method?: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed';
  created_at?: Date;
  completed_at?: Date;
}

export class PurchaseModel {
  constructor(private pool: Pool) {}

  // SECURITY: Whitelist of allowed update fields
  private readonly UPDATABLE_FIELDS = [
    'order_id',
    'user_id',
    'ticket_ids',
    'amount',
    'payment_method',
    'status',
    'completed_at'
  ];

  async create(data: IPurchase): Promise<IPurchase> {
    const query = `
      INSERT INTO purchases (order_id, user_id, ticket_ids, amount, payment_method, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.order_id, data.user_id, data.ticket_ids,
      data.amount, data.payment_method, data.status || 'initiated'
    ];
    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByOrderId(orderId: string): Promise<IPurchase | null> {
    const query = 'SELECT * FROM purchases WHERE order_id = $1';
    const result = await this.pool.query(query, [orderId]);
    return result.rows[0] || null;
  }

  async update(id: string, data: Partial<IPurchase>): Promise<IPurchase | null> {
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
    const query = `UPDATE purchases SET ${fields} WHERE id = $1 RETURNING *`;
    const values = [id, ...validValues];
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }
}

export default PurchaseModel;
