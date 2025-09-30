import { query } from '../config/database';

export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripeRefundId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
}

export class RefundModel {
  static async create(data: Partial<Refund>): Promise<Refund> {
    const text = `
      INSERT INTO payment_refunds (
        transaction_id, amount, reason, status,
        stripe_refund_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      data.transactionId,
      data.amount,
      data.reason,
      data.status || 'pending',
      data.stripeRefundId,
      JSON.stringify(data.metadata || {})
    ];
    
    const result = await query(text, values);
    return result.rows[0];
  }

  static async updateStatus(id: string, status: string, stripeRefundId?: string): Promise<Refund> {
    const text = `
      UPDATE payment_refunds 
      SET status = $2, 
          stripe_refund_id = COALESCE($3, stripe_refund_id),
          completed_at = CASE WHEN $2 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await query(text, [id, status, stripeRefundId]);
    return result.rows[0];
  }
}
