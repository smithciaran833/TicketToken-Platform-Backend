/**
 * Payment Analytics Dashboard Service
 * Real-time payment insights and reporting
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
  byVenueTier: Array<{ tier: string; count: number; revenueCents: number }>;
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

  /**
   * Get comprehensive payment insights for date range
   */
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

        return {
          overview,
          trends,
          breakdown,
          performance,
        };
      },
      600 // 10 minute cache
    );
  }

  /**
   * Get overview metrics
   */
  private async getOverviewMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<OverviewMetrics> {
    const query = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount_cents) as total_revenue_cents,
        AVG(amount_cents) as avg_transaction_cents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT / 
          NULLIF(COUNT(*), 0) as success_rate
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
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

  /**
   * Get trend data (daily aggregates)
   */
  private async getTrendData(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TrendData[]> {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        SUM(amount_cents) as revenue_cents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT / 
          NULLIF(COUNT(*), 0) as success_rate
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
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

  /**
   * Get payment breakdown by various dimensions
   */
  private async getPaymentBreakdown(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PaymentBreakdown> {
    // By payment method
    const methodQuery = `
      SELECT 
        payment_method as method,
        COUNT(*) as count,
        SUM(amount_cents) as revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY payment_method
      ORDER BY count DESC
    `;

    // By status
    const statusQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount_cents) as revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY status
      ORDER BY count DESC
    `;

    // By venue tier (if available)
    const tierQuery = `
      SELECT 
        COALESCE(v.tier, 'unknown') as tier,
        COUNT(pt.*) as count,
        SUM(pt.amount_cents) as revenue_cents
      FROM payment_transactions pt
      LEFT JOIN venues v ON pt.venue_id = v.venue_id
      WHERE pt.tenant_id = $1
        AND pt.created_at BETWEEN $2 AND $3
      GROUP BY tier
      ORDER BY count DESC
    `;

    const [methodResult, statusResult, tierResult] = await Promise.all([
      this.pool.query(methodQuery, [tenantId, startDate, endDate]),
      this.pool.query(statusQuery, [tenantId, startDate, endDate]),
      this.pool.query(tierQuery, [tenantId, startDate, endDate]),
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
      byVenueTier: tierResult.rows.map((row) => ({
        tier: row.tier,
        count: parseInt(row.count),
        revenueCents: parseInt(row.revenue_cents),
      })),
    };
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceMetrics> {
    const query = `
      SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as avg_processing_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as p95_processing_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as p99_processing_ms,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) as error_rate,
        COUNT(CASE WHEN status = 'timeout' THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) as timeout_rate
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
        AND completed_at IS NOT NULL
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    const row = result.rows[0];

    return {
      avgProcessingTimeMs: Math.round(parseFloat(row.avg_processing_ms) || 0),
      p95ProcessingTimeMs: Math.round(parseFloat(row.p95_processing_ms) || 0),
      p99ProcessingTimeMs: Math.round(parseFloat(row.p99_processing_ms) || 0),
      errorRate: parseFloat(row.error_rate) || 0,
      timeoutRate: parseFloat(row.timeout_rate) || 0,
    };
  }

  /**
   * Get real-time payment activity (last hour)
   */
  async getRealtimeActivity(tenantId: string): Promise<any> {
    const cacheKey = `analytics:realtime:${tenantId}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        const query = `
          SELECT 
            DATE_TRUNC('minute', created_at) as minute,
            COUNT(*) as count,
            SUM(amount_cents) as revenue_cents,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful
          FROM payment_transactions
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '1 hour'
          GROUP BY minute
          ORDER BY minute DESC
        `;

        const result = await this.pool.query(query, [tenantId]);

        return result.rows.map((row) => ({
          timestamp: row.minute,
          count: parseInt(row.count),
          revenueCents: parseInt(row.revenue_cents),
          successCount: parseInt(row.successful),
        }));
      },
      60 // 1 minute cache for real-time data
    );
  }

  /**
   * Get top revenue generating venues
   */
  async getTopVenues(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    const query = `
      SELECT 
        v.venue_id,
        v.name as venue_name,
        COUNT(pt.*) as transaction_count,
        SUM(pt.amount_cents) as total_revenue_cents,
        AVG(pt.amount_cents) as avg_transaction_cents
      FROM payment_transactions pt
      JOIN venues v ON pt.venue_id = v.venue_id
      WHERE pt.tenant_id = $1
        AND pt.created_at BETWEEN $2 AND $3
        AND pt.status = 'completed'
      GROUP BY v.venue_id, v.name
      ORDER BY total_revenue_cents DESC
      LIMIT $4
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

  /**
   * Get payment failure analysis
   */
  async getFailureAnalysis(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const query = `
      SELECT 
        error_code,
        error_message,
        payment_method,
        COUNT(*) as count,
        SUM(amount_cents) as failed_revenue_cents
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
        AND status IN ('failed', 'declined')
      GROUP BY error_code, error_message, payment_method
      ORDER BY count DESC
      LIMIT 20
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    return result.rows.map((row) => ({
      errorCode: row.error_code,
      errorMessage: row.error_message,
      paymentMethod: row.payment_method,
      count: parseInt(row.count),
      failedRevenueCents: parseInt(row.failed_revenue_cents),
    }));
  }

  /**
   * Export analytics data as CSV
   */
  async exportAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const query = `
      SELECT 
        transaction_id,
        created_at,
        amount_cents,
        status,
        payment_method,
        venue_id,
        user_id
      FROM payment_transactions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);

    // Generate CSV
    const headers = ['Transaction ID', 'Date', 'Amount (cents)', 'Status', 'Method', 'Venue ID', 'User ID'];
    const rows = result.rows.map((row) => [
      row.transaction_id,
      row.created_at.toISOString(),
      row.amount_cents,
      row.status,
      row.payment_method,
      row.venue_id || '',
      row.user_id || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    logger.info('Analytics exported', {
      tenantId,
      rowCount: rows.length,
    });

    return csv;
  }
}
