/**
 * Financial Transaction Log Service
 * 
 * Comprehensive logging of all financial transactions for compliance and auditing.
 * Tracks payments, refunds, chargebacks, fees, and currency exchanges.
 * 
 * Compliance: PCI DSS, SOX, GDPR
 * Retention: 7 years minimum for financial records
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { FinancialTransactionLog } from '../types/audit.types';

export class FinancialTransactionLogService {
  constructor(private db: Pool) {}

  /**
   * Log a financial transaction
   */
  async logTransaction(params: {
    tenant_id: string;
    order_id?: string;
    transaction_id: string;
    external_transaction_id?: string;
    payment_processor: string;
    transaction_type: 'PAYMENT' | 'REFUND' | 'CHARGEBACK' | 'FEE' | 'ADJUSTMENT';
    payment_method: string;
    amount_cents: number;
    currency: string;
    status: string;
    
    // Fee breakdown
    platform_fee_cents?: number;
    processing_fee_cents?: number;
    tax_cents?: number;
    net_amount_cents?: number;
    
    // Currency exchange
    original_currency?: string;
    original_amount_cents?: number;
    exchange_rate?: number;
    exchange_rate_date?: Date;
    
    // Approval chain
    initiated_by?: string;
    approved_by?: string;
    approved_at?: Date;
    approval_reason?: string;
    
    // Risk assessment
    fraud_score?: number;
    risk_level?: string;
    requires_manual_review?: boolean;
    is_flagged?: boolean;
    
    // Additional data
    payment_details?: Record<string, any>;
    processor_response?: Record<string, any>;
    notes?: string;
    
    transaction_date?: Date;
  }): Promise<FinancialTransactionLog> {
    try {
      const result = await this.db.query<FinancialTransactionLog>(
        `INSERT INTO financial_transaction_logs (
          tenant_id, order_id, transaction_id, external_transaction_id, payment_processor,
          transaction_type, payment_method, amount_cents, currency, status,
          platform_fee_cents, processing_fee_cents, tax_cents, net_amount_cents,
          original_currency, original_amount_cents, exchange_rate, exchange_rate_date,
          initiated_by, approved_by, approved_at, approval_reason,
          fraud_score, risk_level, requires_manual_review, is_flagged,
          payment_details, processor_response, notes, transaction_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26,
          $27, $28, $29, $30
        ) RETURNING *`,
        [
          params.tenant_id,
          params.order_id,
          params.transaction_id,
          params.external_transaction_id,
          params.payment_processor,
          params.transaction_type,
          params.payment_method,
          params.amount_cents,
          params.currency,
          params.status,
          params.platform_fee_cents,
          params.processing_fee_cents,
          params.tax_cents,
          params.net_amount_cents,
          params.original_currency,
          params.original_amount_cents,
          params.exchange_rate,
          params.exchange_rate_date,
          params.initiated_by,
          params.approved_by,
          params.approved_at,
          params.approval_reason,
          params.fraud_score,
          params.risk_level,
          params.requires_manual_review || false,
          params.is_flagged || false,
          params.payment_details ? JSON.stringify(params.payment_details) : null,
          params.processor_response ? JSON.stringify(params.processor_response) : null,
          params.notes,
          params.transaction_date || new Date()
        ]
      );

      logger.info('Financial transaction logged', {
        transaction_id: params.transaction_id,
        type: params.transaction_type,
        amount: params.amount_cents,
        currency: params.currency,
        tenant_id: params.tenant_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to log financial transaction', { error, params });
      throw error;
    }
  }

  /**
   * Get transaction logs for an order
   */
  async getOrderTransactions(
    tenant_id: string,
    order_id: string
  ): Promise<FinancialTransactionLog[]> {
    const result = await this.db.query<FinancialTransactionLog>(
      `SELECT * FROM financial_transaction_logs
       WHERE tenant_id = $1 AND order_id = $2
       ORDER BY transaction_date DESC, created_at DESC`,
      [tenant_id, order_id]
    );

    return result.rows;
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(
    tenant_id: string,
    transaction_id: string
  ): Promise<FinancialTransactionLog | null> {
    const result = await this.db.query<FinancialTransactionLog>(
      `SELECT * FROM financial_transaction_logs
       WHERE tenant_id = $1 AND transaction_id = $2`,
      [tenant_id, transaction_id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get transactions requiring manual review
   */
  async getTransactionsRequiringReview(
    tenant_id: string,
    limit: number = 50
  ): Promise<FinancialTransactionLog[]> {
    const result = await this.db.query<FinancialTransactionLog>(
      `SELECT * FROM financial_transaction_logs
       WHERE tenant_id = $1 AND requires_manual_review = true
       ORDER BY transaction_date DESC
       LIMIT $2`,
      [tenant_id, limit]
    );

    return result.rows;
  }

  /**
   * Get flagged transactions
   */
  async getFlaggedTransactions(
    tenant_id: string,
    limit: number = 50
  ): Promise<FinancialTransactionLog[]> {
    const result = await this.db.query<FinancialTransactionLog>(
      `SELECT * FROM financial_transaction_logs
       WHERE tenant_id = $1 AND is_flagged = true
       ORDER BY transaction_date DESC
       LIMIT $2`,
      [tenant_id, limit]
    );

    return result.rows;
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(
    tenant_id: string,
    start_date?: Date,
    end_date?: Date
  ): Promise<{
    total_transactions: number;
    total_amount_cents: number;
    by_type: Record<string, { count: number; total_cents: number }>;
    by_processor: Record<string, { count: number; total_cents: number }>;
    flagged_count: number;
    review_required_count: number;
  }> {
    const conditions = ['tenant_id = $1'];
    const values: any[] = [tenant_id];
    let paramCount = 2;

    if (start_date) {
      conditions.push(`transaction_date >= $${paramCount++}`);
      values.push(start_date);
    }

    if (end_date) {
      conditions.push(`transaction_date <= $${paramCount++}`);
      values.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount_cents), 0) as total_amount_cents,
        COUNT(*) FILTER (WHERE is_flagged = true) as flagged_count,
        COUNT(*) FILTER (WHERE requires_manual_review = true) as review_required_count
      FROM financial_transaction_logs
      ${whereClause}`,
      values
    );

    // Get by type
    const typeResult = await this.db.query(
      `SELECT 
        transaction_type,
        COUNT(*) as count,
        COALESCE(SUM(amount_cents), 0) as total_cents
       FROM financial_transaction_logs
       ${whereClause}
       GROUP BY transaction_type`,
      values
    );

    const byType: Record<string, { count: number; total_cents: number }> = {};
    for (const row of typeResult.rows) {
      byType[row.transaction_type] = {
        count: parseInt(row.count, 10),
        total_cents: parseInt(row.total_cents, 10)
      };
    }

    // Get by processor
    const processorResult = await this.db.query(
      `SELECT 
        payment_processor,
        COUNT(*) as count,
        COALESCE(SUM(amount_cents), 0) as total_cents
       FROM financial_transaction_logs
       ${whereClause}
       GROUP BY payment_processor`,
      values
    );

    const byProcessor: Record<string, { count: number; total_cents: number }> = {};
    for (const row of processorResult.rows) {
      byProcessor[row.payment_processor] = {
        count: parseInt(row.count, 10),
        total_cents: parseInt(row.total_cents, 10)
      };
    }

    return {
      total_transactions: parseInt(result.rows[0].total_transactions, 10),
      total_amount_cents: parseInt(result.rows[0].total_amount_cents, 10),
      by_type: byType,
      by_processor: byProcessor,
      flagged_count: parseInt(result.rows[0].flagged_count, 10),
      review_required_count: parseInt(result.rows[0].review_required_count, 10)
    };
  }

  /**
   * Search transactions
   */
  async searchTransactions(
    tenant_id: string,
    filters: {
      order_id?: string;
      transaction_type?: string;
      payment_processor?: string;
      payment_method?: string;
      status?: string;
      min_amount_cents?: number;
      max_amount_cents?: number;
      start_date?: Date;
      end_date?: Date;
      is_flagged?: boolean;
      requires_manual_review?: boolean;
    },
    limit: number = 100,
    offset: number = 0
  ): Promise<{ transactions: FinancialTransactionLog[]; total: number }> {
    const conditions = ['tenant_id = $1'];
    const values: any[] = [tenant_id];
    let paramCount = 2;

    if (filters.order_id) {
      conditions.push(`order_id = $${paramCount++}`);
      values.push(filters.order_id);
    }

    if (filters.transaction_type) {
      conditions.push(`transaction_type = $${paramCount++}`);
      values.push(filters.transaction_type);
    }

    if (filters.payment_processor) {
      conditions.push(`payment_processor = $${paramCount++}`);
      values.push(filters.payment_processor);
    }

    if (filters.payment_method) {
      conditions.push(`payment_method = $${paramCount++}`);
      values.push(filters.payment_method);
    }

    if (filters.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }

    if (filters.min_amount_cents !== undefined) {
      conditions.push(`amount_cents >= $${paramCount++}`);
      values.push(filters.min_amount_cents);
    }

    if (filters.max_amount_cents !== undefined) {
      conditions.push(`amount_cents <= $${paramCount++}`);
      values.push(filters.max_amount_cents);
    }

    if (filters.start_date) {
      conditions.push(`transaction_date >= $${paramCount++}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`transaction_date <= $${paramCount++}`);
      values.push(filters.end_date);
    }

    if (filters.is_flagged !== undefined) {
      conditions.push(`is_flagged = $${paramCount++}`);
      values.push(filters.is_flagged);
    }

    if (filters.requires_manual_review !== undefined) {
      conditions.push(`requires_manual_review = $${paramCount++}`);
      values.push(filters.requires_manual_review);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM financial_transaction_logs ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const result = await this.db.query<FinancialTransactionLog>(
      `SELECT * FROM financial_transaction_logs ${whereClause}
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      [...values, limit, offset]
    );

    return {
      transactions: result.rows,
      total
    };
  }

  /**
   * Helper: Log payment attempt
   */
  async logPaymentAttempt(params: {
    tenant_id: string;
    order_id: string;
    transaction_id: string;
    external_transaction_id?: string;
    payment_processor: string;
    payment_method: string;
    amount_cents: number;
    currency: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    platform_fee_cents?: number;
    processing_fee_cents?: number;
    tax_cents?: number;
    initiated_by: string;
    fraud_score?: number;
    payment_details?: Record<string, any>;
    processor_response?: Record<string, any>;
  }): Promise<FinancialTransactionLog> {
    const net_amount_cents = 
      params.amount_cents - 
      (params.platform_fee_cents || 0) - 
      (params.processing_fee_cents || 0) - 
      (params.tax_cents || 0);

    return this.logTransaction({
      ...params,
      transaction_type: 'PAYMENT',
      net_amount_cents,
      requires_manual_review: params.status === 'FAILED' || (params.fraud_score && params.fraud_score > 75)
    });
  }

  /**
   * Helper: Log refund
   */
  async logRefund(params: {
    tenant_id: string;
    order_id: string;
    transaction_id: string;
    external_transaction_id?: string;
    payment_processor: string;
    payment_method: string;
    amount_cents: number;
    currency: string;
    status: string;
    approved_by: string;
    approval_reason: string;
    notes?: string;
  }): Promise<FinancialTransactionLog> {
    return this.logTransaction({
      ...params,
      transaction_type: 'REFUND',
      approved_at: new Date()
    });
  }

  /**
   * Helper: Log chargeback
   */
  async logChargeback(params: {
    tenant_id: string;
    order_id: string;
    transaction_id: string;
    external_transaction_id: string;
    payment_processor: string;
    payment_method: string;
    amount_cents: number;
    currency: string;
    status: string;
    notes: string;
  }): Promise<FinancialTransactionLog> {
    return this.logTransaction({
      ...params,
      transaction_type: 'CHARGEBACK',
      is_flagged: true,
      requires_manual_review: true
    });
  }
}
