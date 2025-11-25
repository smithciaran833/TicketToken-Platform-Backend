import { Pool } from 'pg';
import { getDatabase } from '../config/database';

export interface OrderAnalytics {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  conversionRate: number;
  topEvents: Array<{ eventId: string; orderCount: number; revenue: number }>;
  ordersByStatus: Record<string, number>;
}

export class OrderAnalyticsService {
  private pool: Pool;

  constructor() {
    this.pool = getDatabase();
  }

  async calculateMetrics(tenantId: string, startDate: Date, endDate: Date): Promise<OrderAnalytics> {
    const [totals, statusBreakdown, topEvents] = await Promise.all([
      this.getTotals(tenantId, startDate, endDate),
      this.getOrdersByStatus(tenantId, startDate, endDate),
      this.getTopEvents(tenantId, startDate, endDate),
    ]);

    return {
      totalOrders: totals.count,
      totalRevenue: totals.revenue,
      averageOrderValue: totals.count > 0 ? totals.revenue / totals.count : 0,
      conversionRate: this.calculateConversionRate(statusBreakdown),
      topEvents,
      ordersByStatus: statusBreakdown,
    };
  }

  private async getTotals(tenantId: string, startDate: Date, endDate: Date) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount_cents), 0) as revenue
       FROM orders
       WHERE tenant_id = $1
         AND created_at BETWEEN $2 AND $3
         AND status != 'CANCELLED'`,
      [tenantId, startDate, endDate]
    );

    return {
      count: parseInt(result.rows[0].count, 10),
      revenue: parseInt(result.rows[0].revenue, 10),
    };
  }

  private async getOrdersByStatus(tenantId: string, startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT status, COUNT(*) as count
       FROM orders
       WHERE tenant_id = $1
         AND created_at BETWEEN $2 AND $3
       GROUP BY status`,
      [tenantId, startDate, endDate]
    );

    return result.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {} as Record<string, number>);
  }

  private async getTopEvents(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ eventId: string; orderCount: number; revenue: number }>> {
    const result = await this.pool.query(
      `SELECT 
        event_id,
        COUNT(*) as order_count,
        SUM(total_amount_cents) as revenue
       FROM orders
       WHERE tenant_id = $1
         AND created_at BETWEEN $2 AND $3
         AND status != 'CANCELLED'
       GROUP BY event_id
       ORDER BY revenue DESC
       LIMIT 10`,
      [tenantId, startDate, endDate]
    );

    return result.rows.map(row => ({
      eventId: row.event_id,
      orderCount: parseInt(row.order_count, 10),
      revenue: parseInt(row.revenue, 10),
    }));
  }

  private calculateConversionRate(statusBreakdown: Record<string, number>): number {
    const reserved = statusBreakdown['RESERVED'] || 0;
    const confirmed = statusBreakdown['CONFIRMED'] || 0;
    const total = reserved + confirmed + (statusBreakdown['EXPIRED'] || 0);

    return total > 0 ? (confirmed / total) * 100 : 0;
  }
}
