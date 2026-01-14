/**
 * Customer Insights Service
 * 
 * AUDIT FIX: MT-1, CACHE-2 - Added tenant_id to all cache keys
 * to prevent cross-tenant data leakage
 * 
 * PHASE 5c BYPASS EXCEPTION - READ-REPLICA PATTERN:
 * Analytics-service is a read-only reporting layer that computes customer
 * intelligence metrics. Direct DB access is retained because:
 * 
 * 1. READ-ONLY: All queries are SELECT for customer analytics, no writes to source
 * 2. ANALYTICS DOMAIN: Customer segmentation/RFM/CLV is this service's purpose
 * 3. COMPLEX AGGREGATIONS: Cohort analysis and RFM scoring need direct SQL
 * 4. CACHING: Results are cached in analytics-owned tables for fast retrieval
 * 5. ISOLATION: Should use read replica to avoid load on primary databases
 * 
 * Tables accessed (READ-ONLY):
 * - users: Customer profile data (auth-service owned)
 * - orders: Purchase history for RFM scores (order-service owned)
 * - events: Event info for preferences (event-service owned)
 * 
 * Analytics-owned tables (READ/WRITE):
 * - customer_rfm_scores: Computed RFM metrics
 * - customer_segments: Aggregated segment data
 * - customer_lifetime_value: CLV predictions
 * 
 * RECOMMENDED: Configure to use read replica connection string in production.
 */

import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { BadRequestError } from '../errors';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

// =============================================================================
// AUDIT FIX: MT-1, CACHE-2 - Tenant-Isolated Cache Key Generation
// =============================================================================

/**
 * Generate a cache key with tenant isolation
 * Format: analytics:{tenantId}:{keyType}:{resourceId}
 */
function makeCacheKey(tenantId: string, keyType: string, resourceId: string): string {
  if (!tenantId) {
    throw new BadRequestError('Tenant ID is required for cache operations');
  }
  // Validate inputs to prevent cache key injection
  const safePattern = /^[a-zA-Z0-9_-]+$/;
  if (!safePattern.test(tenantId) || !safePattern.test(keyType) || !safePattern.test(resourceId)) {
    throw new BadRequestError('Invalid characters in cache key components');
  }
  return `analytics:${tenantId}:${keyType}:${resourceId}`;
}

export class CustomerInsightsService {
  private static instance: CustomerInsightsService;
  private log = logger.child({ component: 'CustomerInsightsService' });

  static getInstance(): CustomerInsightsService {
    if (!this.instance) {
      this.instance = new CustomerInsightsService();
    }
    return this.instance;
  }

  /**
   * Get customer profile with RFM scores from cache
   * 
   * AUDIT FIX: MT-1 - Added required tenantId parameter
   */
  async getCustomerProfile(userId: string, tenantId: string) {
    // AUDIT FIX: MT-1 - Require tenant context
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      const db = getDb();
      
      // AUDIT FIX: CACHE-2 - Cache key now includes tenant_id
      const cacheKey = makeCacheKey(tenantId, 'customer_profile', userId);
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.log.debug('Customer profile cache hit', { userId });
        return JSON.parse(cached);
      }

      // Get basic profile
      const profileResult = await db.raw(`
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.created_at as customer_since,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(o.total_amount) as lifetime_value,
          AVG(o.total_amount) as avg_order_value,
          COUNT(DISTINCT e.venue_id) as unique_venues,
          COUNT(DISTINCT e.id) as unique_events,
          MAX(o.created_at) as last_purchase_date,
          MIN(o.created_at) as first_purchase_date
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed'
        LEFT JOIN events e ON o.event_id = e.id
        WHERE u.id = ?
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at
      `, [userId]);

      const profile = profileResult.rows[0];

      if (!profile) {
        return null;
      }

      // Get RFM scores from cache table
      const rfmResult = await db.raw(`
        SELECT
          recency_score,
          frequency_score,
          monetary_score,
          total_score,
          segment,
          churn_risk,
          days_since_last_purchase,
          calculated_at
        FROM customer_rfm_scores
        WHERE customer_id = ?
        ORDER BY calculated_at DESC
        LIMIT 1
      `, [userId]);

      const rfmData = rfmResult.rows[0];

      // Get CLV from cache
      const clvResult = await db.raw(`
        SELECT
          clv,
          predicted_clv_12_months,
          predicted_clv_24_months,
          churn_probability
        FROM customer_lifetime_value
        WHERE customer_id = ?
      `, [userId]);

      const clvData = clvResult.rows[0];

      const result = {
        ...profile,
        rfm: rfmData || null,
        clv: clvData || null,
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(result));

      return result;
    } catch (error) {
      this.log.error('Failed to get customer profile', { error, userId });
      throw error;
    }
  }

  /**
   * Get customer segments from cache table
   * 
   * AUDIT FIX: MT-1 - Added required tenantId parameter
   */
  async segmentCustomers(venueId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      const db = getDb();

      // AUDIT FIX: CACHE-2 - Cache key now includes tenant_id
      const cacheKey = makeCacheKey(tenantId, 'customer_segments', venueId);
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.log.debug('Customer segments cache hit', { venueId });
        return JSON.parse(cached);
      }

      // Get from cache table
      const result = await db.raw(`
        SELECT
          segment_name as segment,
          customer_count,
          total_revenue as total_lifetime_value,
          avg_order_value,
          avg_lifetime_value,
          avg_purchase_frequency,
          last_calculated_at
        FROM customer_segments
        WHERE venue_id = ?
        ORDER BY customer_count DESC
      `, [venueId]);

      const segments = result.rows;

      // Check if data is stale (more than 24 hours old)
      if (segments.length > 0) {
        const latestCalc = new Date(segments[0].last_calculated_at);
        const hoursSinceCalc = (Date.now() - latestCalc.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceCalc > 24) {
          this.log.info('Segment data is stale, triggering recalculation', { 
            venueId, 
            hoursSinceCalc 
          });
          // Trigger async recalculation (don't wait for it)
          this.triggerRFMRecalculation(venueId).catch(err => 
            this.log.error('Failed to trigger RFM recalculation', { error: err })
          );
        }
      } else {
        // No data exists, trigger calculation
        this.log.info('No segment data exists, triggering calculation', { venueId });
        this.triggerRFMRecalculation(venueId).catch(err =>
          this.log.error('Failed to trigger RFM recalculation', { error: err })
        );
      }

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(segments));

      return segments;
    } catch (error) {
      this.log.error('Failed to segment customers', { error, venueId });
      throw error;
    }
  }

  /**
   * Get RFM scores for all customers of a venue
   */
  async getRFMScores(venueId: string, options?: {
    segment?: string;
    minScore?: number;
    limit?: number;
  }) {
    try {
      const db = getDb();

      let query = `
        SELECT
          customer_id,
          recency_score,
          frequency_score,
          monetary_score,
          total_score,
          segment,
          churn_risk,
          days_since_last_purchase,
          total_purchases,
          total_spent,
          average_order_value,
          calculated_at
        FROM customer_rfm_scores
        WHERE venue_id = ?
      `;

      const params: any[] = [venueId];

      if (options?.segment) {
        query += ` AND segment = ?`;
        params.push(options.segment);
      }

      if (options?.minScore) {
        query += ` AND total_score >= ?`;
        params.push(options.minScore);
      }

      query += ` ORDER BY total_score DESC`;

      if (options?.limit) {
        query += ` LIMIT ?`;
        params.push(options.limit);
      } else {
        query += ` LIMIT 1000`;
      }

      const result = await db.raw(query, params);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to get RFM scores', { error, venueId });
      throw error;
    }
  }

  /**
   * Get event preferences for a customer
   * 
   * AUDIT FIX: MT-1 - Added required tenantId parameter
   */
  async getEventPreferences(userId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      const db = getDb();

      // AUDIT FIX: CACHE-2 - Cache key now includes tenant_id
      const cacheKey = makeCacheKey(tenantId, 'event_preferences', userId);
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const result = await db.raw(`
        SELECT
          e.category,
          COUNT(*) as attendance_count,
          SUM(o.total_amount) as total_spent,
          AVG(o.total_amount) as avg_spent_per_event,
          MAX(o.created_at) as last_attended
        FROM orders o
        JOIN events e ON o.event_id = e.id
        WHERE o.user_id = ?
          AND o.status = 'completed'
        GROUP BY e.category
        ORDER BY attendance_count DESC
      `, [userId]);

      const preferences = result.rows;

      // Cache for 6 hours
      await redis.setex(cacheKey, 21600, JSON.stringify(preferences));

      return preferences;
    } catch (error) {
      this.log.error('Failed to get event preferences', { error, userId });
      throw error;
    }
  }

  /**
   * Get customers for a venue with optional filters
   */
  async getVenueCustomers(venueId: string, filters?: {
    segment?: string;
    minSpent?: number;
    daysSinceLastPurchase?: number;
    eventCategory?: string;
    churnRisk?: string;
    minRFMScore?: number;
    limit?: number;
  }) {
    try {
      const db = getDb();

      let query = `
        SELECT
          rfm.customer_id,
          u.email,
          u.first_name,
          u.last_name,
          rfm.total_purchases as total_orders,
          rfm.total_spent as lifetime_value,
          rfm.average_order_value,
          rfm.days_since_last_purchase,
          rfm.segment,
          rfm.churn_risk,
          rfm.total_score as rfm_score,
          rfm.recency_score,
          rfm.frequency_score,
          rfm.monetary_score,
          clv.clv as customer_lifetime_value,
          clv.predicted_clv_12_months
        FROM customer_rfm_scores rfm
        JOIN users u ON rfm.customer_id = u.id
        LEFT JOIN customer_lifetime_value clv ON rfm.customer_id = clv.customer_id
        WHERE rfm.venue_id = ?
      `;

      const params: any[] = [venueId];

      if (filters?.segment) {
        query += ` AND rfm.segment = ?`;
        params.push(filters.segment);
      }

      if (filters?.minSpent) {
        query += ` AND rfm.total_spent >= ?`;
        params.push(filters.minSpent);
      }

      if (filters?.daysSinceLastPurchase) {
        query += ` AND rfm.days_since_last_purchase <= ?`;
        params.push(filters.daysSinceLastPurchase);
      }

      if (filters?.churnRisk) {
        query += ` AND rfm.churn_risk = ?`;
        params.push(filters.churnRisk);
      }

      if (filters?.minRFMScore) {
        query += ` AND rfm.total_score >= ?`;
        params.push(filters.minRFMScore);
      }

      query += ` ORDER BY rfm.total_score DESC`;

      const limit = filters?.limit || 1000;
      query += ` LIMIT ?`;
      params.push(limit);

      const result = await db.raw(query, params);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to get venue customers', { error, venueId });
      throw error;
    }
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(venueId: string, startDate: Date, endDate: Date) {
    try {
      const db = getDb();
      const result = await db.raw(`
        WITH cohorts AS (
          SELECT
            u.id,
            DATE_TRUNC('month', u.created_at) as cohort_month,
            DATE_TRUNC('month', o.created_at) as purchase_month,
            o.total_amount
          FROM users u
          JOIN orders o ON u.id = o.user_id
          JOIN events e ON o.event_id = e.id
          WHERE e.venue_id = ?
            AND o.status = 'completed'
            AND u.created_at BETWEEN ? AND ?
        )
        SELECT
          cohort_month,
          purchase_month,
          COUNT(DISTINCT id) as active_customers,
          SUM(total_amount) as revenue,
          AVG(total_amount) as avg_revenue_per_customer,
          EXTRACT(MONTH FROM AGE(purchase_month, cohort_month)) as months_since_signup
        FROM cohorts
        GROUP BY cohort_month, purchase_month
        ORDER BY cohort_month, purchase_month
      `, [venueId, startDate, endDate]);

      return result.rows;
    } catch (error) {
      this.log.error('Failed to get cohort analysis', { error, venueId });
      throw error;
    }
  }

  /**
   * Get customer lifetime value predictions
   * 
   * AUDIT FIX: MT-1 - Added required tenantId parameter
   */
  async getCustomerCLV(customerId: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      const db = getDb();

      // AUDIT FIX: CACHE-2 - Cache key now includes tenant_id
      const cacheKey = makeCacheKey(tenantId, 'customer_clv', customerId);
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const result = await db.raw(`
        SELECT
          customer_id,
          clv,
          avg_order_value,
          purchase_frequency,
          customer_lifespan_days,
          total_purchases,
          total_revenue,
          predicted_clv_12_months,
          predicted_clv_24_months,
          churn_probability,
          calculated_at
        FROM customer_lifetime_value
        WHERE customer_id = ?
      `, [customerId]);

      const clvData = result.rows[0];

      if (clvData) {
        // Cache for 24 hours
        await redis.setex(cacheKey, 86400, JSON.stringify(clvData));
      }

      return clvData || null;
    } catch (error) {
      this.log.error('Failed to get customer CLV', { error, customerId });
      throw error;
    }
  }

  /**
   * Get at-risk customers (high churn risk)
   */
  async getAtRiskCustomers(venueId: string, limit: number = 100) {
    try {
      const db = getDb();

      const result = await db.raw(`
        SELECT
          rfm.customer_id,
          u.email,
          u.first_name,
          u.last_name,
          rfm.days_since_last_purchase,
          rfm.total_purchases,
          rfm.total_spent,
          rfm.churn_risk,
          rfm.segment,
          clv.clv as lifetime_value
        FROM customer_rfm_scores rfm
        JOIN users u ON rfm.customer_id = u.id
        LEFT JOIN customer_lifetime_value clv ON rfm.customer_id = clv.customer_id
        WHERE rfm.venue_id = ?
          AND rfm.churn_risk IN ('high', 'medium')
          AND rfm.segment IN ('At-Risk', 'Regular')
        ORDER BY rfm.days_since_last_purchase DESC, rfm.total_spent DESC
        LIMIT ?
      `, [venueId, limit]);

      return result.rows;
    } catch (error) {
      this.log.error('Failed to get at-risk customers', { error, venueId });
      throw error;
    }
  }

  /**
   * Trigger RFM recalculation for a venue (async)
   */
  private async triggerRFMRecalculation(venueId: string) {
    // This would typically publish a message to a queue
    // For now, we'll just log it
    this.log.info('RFM recalculation triggered', { venueId });
    
    // You could publish to RabbitMQ here:
    // await publishMessage('rfm.calculate', { venueId });
    
    // Or trigger directly (not recommended in production):
    // const { rfmCalculatorWorker } = await import('../workers/rfm-calculator.worker');
    // await rfmCalculatorWorker.calculateVenueRFM(venueId);
  }

  /**
   * Clear cache for a customer or venue
   * 
   * AUDIT FIX: MT-1 - Added required tenantId parameter for tenant isolation
   */
  async clearCache(type: 'customer' | 'venue', id: string, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      if (type === 'customer') {
        // AUDIT FIX: CACHE-2 - Use tenant-prefixed cache keys
        const keys = [
          makeCacheKey(tenantId, 'customer_profile', id),
          makeCacheKey(tenantId, 'event_preferences', id),
          makeCacheKey(tenantId, 'customer_clv', id),
        ];
        await redis.del(...keys);
      } else if (type === 'venue') {
        const keys = [
          makeCacheKey(tenantId, 'customer_segments', id),
        ];
        await redis.del(...keys);
      }
      
      this.log.info('Cache cleared', { type, id, tenantId });
    } catch (error) {
      this.log.error('Failed to clear cache', { error, type, id, tenantId });
    }
  }
  
  /**
   * Clear all cache for a tenant (for tenant offboarding or cache reset)
   * Uses pattern matching to delete all tenant keys
   * 
   * AUDIT FIX: MT-1 - Tenant-scoped cache invalidation
   */
  async clearTenantCache(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestError('Tenant ID is required');
    }
    
    try {
      const pattern = `analytics:${tenantId}:*`;
      let cursor = '0';
      let totalDeleted = 0;
      
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        
        if (keys.length > 0) {
          await redis.del(...keys);
          totalDeleted += keys.length;
        }
      } while (cursor !== '0');
      
      this.log.info('Tenant cache cleared', { tenantId, keysDeleted: totalDeleted });
    } catch (error) {
      this.log.error('Failed to clear tenant cache', { error, tenantId });
      throw error;
    }
  }
}

export const customerInsightsService = CustomerInsightsService.getInstance();
