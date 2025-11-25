import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  OrderReportSummary,
  RevenueReport,
  ReportPeriod,
  DateRange,
  OrderStats,
} from '../types/report.types';

export class OrderReportService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate daily order summary
   */
  async generateDailySummary(tenantId: string, date: Date): Promise<OrderReportSummary> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    try {
      const query = `
        INSERT INTO order_report_summaries (
          tenant_id, period, start_date, end_date,
          total_orders, total_revenue_cents, average_order_value_cents, total_refunds_cents,
          orders_by_status
        )
        SELECT
          $1, $2::report_period, $3, $4,
          COUNT(*), 
          COALESCE(SUM(total_cents), 0),
          COALESCE(AVG(total_cents)::bigint, 0),
          COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN total_cents ELSE 0 END), 0),
          jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
            'reserved', COUNT(*) FILTER (WHERE status = 'RESERVED'),
            'confirmed', COUNT(*) FILTER (WHERE status = 'CONFIRMED'),
            'completed', COUNT(*) FILTER (WHERE status = 'COMPLETED'),
            'cancelled', COUNT(*) FILTER (WHERE status = 'CANCELLED'),
            'expired', COUNT(*) FILTER (WHERE status = 'EXPIRED'),
            'refunded', COUNT(*) FILTER (WHERE status = 'REFUNDED')
          )
        FROM orders
        WHERE tenant_id = $1
          AND created_at >= $3
          AND created_at <= $4
        ON CONFLICT (tenant_id, period, start_date) 
        DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_revenue_cents = EXCLUDED.total_revenue_cents,
          average_order_value_cents = EXCLUDED.average_order_value_cents,
          total_refunds_cents = EXCLUDED.total_refunds_cents,
          orders_by_status = EXCLUDED.orders_by_status,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        ReportPeriod.DAILY,
        startDate,
        endDate,
      ]);

      logger.info('Generated daily order summary', { tenantId, date });

      return this.mapToOrderReportSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error generating daily summary', { error, tenantId, date });
      throw error;
    }
  }

  /**
   * Generate weekly order summary
   */
  async generateWeeklySummary(tenantId: string, startDate: Date): Promise<OrderReportSummary> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    try {
      const query = `
        INSERT INTO order_report_summaries (
          tenant_id, period, start_date, end_date,
          total_orders, total_revenue_cents, average_order_value_cents, total_refunds_cents,
          orders_by_status
        )
        SELECT
          $1, $2::report_period, $3, $4,
          COUNT(*), 
          COALESCE(SUM(total_cents), 0),
          COALESCE(AVG(total_cents)::bigint, 0),
          COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN total_cents ELSE 0 END), 0),
          jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
            'reserved', COUNT(*) FILTER (WHERE status = 'RESERVED'),
            'confirmed', COUNT(*) FILTER (WHERE status = 'CONFIRMED'),
            'completed', COUNT(*) FILTER (WHERE status = 'COMPLETED'),
            'cancelled', COUNT(*) FILTER (WHERE status = 'CANCELLED'),
            'expired', COUNT(*) FILTER (WHERE status = 'EXPIRED'),
            'refunded', COUNT(*) FILTER (WHERE status = 'REFUNDED')
          )
        FROM orders
        WHERE tenant_id = $1
          AND created_at >= $3
          AND created_at <= $4
        ON CONFLICT (tenant_id, period, start_date) 
        DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_revenue_cents = EXCLUDED.total_revenue_cents,
          average_order_value_cents = EXCLUDED.average_order_value_cents,
          total_refunds_cents = EXCLUDED.total_refunds_cents,
          orders_by_status = EXCLUDED.orders_by_status,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        ReportPeriod.WEEKLY,
        start,
        end,
      ]);

      logger.info('Generated weekly order summary', { tenantId, startDate });

      return this.mapToOrderReportSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error generating weekly summary', { error, tenantId, startDate });
      throw error;
    }
  }

  /**
   * Generate monthly order summary
   */
  async generateMonthlySummary(tenantId: string, month: number, year: number): Promise<OrderReportSummary> {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    try {
      const query = `
        INSERT INTO order_report_summaries (
          tenant_id, period, start_date, end_date,
          total_orders, total_revenue_cents, average_order_value_cents, total_refunds_cents,
          orders_by_status
        )
        SELECT
          $1, $2::report_period, $3, $4,
          COUNT(*), 
          COALESCE(SUM(total_cents), 0),
          COALESCE(AVG(total_cents)::bigint, 0),
          COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN total_cents ELSE 0 END), 0),
          jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
            'reserved', COUNT(*) FILTER (WHERE status = 'RESERVED'),
            'confirmed', COUNT(*) FILTER (WHERE status = 'CONFIRMED'),
            'completed', COUNT(*) FILTER (WHERE status = 'COMPLETED'),
            'cancelled', COUNT(*) FILTER (WHERE status = 'CANCELLED'),
            'expired', COUNT(*) FILTER (WHERE status = 'EXPIRED'),
            'refunded', COUNT(*) FILTER (WHERE status = 'REFUNDED')
          )
        FROM orders
        WHERE tenant_id = $1
          AND created_at >= $3
          AND created_at <= $4
        ON CONFLICT (tenant_id, period, start_date) 
        DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_revenue_cents = EXCLUDED.total_revenue_cents,
          average_order_value_cents = EXCLUDED.average_order_value_cents,
          total_refunds_cents = EXCLUDED.total_refunds_cents,
          orders_by_status = EXCLUDED.orders_by_status,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        ReportPeriod.MONTHLY,
        start,
        end,
      ]);

      logger.info('Generated monthly order summary', { tenantId, month, year });

      return this.mapToOrderReportSummary(result.rows[0]);
    } catch (error) {
      logger.error('Error generating monthly summary', { error, tenantId, month, year });
      throw error;
    }
  }

  /**
   * Get revenue by event
   */
  async getRevenueByEvent(tenantId: string, eventId: string, period: DateRange): Promise<RevenueReport> {
    try {
      const query = `
        INSERT INTO order_revenue_reports (
          tenant_id, entity_type, entity_id, period, start_date, end_date,
          total_revenue_cents, total_orders, total_tickets_sold, average_order_value_cents,
          top_ticket_types
        )
        SELECT
          $1, 'EVENT', $2, $3::report_period, $4, $5,
          COALESCE(SUM(o.total_cents), 0),
          COUNT(DISTINCT o.id),
          COALESCE(SUM(oi.quantity), 0),
          COALESCE(AVG(o.total_cents)::bigint, 0),
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'ticketTypeId', oi.ticket_type_id,
                'quantitySold', SUM(oi.quantity),
                'revenueCents', SUM(oi.total_price_cents)
              )
              ORDER BY SUM(oi.total_price_cents) DESC
            ) FILTER (WHERE oi.ticket_type_id IS NOT NULL),
            '[]'::jsonb
          )
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = $1
          AND o.event_id = $2
          AND o.created_at >= $4
          AND o.created_at <= $5
          AND o.status IN ('CONFIRMED', 'COMPLETED')
        ON CONFLICT (tenant_id, entity_type, entity_id, start_date)
        DO UPDATE SET
          total_revenue_cents = EXCLUDED.total_revenue_cents,
          total_orders = EXCLUDED.total_orders,
          total_tickets_sold = EXCLUDED.total_tickets_sold,
          average_order_value_cents = EXCLUDED.average_order_value_cents,
          top_ticket_types = EXCLUDED.top_ticket_types,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        eventId,
        ReportPeriod.CUSTOM,
        period.startDate,
        period.endDate,
      ]);

      return this.mapToRevenueReport(result.rows[0]);
    } catch (error) {
      logger.error('Error getting revenue by event', { error, tenantId, eventId });
      throw error;
    }
  }

  /**
   * Get top events by revenue
   */
  async getTopEventsByRevenue(tenantId: string, limit: number, period: DateRange): Promise<RevenueReport[]> {
    try {
      const query = `
        SELECT
          gen_random_uuid() as id,
          $1 as tenant_id,
          'EVENT' as entity_type,
          o.event_id as entity_id,
          $2::report_period as period,
          $3 as start_date,
          $4 as end_date,
          COALESCE(SUM(o.total_cents), 0) as total_revenue_cents,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(oi.quantity), 0) as total_tickets_sold,
          COALESCE(AVG(o.total_cents)::bigint, 0) as average_order_value_cents,
          '[]'::jsonb as top_ticket_types,
          NOW() as created_at,
          NOW() as updated_at
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = $1
          AND o.created_at >= $3
          AND o.created_at <= $4
          AND o.status IN ('CONFIRMED', 'COMPLETED')
        GROUP BY o.event_id
        ORDER BY total_revenue_cents DESC
        LIMIT $5
      `;

      const result = await this.pool.query(query, [
        tenantId,
        ReportPeriod.CUSTOM,
        period.startDate,
        period.endDate,
        limit,
      ]);

      return result.rows.map((row) => this.mapToRevenueReport(row));
    } catch (error) {
      logger.error('Error getting top events by revenue', { error, tenantId, limit });
      throw error;
    }
  }

  /**
   * Get order statistics by status
   */
  async getOrderStatsByStatus(tenantId: string, period: DateRange): Promise<OrderStats> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_cents), 0) as total_revenue_cents,
          COALESCE(AVG(total_cents)::bigint, 0) as average_order_value_cents,
          jsonb_object_agg(status, count) as orders_by_status,
          ROUND(
            (COUNT(*) FILTER (WHERE status = 'CONFIRMED')::numeric / 
             NULLIF(COUNT(*) FILTER (WHERE status = 'RESERVED'), 0)) * 100, 2
          ) as conversion_rate
        FROM (
          SELECT 
            status,
            total_cents,
            COUNT(*) as count
          FROM orders
          WHERE tenant_id = $1
            AND created_at >= $2
            AND created_at <= $3
          GROUP BY status, total_cents
        ) subquery
      `;

      const result = await this.pool.query(query, [tenantId, period.startDate, period.endDate]);

      const row = result.rows[0];
      return {
        totalOrders: parseInt(row.total_orders, 10),
        ordersByStatus: row.orders_by_status || {},
        totalRevenueCents: parseInt(row.total_revenue_cents, 10),
        averageOrderValueCents: parseInt(row.average_order_value_cents, 10),
        conversionRate: parseFloat(row.conversion_rate) || 0,
      };
    } catch (error) {
      logger.error('Error getting order stats by status', { error, tenantId });
      throw error;
    }
  }

  /**
   * Get average order value for period
   */
  async getAverageOrderValue(tenantId: string, period: DateRange): Promise<number> {
    try {
      const query = `
        SELECT COALESCE(AVG(total_cents)::bigint, 0) as average_order_value
        FROM orders
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
          AND status IN ('CONFIRMED', 'COMPLETED')
      `;

      const result = await this.pool.query(query, [tenantId, period.startDate, period.endDate]);

      return parseInt(result.rows[0].average_order_value, 10);
    } catch (error) {
      logger.error('Error getting average order value', { error, tenantId });
      throw error;
    }
  }

  /**
   * Get conversion rate (Reserved to Confirmed)
   */
  async getConversionRate(tenantId: string, period: DateRange): Promise<number> {
    try {
      const query = `
        SELECT
          COUNT(*) FILTER (WHERE status = 'CONFIRMED') as confirmed,
          COUNT(*) FILTER (WHERE status = 'RESERVED') as reserved
        FROM orders
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
      `;

      const result = await this.pool.query(query, [tenantId, period.startDate, period.endDate]);

      const confirmed = parseInt(result.rows[0].confirmed, 10);
      const reserved = parseInt(result.rows[0].reserved, 10);

      if (reserved === 0) return 0;

      return (confirmed / reserved) * 100;
    } catch (error) {
      logger.error('Error getting conversion rate', { error, tenantId });
      throw error;
    }
  }

  /**
   * Map database row to OrderReportSummary
   */
  private mapToOrderReportSummary(row: any): OrderReportSummary {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      period: row.period,
      startDate: row.start_date,
      endDate: row.end_date,
      totalOrders: parseInt(row.total_orders, 10),
      totalRevenueCents: parseInt(row.total_revenue_cents, 10),
      averageOrderValueCents: parseInt(row.average_order_value_cents, 10),
      totalRefundsCents: parseInt(row.total_refunds_cents, 10),
      ordersByStatus: row.orders_by_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to RevenueReport
   */
  private mapToRevenueReport(row: any): RevenueReport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      period: row.period,
      startDate: row.start_date,
      endDate: row.end_date,
      totalRevenueCents: parseInt(row.total_revenue_cents, 10),
      totalOrders: parseInt(row.total_orders, 10),
      totalTicketsSold: parseInt(row.total_tickets_sold, 10),
      averageOrderValueCents: parseInt(row.average_order_value_cents, 10),
      topTicketTypes: row.top_ticket_types || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
