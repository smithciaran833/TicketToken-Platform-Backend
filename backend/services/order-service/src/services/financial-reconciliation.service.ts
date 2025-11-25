import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  FinancialTransaction,
  ReconciliationReport,
  Discrepancy,
  ExternalTransaction,
} from '../types/report.types';

export class FinancialReconciliationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Import payment transactions from external source
   */
  async importPaymentTransactions(tenantId: string, transactions: ExternalTransaction[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const transaction of transactions) {
        const query = `
          INSERT INTO financial_transactions (
            tenant_id, external_transaction_id, payment_provider, transaction_type,
            amount_cents, currency, status, transaction_date, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (tenant_id, external_transaction_id) 
          DO UPDATE SET
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `;

        await client.query(query, [
          tenantId,
          transaction.externalTransactionId,
          transaction.paymentProvider,
          transaction.transactionType,
          transaction.amountCents,
          transaction.currency,
          transaction.status,
          transaction.transactionDate,
          transaction.metadata || {},
        ]);
      }

      await client.query('COMMIT');

      logger.info('Imported payment transactions', { tenantId, count: transactions.length });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error importing payment transactions', { error, tenantId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Match orders to transactions and generate reconciliation report
   */
  async matchOrdersToTransactions(tenantId: string, date: Date): Promise<ReconciliationReport> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get order totals
      const orderQuery = `
        SELECT 
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_orders_cents
        FROM orders
        WHERE tenant_id = $1
          AND confirmed_at >= $2
          AND confirmed_at <= $3
          AND status IN ('CONFIRMED', 'COMPLETED')
      `;

      const orderResult = await client.query(orderQuery, [tenantId, startDate, endDate]);

      // Get transaction totals
      const transactionQuery = `
        SELECT 
          COUNT(*) as transaction_count,
          COALESCE(SUM(amount_cents), 0) as total_transactions_cents
        FROM financial_transactions
        WHERE tenant_id = $1
          AND transaction_date >= $2
          AND transaction_date <= $3
          AND transaction_type = 'CHARGE'
          AND status = 'COMPLETED'
      `;

      const transactionResult = await client.query(transactionQuery, [tenantId, startDate, endDate]);

      const orderCount = parseInt(orderResult.rows[0].order_count, 10);
      const totalOrdersCents = parseInt(orderResult.rows[0].total_orders_cents, 10);
      const totalTransactionsCents = parseInt(transactionResult.rows[0].total_transactions_cents, 10);

      const discrepancyCents = totalOrdersCents - totalTransactionsCents;
      const discrepancyPercentage = totalOrdersCents > 0 
        ? Math.abs((discrepancyCents / totalOrdersCents) * 100) 
        : 0;

      // Create reconciliation report
      const reportQuery = `
        INSERT INTO reconciliation_reports (
          tenant_id, report_date, total_orders_cents, total_transactions_cents,
          matched_orders_count, unmatched_orders_count, discrepancy_cents, discrepancy_percentage,
          status
        )
        VALUES ($1, $2, $3, $4, 0, 0, $5, $6, 'PENDING')
        RETURNING *
      `;

      const reportResult = await client.query(reportQuery, [
        tenantId,
        date,
        totalOrdersCents,
        totalTransactionsCents,
        discrepancyCents,
        discrepancyPercentage,
      ]);

      await client.query('COMMIT');

      logger.info('Created reconciliation report', { tenantId, date });

      const report = this.mapToReconciliationReport(reportResult.rows[0]);
      report.discrepancies = await this.detectDiscrepancies(tenantId, date);

      return report;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error matching orders to transactions', { error, tenantId, date });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Detect discrepancies between orders and transactions
   */
  async detectDiscrepancies(tenantId: string, date: Date): Promise<Discrepancy[]> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    try {
      // Find orders without matching transactions
      const query = `
        SELECT
          o.id as order_id,
          o.total_cents as expected_amount_cents,
          'MISSING_TRANSACTION' as discrepancy_type
        FROM orders o
        LEFT JOIN financial_transactions ft ON ft.order_id = o.id AND ft.transaction_type = 'CHARGE'
        WHERE o.tenant_id = $1
          AND o.confirmed_at >= $2
          AND o.confirmed_at <= $3
          AND o.status IN ('CONFIRMED', 'COMPLETED')
          AND ft.id IS NULL
      `;

      const result = await this.pool.query(query, [tenantId, startDate, endDate]);

      return result.rows.map((row) => ({
        id: '',
        tenantId,
        reconciliationReportId: '',
        discrepancyType: row.discrepancy_type,
        orderId: row.order_id,
        transactionId: null,
        expectedAmountCents: parseInt(row.expected_amount_cents, 10),
        actualAmountCents: 0,
        differenceCents: parseInt(row.expected_amount_cents, 10),
        status: 'OPEN',
        resolution: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    } catch (error) {
      logger.error('Error detecting discrepancies', { error, tenantId, date });
      throw error;
    }
  }

  /**
   * Resolve a discrepancy
   */
  async resolveDiscrepancy(tenantId: string, discrepancyId: string, resolution: string): Promise<void> {
    try {
      const query = `
        UPDATE reconciliation_discrepancies
        SET status = 'RESOLVED',
            resolution = $1,
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $2
          AND id = $3
      `;

      await this.pool.query(query, [resolution, tenantId, discrepancyId]);

      logger.info('Resolved discrepancy', { tenantId, discrepancyId });
    } catch (error) {
      logger.error('Error resolving discrepancy', { error, tenantId, discrepancyId });
      throw error;
    }
  }

  /**
   * Generate daily reconciliation report
   */
  async generateDailyReconciliation(tenantId: string, date: Date): Promise<ReconciliationReport> {
    return this.matchOrdersToTransactions(tenantId, date);
  }

  /**
   * Get unreconciled orders
   */
  async getUnreconciledOrders(tenantId: string, days: number): Promise<any[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const query = `
        SELECT o.*
        FROM orders o
        LEFT JOIN financial_transactions ft ON ft.order_id = o.id AND ft.transaction_type = 'CHARGE'
        WHERE o.tenant_id = $1
          AND o.confirmed_at >= $2
          AND o.status IN ('CONFIRMED', 'COMPLETED')
          AND ft.id IS NULL
        ORDER BY o.confirmed_at DESC
      `;

      const result = await this.pool.query(query, [tenantId, cutoffDate]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting unreconciled orders', { error, tenantId, days });
      throw error;
    }
  }

  /**
   * Map database row to ReconciliationReport
   */
  private mapToReconciliationReport(row: any): ReconciliationReport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      reportDate: row.report_date,
      totalOrdersCents: parseInt(row.total_orders_cents, 10),
      totalTransactionsCents: parseInt(row.total_transactions_cents, 10),
      matchedOrdersCount: parseInt(row.matched_orders_count, 10),
      unmatchedOrdersCount: parseInt(row.unmatched_orders_count, 10),
      discrepancyCents: parseInt(row.discrepancy_cents, 10),
      discrepancyPercentage: parseFloat(row.discrepancy_percentage),
      status: row.status,
      discrepancies: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
