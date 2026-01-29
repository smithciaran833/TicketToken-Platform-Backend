import { query, getClient } from '../config/database';
import { Transaction, TransactionStatus, TransactionType } from '../types/payment.types';

/**
 * SECURITY: Explicit field lists to prevent SELECT * from returning sensitive data.
 * This is defense-in-depth - controllers should also use serializers.
 */

// Fields safe for external/public queries
const SAFE_TRANSACTION_FIELDS = [
  'id',
  'tenant_id',
  'venue_id',
  'user_id',
  'event_id',
  'order_id',
  'type',
  'amount',
  'currency',
  'status',
  'description',
  'tax_amount',
  'total_amount',
  'created_at',
  'updated_at',
].join(', ');

// All fields for internal/admin queries (e.g., refund processing needs stripe_payment_intent_id)
const ALL_TRANSACTION_FIELDS = [
  'id',
  'tenant_id',
  'venue_id',
  'user_id',
  'event_id',
  'order_id',
  'type',
  'amount',
  'currency',
  'status',
  'description',
  'tax_amount',
  'total_amount',
  'platform_fee',
  'venue_payout',
  'gas_fee_paid',
  'stripe_payment_intent_id',
  'stripe_charge_id',
  'metadata',
  'idempotency_key',
  'created_at',
  'updated_at',
].join(', ');

// Fields to return after INSERT/UPDATE (internal operations need all fields)
const RETURNING_FIELDS = ALL_TRANSACTION_FIELDS;

export class TransactionModel {
  /**
   * Create a new transaction.
   * INTERNAL USE: Returns full transaction including stripe IDs for service layer use.
   */
  static async create(data: Partial<Transaction> & { idempotencyKey?: string; tenantId?: string }): Promise<Transaction> {
    const text = `
      INSERT INTO payment_transactions (
        venue_id, user_id, event_id, type, amount, currency, status,
        platform_fee, venue_payout, gas_fee_paid, tax_amount, total_amount,
        stripe_payment_intent_id, metadata, idempotency_key, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING ${RETURNING_FIELDS}
    `;

    const values = [
      data.venueId,
      data.userId,
      data.eventId,
      data.type || TransactionType.TICKET_PURCHASE,
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
      return this.mapRowFull(result.rows[0]);
    } catch (error: any) {
      // Handle duplicate idempotency key
      if (error.code === '23505' && error.constraint === 'uq_payment_transactions_idempotency') {
        throw new Error('DUPLICATE_IDEMPOTENCY_KEY');
      }
      throw error;
    }
  }

  /**
   * Find transaction by ID - PUBLIC version with safe fields only.
   * Use findByIdInternal() if you need stripe IDs or fee data.
   */
  static async findById(id: string): Promise<Transaction | null> {
    const text = `
      SELECT ${SAFE_TRANSACTION_FIELDS} FROM payment_transactions WHERE id = $1
    `;

    const result = await query(text, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowSafe(result.rows[0]);
  }

  /**
   * Find transaction by ID - INTERNAL version with all fields.
   * Use this when you need stripe_payment_intent_id for refunds, etc.
   */
  static async findByIdInternal(id: string): Promise<Transaction | null> {
    const text = `
      SELECT ${ALL_TRANSACTION_FIELDS} FROM payment_transactions WHERE id = $1
    `;

    const result = await query(text, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Find by Stripe Payment Intent ID.
   * INTERNAL USE ONLY: This method is for payment processing and refunds.
   */
  static async findByPaymentIntentId(paymentIntentId: string): Promise<Transaction | null> {
    const text = `
      SELECT ${ALL_TRANSACTION_FIELDS} FROM payment_transactions WHERE stripe_payment_intent_id = $1
    `;

    const result = await query(text, [paymentIntentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Update transaction status.
   * INTERNAL USE: Returns full transaction for service layer.
   */
  static async updateStatus(id: string, status: TransactionStatus): Promise<Transaction> {
    const text = `
      UPDATE payment_transactions
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${RETURNING_FIELDS}
    `;

    const result = await query(text, [id, status]);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Update transaction fields.
   * INTERNAL USE: Returns full transaction for service layer.
   */
  static async update(id: string, data: Partial<Transaction>): Promise<Transaction> {
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

    const text = `
      UPDATE payment_transactions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING ${RETURNING_FIELDS}
    `;

    const result = await query(text, values);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Find transactions by user ID - PUBLIC version with safe fields.
   */
  static async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT ${SAFE_TRANSACTION_FIELDS} FROM payment_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [userId, limit, offset]);
    return result.rows.map(row => this.mapRowSafe(row));
  }

  /**
   * Find transactions by venue ID - PUBLIC version with safe fields.
   */
  static async findByVenueId(
    venueId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT ${SAFE_TRANSACTION_FIELDS} FROM payment_transactions
      WHERE venue_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [venueId, limit, offset]);
    return result.rows.map(row => this.mapRowSafe(row));
  }

  /**
   * Maps a database row to Transaction type - SAFE version.
   * Excludes sensitive fields like stripe IDs, fees, fingerprints.
   */
  private static mapRowSafe(row: any): Transaction {
    return {
      id: row.id,
      venueId: row.venue_id,
      userId: row.user_id,
      eventId: row.event_id,
      type: row.type as TransactionType,
      amount: parseInt(row.amount),
      currency: row.currency,
      status: row.status as TransactionStatus,
      // Safe fields only - no fees, no stripe IDs
      platformFee: 0, // Hidden
      venuePayout: 0, // Hidden
      gasFeePaid: undefined,
      taxAmount: row.tax_amount ? parseInt(row.tax_amount) : undefined,
      totalAmount: row.total_amount ? parseInt(row.total_amount) : undefined,
      stripePaymentIntentId: undefined, // Hidden
      metadata: {}, // Hidden - return empty object for type compliance
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Maps a database row to Transaction type - FULL version.
   * INTERNAL USE ONLY: Includes all fields for service layer operations.
   */
  private static mapRowFull(row: any): Transaction {
    return {
      id: row.id,
      venueId: row.venue_id,
      userId: row.user_id,
      eventId: row.event_id,
      type: row.type as TransactionType,
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
