import { query, getClient } from '../config/database';
import { Transaction, TransactionStatus } from '../types/payment.types';

export class TransactionModel {
  static async create(data: Partial<Transaction> & { idempotencyKey?: string; tenantId?: string }): Promise<Transaction> {
    const text = `
      INSERT INTO transactions (
        venue_id, user_id, event_id, amount, currency, status,
        platform_fee, venue_payout, gas_fee_paid, tax_amount, total_amount,
        stripe_payment_intent_id, metadata, idempotency_key, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      data.venueId,
      data.userId,
      data.eventId,
      data.amount || 0,
      data.currency || 'USD',
      data.status || TransactionStatus.PENDING,
      data.platformFee || 0,
      data.venuePayout || 0,
      data.gasFeePaid || null,
      data.taxAmount || null,
      data.totalAmount || null,
      data.stripePaymentIntentId || null,
      JSON.stringify(data.metadata || {}),
      data.idempotencyKey || null,
      data.tenantId || null
    ];

    try {
      const result = await query(text, values);
      return this.mapRow(result.rows[0]);
    } catch (error: any) {
      // Handle duplicate idempotency key
      if (error.code === '23505' && error.constraint === 'uq_transactions_idempotency') {
        throw new Error('DUPLICATE_IDEMPOTENCY_KEY');
      }
      throw error;
    }
  }

  static async findById(id: string): Promise<Transaction | null> {
    const text = `
      SELECT * FROM transactions WHERE id = $1
    `;

    const result = await query(text, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  static async findByPaymentIntentId(paymentIntentId: string): Promise<Transaction | null> {
    const text = `
      SELECT * FROM transactions WHERE stripe_payment_intent_id = $1
    `;

    const result = await query(text, [paymentIntentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  static async updateStatus(id: string, status: TransactionStatus): Promise<Transaction> {
    const text = `
      UPDATE transactions
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(text, [id, status]);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  static async update(id: string, data: Partial<Transaction>): Promise<Transaction> {
    // SECURITY NOTE: Building parameterized query safely
    // The paramIndex is only used to create placeholder numbers ($1, $2, etc.)
    // The actual values are passed separately in the values array
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.amount !== undefined) {
      updates.push(`amount = $${paramIndex++}`);
      values.push(data.amount);
    }

    if (data.platformFee !== undefined) {
      updates.push(`platform_fee = $${paramIndex++}`);
      values.push(data.platformFee);
    }

    if (data.venuePayout !== undefined) {
      updates.push(`venue_payout = $${paramIndex++}`);
      values.push(data.venuePayout);
    }

    if (data.gasFeePaid !== undefined) {
      updates.push(`gas_fee_paid = $${paramIndex++}`);
      values.push(data.gasFeePaid);
    }

    if (data.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    // SECURITY: This query is parameterized - the values are in the values array
    // The ${updates.join(', ')} only contains column names and parameter placeholders
    const text = `
      UPDATE transactions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(text, values);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  static async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT * FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [userId, limit, offset]);
    return result.rows.map(row => this.mapRow(row));
  }

  static async findByVenueId(
    venueId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT * FROM transactions
      WHERE venue_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [venueId, limit, offset]);
    return result.rows.map(row => this.mapRow(row));
  }

  private static mapRow(row: any): Transaction {
    return {
      id: row.id,
      venueId: row.venue_id,
      userId: row.user_id,
      eventId: row.event_id,
      amount: parseInt(row.amount),
      currency: row.currency,
      status: row.status as TransactionStatus,
      platformFee: parseInt(row.platform_fee),
      venuePayout: parseInt(row.venue_payout),
      gasFeePaid: row.gas_fee_paid ? parseInt(row.gas_fee_paid) : undefined,
      taxAmount: row.tax_amount ? parseInt(row.tax_amount) : undefined,
      totalAmount: row.total_amount ? parseInt(row.total_amount) : undefined,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
