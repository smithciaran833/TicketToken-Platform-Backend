/**
 * Payment Analytics Dashboard Service
 * FIXED: Aligned with actual payment_transactions schema
 */

import { Pool } from 'pg';
import { SafeLogger } from '../utils/pci-log-scrubber.util';
import { cacheService } from './cache.service';

const logger = new SafeLogger('PaymentAnalyticsService');

export interface PaymentInsights {
  overview: OverviewMetrics;
  trends: TrendData[];
  breakdown: PaymentBreakdown;
  performance: PerformanceMetrics;
}

export interface OverviewMetrics {
  totalTransactions: number;
  totalRevenueCents: number;
  successRate: number;
  averageTransactionCents: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface TrendData {
  date: string;
  transactionCount: number;
  revenueCents: number;
  successRate: number;
}

export interface PaymentBreakdown {
  byMethod: Array<{ method: string; count: number; revenueCents: number }>;
  byStatus: Array<{ status: string; count: number; revenueCents: number }>;
  byType: Array<{ type: string; count: number; revenueCents: number }>;
}

export interface PerformanceMetrics {
  avgProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  p99ProcessingTimeMs: number;
  errorRate: number;
  timeoutRate: number;
}

export class PaymentAnalyticsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getPaymentInsights(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PaymentInsights> {
    const cacheKey = `analytics:insights:${tenantId}:${startDate.toISOString()}:${endDate.toISOString()}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        const [overview, trends, breakdown, performance] = await Promise.all([
          this.getOverviewMetrics(tenantId, startDate, endDate),
          this.getTrendData(tenantId, startDate, endDate),
          this.getPaymentBreakdown(tenantId, startDate, endDate),
          this.getPerformanceMetrics(tenantId, startDate, endDate),
        ]);

        return { overview, trends, breakdown, performance };
      },
      600
    );
  }

  private async getOverviewMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<OverviewMetrics> {
    // FIXED: Use 'amount' instead of 'amount_cents', convert to cents
    const query = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount * 100) as total_revenue_cents,
        AVG(amount * 100) as avg_transaction_cents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT /
          NULLIF(COUNT(*), 0) as success_rate
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    return {
      totalTransactions: parseInt(row.total_transactions) || 0,
      totalRevenueCents: parseInt(row.total_revenue_cents) || 0,
      successRate: parseFloat(row.success_rate) || 0,
      averageTransactionCents: Math.round(parseFloat(row.avg_transaction_cents)) || 0,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  private async getTrendData(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TrendData[]> {
    // FIXED: Use 'amount' instead of 'amount_cents'
    const query = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(amount * 100) as revenue_cents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT /
          NULLIF(COUNT(*), 0) as success_rate
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    return result.rows.map((row) => ({
      date: row.date,
      transactionCount: parseInt(row.transaction_count),
      revenueCents: parseInt(row.revenue_cents),
      successRate: parseFloat(row.success_rate),
    }));
  }

  private async getPaymentBreakdown(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PaymentBreakdown> {
    // FIXED: payment_method doesn't exist, use type instead
    // Also removed byVenueTier since venues.tier doesn't exist
    const typeQuery = `
      SELECT type, COUNT(*) as count, SUM(amount * 100) as revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY type ORDER BY count DESC
    `;

    const statusQuery = `
      SELECT status, COUNT(*) as count, SUM(amount * 100) as revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY status ORDER BY count DESC
    `;

    // For payment method, we'll extract from metadata if available
    const methodQuery = `
      SELECT 
        COALESCE(metadata->>'payment_method', 'unknown') as method,
        COUNT(*) as count,
        SUM(amount * 100) as revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY method ORDER BY count DESC
    `;

    const [typeResult, statusResult, methodResult] = await Promise.all([
      this.pool.query(typeQuery, [tenantId, startDate, endDate]),
      this.pool.query(statusQuery, [tenantId, startDate, endDate]),
      this.pool.query(methodQuery, [tenantId, startDate, endDate]),
    ]);

    return {
      byMethod: methodResult.rows.map((row) => ({
        method: row.method,
        count: parseInt(row.count),
        revenueCents: parseInt(row.revenue_cents),
      })),
      byStatus: statusResult.rows.map((row) => ({
        status: row.status,
        count: parseInt(row.count),
        revenueCents: parseInt(row.revenue_cents),
      })),
      byType: typeResult.rows.map((row) => ({
        type: row.type,
        count: parseInt(row.count),
        revenueCents: parseInt(row.revenue_cents),
      })),
    };
  }

  private async getPerformanceMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceMetrics> {
    // FIXED: completed_at doesn't exist, use updated_at - created_at
    // Also removed timeout status check (doesn't exist in schema)
    const query = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_processing_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as p95_processing_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as p99_processing_ms,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) as error_rate
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    return {
      avgProcessingTimeMs: Math.round(parseFloat(row.avg_processing_ms) || 0),
      p95ProcessingTimeMs: Math.round(parseFloat(row.p95_processing_ms) || 0),
      p99ProcessingTimeMs: Math.round(parseFloat(row.p99_processing_ms) || 0),
      errorRate: parseFloat(row.error_rate) || 0,
      timeoutRate: 0, // Not available in schema
    };
  }

  async getRealtimeActivity(tenantId: string): Promise<any> {
    const cacheKey = `analytics:realtime:${tenantId}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        // FIXED: Use 'amount' instead of 'amount_cents'
        const query = `
          SELECT
            DATE_TRUNC('minute', created_at) as minute,
            COUNT(*) as count,
            SUM(amount * 100) as revenue_cents,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful
          FROM payment_transactions
          WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
          GROUP BY minute ORDER BY minute DESC
        `;

        const result = await this.pool.query(query, [tenantId]);

        return result.rows.map((row) => ({
          timestamp: row.minute,
          count: parseInt(row.count),
          revenueCents: parseInt(row.revenue_cents),
          successCount: parseInt(row.successful),
        }));
      },
      60
    );
  }

  async getTopVenues(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    // FIXED: Join on correct column (id, not venue_id)
    const query = `
      SELECT
        v.id as venue_id, v.name as venue_name,
        COUNT(pt.*) as transaction_count,
        SUM(pt.amount * 100) as total_revenue_cents,
        AVG(pt.amount * 100) as avg_transaction_cents
      FROM payment_transactions pt
      JOIN venues v ON pt.venue_id = v.id
      WHERE pt.tenant_id = $1 AND pt.created_at BETWEEN $2 AND $3 AND pt.status = 'completed'
      GROUP BY v.id, v.name
      ORDER BY total_revenue_cents DESC LIMIT $4
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate, limit]);

    return result.rows.map((row) => ({
      venueId: row.venue_id,
      venueName: row.venue_name,
      transactionCount: parseInt(row.transaction_count),
      totalRevenueCents: parseInt(row.total_revenue_cents),
      avgTransactionCents: Math.round(parseFloat(row.avg_transaction_cents)),
    }));
  }

  async getFailureAnalysis(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    // FIXED: error_code and error_message don't exist, extract from metadata
    const query = `
      SELECT 
        metadata->>'error_code' as error_code,
        metadata->>'error_message' as error_message,
        metadata->>'payment_method' as payment_method,
        COUNT(*) as count,
        SUM(amount * 100) as failed_revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND status = 'failed'
      GROUP BY error_code, error_message, payment_method
      ORDER BY count DESC LIMIT 20
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    return result.rows.map((row) => ({
      errorCode: row.error_code || 'unknown',
      errorMessage: row.error_message || 'No error message',
      paymentMethod: row.payment_method || 'unknown',
      count: parseInt(row.count),
      failedRevenueCents: parseInt(row.failed_revenue_cents),
    }));
  }

  async exportAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    // FIXED: Use 'id' instead of 'transaction_id', 'amount' instead of 'amount_cents'
    const query = `
      SELECT id, created_at, amount, status, type, venue_id, user_id
      FROM payment_transactions
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    const headers = ['Transaction ID', 'Date', 'Amount (cents)', 'Status', 'Type', 'Venue ID', 'User ID'];
    const rows = result.rows.map((row) => [
      row.id,
      row.created_at.toISOString(),
      Math.round(parseFloat(row.amount) * 100), // Convert to cents
      row.status,
      row.type,
      row.venue_id || '',
      row.user_id || '',
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    logger.info({ tenantId, rowCount: rows.length }, 'Analytics exported');

    return csv;
  }
}
