import { query } from '../config/database';

export interface Refund {
  id: string;
  tenantId?: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripeRefundId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
  updatedAt?: Date;
}

/**
 * SECURITY: Explicit field lists to prevent RETURNING * from exposing sensitive data.
 */

// Safe fields for external/public responses
const SAFE_REFUND_FIELDS = [
  'id',
  'tenant_id',
  'transaction_id',
  'amount',
  'reason',
  'status',
  'created_at',
  'completed_at',
  'updated_at',
].join(', ');

// All fields for internal use (service layer needs stripe_refund_id for status checks)
const ALL_REFUND_FIELDS = [
  'id',
  'tenant_id',
  'transaction_id',
  'amount',
  'reason',
  'status',
  'stripe_refund_id',
  'metadata',
  'created_at',
  'completed_at',
  'updated_at',
].join(', ');

export class RefundModel {
  /**
   * Create a new refund.
   * INTERNAL USE: Returns full refund including stripe_refund_id for service layer.
   */
  static async create(data: Partial<Refund>): Promise<Refund> {
    const text = `
      INSERT INTO payment_refunds (
        transaction_id, tenant_id, amount, reason, status,
        stripe_refund_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${ALL_REFUND_FIELDS}
    `;

    const values = [
      data.transactionId,
      data.tenantId || null,
      data.amount,
      data.reason,
      data.status || 'pending',
      data.stripeRefundId || null,
      JSON.stringify(data.metadata || {})
    ];

    const result = await query(text, values);
    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Update refund status.
   * INTERNAL USE: Returns full refund for service layer.
   */
  static async updateStatus(id: string, status: string, stripeRefundId?: string): Promise<Refund> {
    const text = `
      UPDATE payment_refunds
      SET status = $2,
          stripe_refund_id = COALESCE($3, stripe_refund_id),
          completed_at = CASE WHEN $4 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${ALL_REFUND_FIELDS}
    `;

    const result = await query(text, [id, status, stripeRefundId || null, status]);
    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Find refund by ID - PUBLIC version with safe fields.
   */
  static async findById(id: string): Promise<Refund | null> {
    const text = `
      SELECT ${SAFE_REFUND_FIELDS} FROM payment_refunds WHERE id = $1
    `;

    const result = await query(text, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowSafe(result.rows[0]);
  }

  /**
   * Find refund by ID - INTERNAL version with all fields.
   */
  static async findByIdInternal(id: string): Promise<Refund | null> {
    const text = `
      SELECT ${ALL_REFUND_FIELDS} FROM payment_refunds WHERE id = $1
    `;

    const result = await query(text, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapRowFull(result.rows[0]);
  }

  /**
   * Find refunds by transaction ID - PUBLIC version.
   */
  static async findByTransactionId(transactionId: string): Promise<Refund[]> {
    const text = `
      SELECT ${SAFE_REFUND_FIELDS} FROM payment_refunds
      WHERE transaction_id = $1
      ORDER BY created_at DESC
    `;

    const result = await query(text, [transactionId]);
    return result.rows.map(row => this.mapRowSafe(row));
  }

  /**
   * Maps a database row to Refund type - SAFE version.
   * Excludes stripe_refund_id and metadata.
   */
  private static mapRowSafe(row: any): Refund {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      transactionId: row.transaction_id,
      amount: typeof row.amount === 'string' ? parseInt(row.amount, 10) : row.amount,
      reason: row.reason,
      status: row.status,
      // Sensitive fields hidden
      stripeRefundId: undefined,
      metadata: undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Maps a database row to Refund type - FULL version.
   * INTERNAL USE ONLY: Includes all fields for service layer.
   */
  private static mapRowFull(row: any): Refund {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      transactionId: row.transaction_id,
      amount: typeof row.amount === 'string' ? parseInt(row.amount, 10) : row.amount,
      reason: row.reason,
      status: row.status,
      stripeRefundId: row.stripe_refund_id,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      updatedAt: row.updated_at,
    };
  }
}
