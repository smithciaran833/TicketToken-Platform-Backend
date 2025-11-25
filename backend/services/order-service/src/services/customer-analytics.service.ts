import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  CustomerAnalytics,
  CustomerSegment,
  RFMScore,
} from '../types/report.types';

export class CustomerAnalyticsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Calculate customer lifetime value
   */
  async calculateCustomerLifetimeValue(tenantId: string, userId: string): Promise<number> {
    try {
      const query = `
        SELECT COALESCE(SUM(total_cents), 0) as lifetime_value
        FROM orders
        WHERE tenant_id = $1
          AND user_id = $2
          AND status IN ('CONFIRMED', 'COMPLETED')
      `;

      const result = await this.pool.query(query, [tenantId, userId]);
      return parseInt(result.rows[0].lifetime_value, 10);
    } catch (error) {
      logger.error('Error calculating CLV', { error, tenantId, userId });
      throw error;
    }
  }

  /**
   * Calculate RFM scores for a customer
   */
  async calculateRFMScores(tenantId: string, userId: string): Promise<RFMScore> {
    try {
      const query = `
        WITH customer_data AS (
          SELECT
            user_id,
            COUNT(*) as order_count,
            SUM(total_cents) as total_spent,
            MAX(created_at) as last_order_date
          FROM orders
          WHERE tenant_id = $1
            AND user_id = $2
            AND status IN ('CONFIRMED', 'COMPLETED')
          GROUP BY user_id
        ),
        tenant_stats AS (
          SELECT
            percentile_cont(0.2) WITHIN GROUP (ORDER BY days_since_last) as r_20,
            percentile_cont(0.4) WITHIN GROUP (ORDER BY days_since_last) as r_40,
            percentile_cont(0.6) WITHIN GROUP (ORDER BY days_since_last) as r_60,
            percentile_cont(0.8) WITHIN GROUP (ORDER BY days_since_last) as r_80,
            percentile_cont(0.2) WITHIN GROUP (ORDER BY order_count) as f_20,
            percentile_cont(0.4) WITHIN GROUP (ORDER BY order_count) as f_40,
            percentile_cont(0.6) WITHIN GROUP (ORDER BY order_count) as f_60,
            percentile_cont(0.8) WITHIN GROUP (ORDER BY order_count) as f_80,
            percentile_cont(0.2) WITHIN GROUP (ORDER BY total_spent) as m_20,
            percentile_cont(0.4) WITHIN GROUP (ORDER BY total_spent) as m_40,
            percentile_cont(0.6) WITHIN GROUP (ORDER BY total_spent) as m_60,
            percentile_cont(0.8) WITHIN GROUP (ORDER BY total_spent) as m_80
          FROM (
            SELECT
              user_id,
              EXTRACT(DAY FROM (NOW() - MAX(created_at))) as days_since_last,
              COUNT(*) as order_count,
              SUM(total_cents) as total_spent
            FROM orders
            WHERE tenant_id = $1
              AND status IN ('CONFIRMED', 'COMPLETED')
            GROUP BY user_id
          ) tenant_data
        )
        SELECT
          cd.user_id,
          EXTRACT(DAY FROM (NOW() - cd.last_order_date)) as days_since_last,
          cd.order_count,
          cd.total_spent,
          CASE
            WHEN EXTRACT(DAY FROM (NOW() - cd.last_order_date)) <= ts.r_20 THEN 5
            WHEN EXTRACT(DAY FROM (NOW() - cd.last_order_date)) <= ts.r_40 THEN 4
            WHEN EXTRACT(DAY FROM (NOW() - cd.last_order_date)) <= ts.r_60 THEN 3
            WHEN EXTRACT(DAY FROM (NOW() - cd.last_order_date)) <= ts.r_80 THEN 2
            ELSE 1
          END as recency_score,
          CASE
            WHEN cd.order_count >= ts.f_80 THEN 5
            WHEN cd.order_count >= ts.f_60 THEN 4
            WHEN cd.order_count >= ts.f_40 THEN 3
            WHEN cd.order_count >= ts.f_20 THEN 2
            ELSE 1
          END as frequency_score,
          CASE
            WHEN cd.total_spent >= ts.m_80 THEN 5
            WHEN cd.total_spent >= ts.m_60 THEN 4
            WHEN cd.total_spent >= ts.m_40 THEN 3
            WHEN cd.total_spent >= ts.m_20 THEN 2
            ELSE 1
          END as monetary_score
        FROM customer_data cd
        CROSS JOIN tenant_stats ts
      `;

      const result = await this.pool.query(query, [tenantId, userId]);

      if (result.rows.length === 0) {
        return {
          recencyScore: 1,
          frequencyScore: 1,
          monetaryScore: 1,
          rfmSegment: '111',
        };
      }

      const row = result.rows[0];
      const rfmSegment = `${row.recency_score}${row.frequency_score}${row.monetary_score}`;

      return {
        recencyScore: parseInt(row.recency_score, 10),
        frequencyScore: parseInt(row.frequency_score, 10),
        monetaryScore: parseInt(row.monetary_score, 10),
        rfmSegment,
      };
    } catch (error) {
      logger.error('Error calculating RFM scores', { error, tenantId, userId });
      throw error;
    }
  }

  /**
   * Update customer analytics for a user
   */
  async updateCustomerAnalytics(tenantId: string, userId: string): Promise<CustomerAnalytics> {
    try {
      // Get RFM scores
      const rfmScores = await this.calculateRFMScores(tenantId, userId);

      // Get customer order data
      const query = `
        WITH order_data AS (
          SELECT
            COUNT(*) as total_orders,
            COALESCE(SUM(total_cents), 0) as total_spent,
            COALESCE(AVG(total_cents)::bigint, 0) as average_order_value,
            MIN(created_at) as first_order_date,
            MAX(created_at) as last_order_date
          FROM orders
          WHERE tenant_id = $1
            AND user_id = $2
            AND status IN ('CONFIRMED', 'COMPLETED')
        )
        INSERT INTO customer_analytics (
          tenant_id, user_id,
          total_orders, total_spent_cents, average_order_value_cents, lifetime_value_cents,
          first_order_date, last_order_date, days_since_last_order,
          recency_score, frequency_score, monetary_score, rfm_segment
        )
        SELECT
          $1, $2,
          total_orders,
          total_spent,
          average_order_value,
          total_spent, -- CLV = total spent for now
          first_order_date,
          last_order_date,
          CASE
            WHEN last_order_date IS NOT NULL 
            THEN EXTRACT(DAY FROM (NOW() - last_order_date))::int
            ELSE NULL
          END,
          $3, $4, $5, $6
        FROM order_data
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          total_orders = EXCLUDED.total_orders,
          total_spent_cents = EXCLUDED.total_spent_cents,
          average_order_value_cents = EXCLUDED.average_order_value_cents,
          lifetime_value_cents = EXCLUDED.lifetime_value_cents,
          first_order_date = EXCLUDED.first_order_date,
          last_order_date = EXCLUDED.last_order_date,
          days_since_last_order = EXCLUDED.days_since_last_order,
          recency_score = EXCLUDED.recency_score,
          frequency_score = EXCLUDED.frequency_score,
          monetary_score = EXCLUDED.monetary_score,
          rfm_segment = EXCLUDED.rfm_segment,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        userId,
        rfmScores.recencyScore,
        rfmScores.frequencyScore,
        rfmScores.monetaryScore,
        rfmScores.rfmSegment,
      ]);

      logger.info('Updated customer analytics', { tenantId, userId });

      return this.mapToCustomerAnalytics(result.rows[0]);
    } catch (error) {
      logger.error('Error updating customer analytics', { error, tenantId, userId });
      throw error;
    }
  }

  /**
   * Assign customer to a segment based on their analytics
   */
  async assignCustomerSegment(tenantId: string, userId: string): Promise<CustomerSegment | null> {
    try {
      // Get customer analytics
      const analytics = await this.getCustomerAnalytics(tenantId, userId);
      if (!analytics) {
        return null;
      }

      // Find matching segment
      const query = `
        SELECT *
        FROM customer_segments
        WHERE tenant_id = $1
          AND is_active = true
          AND (segment_rules->>'minOrders' IS NULL OR $2 >= (segment_rules->>'minOrders')::int)
          AND (segment_rules->>'maxOrders' IS NULL OR $2 <= (segment_rules->>'maxOrders')::int)
          AND (segment_rules->>'minLifetimeValueCents' IS NULL OR $3 >= (segment_rules->>'minLifetimeValueCents')::bigint)
          AND (segment_rules->>'maxLifetimeValueCents' IS NULL OR $3 <= (segment_rules->>'maxLifetimeValueCents')::bigint)
          AND (segment_rules->>'minRecencyDays' IS NULL OR $4 >= (segment_rules->>'minRecencyDays')::int)
          AND (segment_rules->>'maxRecencyDays' IS NULL OR $4 <= (segment_rules->>'maxRecencyDays')::int)
          AND (segment_rules->>'minFrequencyScore' IS NULL OR $5 >= (segment_rules->>'minFrequencyScore')::int)
          AND (segment_rules->>'maxFrequencyScore' IS NULL OR $5 <= (segment_rules->>'maxFrequencyScore')::int)
          AND (segment_rules->>'minMonetaryScore' IS NULL OR $6 >= (segment_rules->>'minMonetaryScore')::int)
          AND (segment_rules->>'maxMonetaryScore' IS NULL OR $6 <= (segment_rules->>'maxMonetaryScore')::int)
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [
        tenantId,
        analytics.totalOrders,
        analytics.lifetimeValueCents,
        analytics.daysSinceLastOrder || 0,
        analytics.frequencyScore,
        analytics.monetaryScore,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      const segment = this.mapToCustomerSegment(result.rows[0]);

      // Update customer analytics with new segment
      if (analytics.currentSegmentId !== segment.id) {
        await this.pool.query(
          'UPDATE customer_analytics SET current_segment_id = $1, updated_at = NOW() WHERE tenant_id = $2 AND user_id = $3',
          [segment.id, tenantId, userId]
        );

        // Record segment history
        await this.pool.query(
          `INSERT INTO customer_segment_history (tenant_id, user_id, old_segment_id, new_segment_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, userId, analytics.currentSegmentId, segment.id, 'Automatic segment assignment']
        );
      }

      return segment;
    } catch (error) {
      logger.error('Error assigning customer segment', { error, tenantId, userId });
      throw error;
    }
  }

  /**
   * Get customers by segment
   */
  async getCustomersBySegment(tenantId: string, segmentId: string): Promise<CustomerAnalytics[]> {
    try {
      const query = `
        SELECT *
        FROM customer_analytics
        WHERE tenant_id = $1
          AND current_segment_id = $2
        ORDER BY lifetime_value_cents DESC
      `;

      const result = await this.pool.query(query, [tenantId, segmentId]);

      return result.rows.map((row) => this.mapToCustomerAnalytics(row));
    } catch (error) {
      logger.error('Error getting customers by segment', { error, tenantId, segmentId });
      throw error;
    }
  }

  /**
   * Get top customers by CLV or frequency
   */
  async getTopCustomers(
    tenantId: string,
    limit: number,
    orderBy: 'clv' | 'frequency' = 'clv'
  ): Promise<CustomerAnalytics[]> {
    try {
      const orderByField = orderBy === 'clv' ? 'lifetime_value_cents' : 'total_orders';

      const query = `
        SELECT *
        FROM customer_analytics
        WHERE tenant_id = $1
        ORDER BY ${orderByField} DESC
        LIMIT $2
      `;

      const result = await this.pool.query(query, [tenantId, limit]);

      return result.rows.map((row) => this.mapToCustomerAnalytics(row));
    } catch (error) {
      logger.error('Error getting top customers', { error, tenantId, limit, orderBy });
      throw error;
    }
  }

  /**
   * Get at-risk customers (no orders in >90 days)
   */
  async getAtRiskCustomers(tenantId: string): Promise<CustomerAnalytics[]> {
    try {
      const query = `
        SELECT *
        FROM customer_analytics
        WHERE tenant_id = $1
          AND days_since_last_order > 90
          AND total_orders > 0
        ORDER BY lifetime_value_cents DESC
      `;

      const result = await this.pool.query(query, [tenantId]);

      return result.rows.map((row) => this.mapToCustomerAnalytics(row));
    } catch (error) {
      logger.error('Error getting at-risk customers', { error, tenantId });
      throw error;
    }
  }

  /**
   * Get VIP customers (high CLV + frequency)
   */
  async getVIPCustomers(tenantId: string): Promise<CustomerAnalytics[]> {
    try {
      const query = `
        SELECT *
        FROM customer_analytics
        WHERE tenant_id = $1
          AND recency_score >= 4
          AND frequency_score >= 4
          AND monetary_score >= 4
        ORDER BY lifetime_value_cents DESC
      `;

      const result = await this.pool.query(query, [tenantId]);

      return result.rows.map((row) => this.mapToCustomerAnalytics(row));
    } catch (error) {
      logger.error('Error getting VIP customers', { error, tenantId });
      throw error;
    }
  }

  /**
   * Get customer analytics
   */
  async getCustomerAnalytics(tenantId: string, userId: string): Promise<CustomerAnalytics | null> {
    try {
      const query = `
        SELECT *
        FROM customer_analytics
        WHERE tenant_id = $1
          AND user_id = $2
      `;

      const result = await this.pool.query(query, [tenantId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToCustomerAnalytics(result.rows[0]);
    } catch (error) {
      logger.error('Error getting customer analytics', { error, tenantId, userId });
      throw error;
    }
  }

  /**
   * Map database row to CustomerAnalytics
   */
  private mapToCustomerAnalytics(row: any): CustomerAnalytics {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      totalOrders: parseInt(row.total_orders, 10),
      totalSpentCents: parseInt(row.total_spent_cents, 10),
      averageOrderValueCents: parseInt(row.average_order_value_cents, 10),
      lifetimeValueCents: parseInt(row.lifetime_value_cents, 10),
      firstOrderDate: row.first_order_date,
      lastOrderDate: row.last_order_date,
      daysSinceLastOrder: row.days_since_last_order ? parseInt(row.days_since_last_order, 10) : null,
      recencyScore: parseInt(row.recency_score, 10),
      frequencyScore: parseInt(row.frequency_score, 10),
      monetaryScore: parseInt(row.monetary_score, 10),
      rfmSegment: row.rfm_segment,
      currentSegmentId: row.current_segment_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to CustomerSegment
   */
  private mapToCustomerSegment(row: any): CustomerSegment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      segmentName: row.segment_name,
      segmentDescription: row.segment_description,
      segmentRules: row.segment_rules,
      customerCount: parseInt(row.customer_count, 10),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
