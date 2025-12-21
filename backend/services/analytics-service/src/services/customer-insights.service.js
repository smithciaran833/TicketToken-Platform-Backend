"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerInsightsService = exports.CustomerInsightsService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});
redis.on('error', (err) => {
    logger_1.logger.error('Redis connection error:', err);
});
class CustomerInsightsService {
    static instance;
    log = logger_1.logger.child({ component: 'CustomerInsightsService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new CustomerInsightsService();
        }
        return this.instance;
    }
    async getCustomerProfile(userId) {
        try {
            const db = (0, database_1.getDb)();
            const cacheKey = `customer_profile:${userId}`;
            const cached = await redis.get(cacheKey);
            if (cached) {
                this.log.debug('Customer profile cache hit', { userId });
                return JSON.parse(cached);
            }
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
            await redis.setex(cacheKey, 3600, JSON.stringify(result));
            return result;
        }
        catch (error) {
            this.log.error('Failed to get customer profile', { error, userId });
            throw error;
        }
    }
    async segmentCustomers(venueId) {
        try {
            const db = (0, database_1.getDb)();
            const cacheKey = `customer_segments:${venueId}`;
            const cached = await redis.get(cacheKey);
            if (cached) {
                this.log.debug('Customer segments cache hit', { venueId });
                return JSON.parse(cached);
            }
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
            if (segments.length > 0) {
                const latestCalc = new Date(segments[0].last_calculated_at);
                const hoursSinceCalc = (Date.now() - latestCalc.getTime()) / (1000 * 60 * 60);
                if (hoursSinceCalc > 24) {
                    this.log.info('Segment data is stale, triggering recalculation', {
                        venueId,
                        hoursSinceCalc
                    });
                    this.triggerRFMRecalculation(venueId).catch(err => this.log.error('Failed to trigger RFM recalculation', { error: err }));
                }
            }
            else {
                this.log.info('No segment data exists, triggering calculation', { venueId });
                this.triggerRFMRecalculation(venueId).catch(err => this.log.error('Failed to trigger RFM recalculation', { error: err }));
            }
            await redis.setex(cacheKey, 3600, JSON.stringify(segments));
            return segments;
        }
        catch (error) {
            this.log.error('Failed to segment customers', { error, venueId });
            throw error;
        }
    }
    async getRFMScores(venueId, options) {
        try {
            const db = (0, database_1.getDb)();
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
            const params = [venueId];
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
            }
            else {
                query += ` LIMIT 1000`;
            }
            const result = await db.raw(query, params);
            return result.rows;
        }
        catch (error) {
            this.log.error('Failed to get RFM scores', { error, venueId });
            throw error;
        }
    }
    async getEventPreferences(userId) {
        try {
            const db = (0, database_1.getDb)();
            const cacheKey = `event_preferences:${userId}`;
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
            await redis.setex(cacheKey, 21600, JSON.stringify(preferences));
            return preferences;
        }
        catch (error) {
            this.log.error('Failed to get event preferences', { error, userId });
            throw error;
        }
    }
    async getVenueCustomers(venueId, filters) {
        try {
            const db = (0, database_1.getDb)();
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
            const params = [venueId];
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
        }
        catch (error) {
            this.log.error('Failed to get venue customers', { error, venueId });
            throw error;
        }
    }
    async getCohortAnalysis(venueId, startDate, endDate) {
        try {
            const db = (0, database_1.getDb)();
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
        }
        catch (error) {
            this.log.error('Failed to get cohort analysis', { error, venueId });
            throw error;
        }
    }
    async getCustomerCLV(customerId) {
        try {
            const db = (0, database_1.getDb)();
            const cacheKey = `customer_clv:${customerId}`;
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
                await redis.setex(cacheKey, 86400, JSON.stringify(clvData));
            }
            return clvData || null;
        }
        catch (error) {
            this.log.error('Failed to get customer CLV', { error, customerId });
            throw error;
        }
    }
    async getAtRiskCustomers(venueId, limit = 100) {
        try {
            const db = (0, database_1.getDb)();
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
        }
        catch (error) {
            this.log.error('Failed to get at-risk customers', { error, venueId });
            throw error;
        }
    }
    async triggerRFMRecalculation(venueId) {
        this.log.info('RFM recalculation triggered', { venueId });
    }
    async clearCache(type, id) {
        try {
            if (type === 'customer') {
                const keys = [
                    `customer_profile:${id}`,
                    `event_preferences:${id}`,
                    `customer_clv:${id}`,
                ];
                await redis.del(...keys);
            }
            else if (type === 'venue') {
                const keys = [
                    `customer_segments:${id}`,
                ];
                await redis.del(...keys);
            }
            this.log.info('Cache cleared', { type, id });
        }
        catch (error) {
            this.log.error('Failed to clear cache', { error, type, id });
        }
    }
}
exports.CustomerInsightsService = CustomerInsightsService;
exports.customerInsightsService = CustomerInsightsService.getInstance();
//# sourceMappingURL=customer-insights.service.js.map