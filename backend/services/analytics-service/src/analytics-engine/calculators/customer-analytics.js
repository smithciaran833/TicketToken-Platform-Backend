"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerAnalytics = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../utils/logger");
const VALIDATION = {
    MIN_VENUE_ID_LENGTH: 36,
    MAX_DAYS_THRESHOLD: 730,
    MIN_DAYS_THRESHOLD: 1,
    MAX_RISK_SCORE: 100,
    MIN_RISK_SCORE: 0,
    RFM_SCORE_MIN: 1,
    RFM_SCORE_MAX: 5,
};
class CustomerAnalytics {
    mainDb = (0, database_1.getDb)();
    validateVenueId(venueId) {
        if (!venueId || typeof venueId !== 'string') {
            throw new Error('Invalid venue ID: must be a non-empty string');
        }
        if (venueId.length < VALIDATION.MIN_VENUE_ID_LENGTH) {
            throw new Error(`Invalid venue ID: must be at least ${VALIDATION.MIN_VENUE_ID_LENGTH} characters`);
        }
    }
    validateDaysThreshold(days) {
        if (!Number.isInteger(days)) {
            throw new Error('Invalid days threshold: must be an integer');
        }
        if (days < VALIDATION.MIN_DAYS_THRESHOLD || days > VALIDATION.MAX_DAYS_THRESHOLD) {
            throw new Error(`Invalid days threshold: must be between ${VALIDATION.MIN_DAYS_THRESHOLD} and ${VALIDATION.MAX_DAYS_THRESHOLD}`);
        }
    }
    safeDivide(numerator, denominator, defaultValue = 0) {
        if (denominator === 0 || !isFinite(denominator)) {
            return defaultValue;
        }
        const result = numerator / denominator;
        return isFinite(result) ? result : defaultValue;
    }
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    async calculateCustomerLifetimeValue(venueId) {
        this.validateVenueId(venueId);
        logger_1.logger.info('Calculating customer lifetime value', { venueId });
        const customerData = await this.mainDb('tickets')
            .select('user_id', this.mainDb.raw('COUNT(*) as purchase_count'), this.mainDb.raw('SUM(price) as total_revenue'), this.mainDb.raw('MIN(tickets.created_at) as first_purchase'), this.mainDb.raw('MAX(tickets.created_at) as last_purchase'))
            .join('events', 'tickets.event_id', 'events.id')
            .where('events.venue_id', venueId)
            .whereNotNull('user_id')
            .groupBy('user_id');
        if (!customerData || customerData.length === 0) {
            logger_1.logger.warn('No customer data found for venue', { venueId });
            return {
                averageClv: 0,
                totalCustomers: 0,
                segments: {
                    high: { count: 0, avgValue: 0 },
                    medium: { count: 0, avgValue: 0 },
                    low: { count: 0, avgValue: 0 }
                }
            };
        }
        const clvData = customerData.map((customer) => {
            const firstPurchase = new Date(customer.first_purchase);
            const lastPurchase = new Date(customer.last_purchase);
            const customerLifespan = (lastPurchase.getTime() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24);
            const totalRevenue = parseFloat(customer.total_revenue) || 0;
            const purchaseCount = customer.purchase_count || 1;
            return {
                customerId: customer.user_id,
                totalRevenue,
                purchaseCount,
                avgOrderValue: this.safeDivide(totalRevenue, purchaseCount),
                customerLifespanDays: Math.max(1, customerLifespan),
                purchaseFrequency: this.safeDivide(purchaseCount, Math.max(1, customerLifespan / 30))
            };
        });
        const totalRevenue = clvData.reduce((sum, c) => sum + c.totalRevenue, 0);
        const avgClv = this.safeDivide(totalRevenue, clvData.length);
        const segments = {
            high: clvData.filter((c) => c.totalRevenue > avgClv * 2),
            medium: clvData.filter((c) => c.totalRevenue > avgClv * 0.5 && c.totalRevenue <= avgClv * 2),
            low: clvData.filter((c) => c.totalRevenue <= avgClv * 0.5)
        };
        const result = {
            averageClv: avgClv,
            totalCustomers: clvData.length,
            segments: {
                high: {
                    count: segments.high.length,
                    avgValue: this.safeDivide(segments.high.reduce((sum, c) => sum + c.totalRevenue, 0), segments.high.length)
                },
                medium: {
                    count: segments.medium.length,
                    avgValue: this.safeDivide(segments.medium.reduce((sum, c) => sum + c.totalRevenue, 0), segments.medium.length)
                },
                low: {
                    count: segments.low.length,
                    avgValue: this.safeDivide(segments.low.reduce((sum, c) => sum + c.totalRevenue, 0), segments.low.length)
                }
            }
        };
        logger_1.logger.info('CLV calculation completed', {
            venueId,
            totalCustomers: result.totalCustomers,
            avgClv: result.averageClv
        });
        return result;
    }
    async identifyChurnRisk(venueId, daysThreshold = 90) {
        this.validateVenueId(venueId);
        this.validateDaysThreshold(daysThreshold);
        logger_1.logger.info('Identifying churn risk', { venueId, daysThreshold });
        const now = new Date();
        const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);
        const atRiskCustomers = await this.mainDb('tickets')
            .select('user_id', this.mainDb.raw('MAX(tickets.created_at) as last_purchase'), this.mainDb.raw('COUNT(*) as total_purchases'), this.mainDb.raw('AVG(price) as avg_order_value'))
            .join('events', 'tickets.event_id', 'events.id')
            .where('events.venue_id', venueId)
            .whereNotNull('user_id')
            .groupBy('user_id')
            .havingRaw('MAX(tickets.created_at) < ?', [thresholdDate])
            .orderBy('total_purchases', 'desc');
        const enrichedCustomers = atRiskCustomers.map((customer) => {
            const daysSinceLastPurchase = Math.floor((now.getTime() - new Date(customer.last_purchase).getTime()) / (1000 * 60 * 60 * 24));
            let riskScore = this.safeDivide(daysSinceLastPurchase, daysThreshold) * 50;
            const totalPurchases = parseInt(customer.total_purchases) || 0;
            const avgOrderValue = parseFloat(customer.avg_order_value) || 0;
            if (totalPurchases > 5)
                riskScore -= 10;
            if (totalPurchases > 10)
                riskScore -= 10;
            if (avgOrderValue > 100)
                riskScore -= 5;
            return {
                customerId: customer.user_id,
                lastPurchase: customer.last_purchase,
                daysSinceLastPurchase,
                totalPurchases,
                avgOrderValue,
                riskScore: this.clamp(riskScore, VALIDATION.MIN_RISK_SCORE, VALIDATION.MAX_RISK_SCORE)
            };
        });
        return {
            totalAtRisk: enrichedCustomers.length,
            highRisk: enrichedCustomers.filter((c) => c.riskScore > 70),
            mediumRisk: enrichedCustomers.filter((c) => c.riskScore > 40 && c.riskScore <= 70),
            lowRisk: enrichedCustomers.filter((c) => c.riskScore <= 40)
        };
    }
    async calculateCustomerSegmentation(venueId) {
        this.validateVenueId(venueId);
        logger_1.logger.info('Calculating customer segmentation (RFM)', { venueId });
        const customers = await this.mainDb.raw(`
      WITH customer_metrics AS (
        SELECT 
          t.user_id,
          MAX(t.created_at) as last_purchase,
          COUNT(*) as purchase_frequency,
          SUM(t.price) as monetary_value,
          CURRENT_DATE - MAX(t.created_at::date) as recency_days
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE e.venue_id = ? AND t.user_id IS NOT NULL
        GROUP BY t.user_id
      ),
      rfm_scores AS (
        SELECT 
          user_id,
          recency_days,
          purchase_frequency,
          monetary_value,
          NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score,
          NTILE(5) OVER (ORDER BY purchase_frequency) as frequency_score,
          NTILE(5) OVER (ORDER BY monetary_value) as monetary_score
        FROM customer_metrics
      )
      SELECT 
        *,
        CONCAT(recency_score, frequency_score, monetary_score) as rfm_segment
      FROM rfm_scores
    `, [venueId]);
        if (!customers || !customers.rows || customers.rows.length === 0) {
            logger_1.logger.warn('No customer data found for segmentation', { venueId });
            return [];
        }
        customers.rows.forEach((customer) => {
            if (customer.recency_score < VALIDATION.RFM_SCORE_MIN || customer.recency_score > VALIDATION.RFM_SCORE_MAX) {
                logger_1.logger.warn('Invalid recency score detected', {
                    customerId: customer.user_id,
                    score: customer.recency_score
                });
            }
        });
        const segments = {
            champions: customers.rows.filter((c) => c.rfm_segment.match(/[45][45][45]/)),
            loyalCustomers: customers.rows.filter((c) => c.rfm_segment.match(/[345][45][345]/)),
            potentialLoyalists: customers.rows.filter((c) => c.rfm_segment.match(/[45][23][345]/)),
            newCustomers: customers.rows.filter((c) => c.rfm_segment.match(/[45][12][12]/)),
            atRisk: customers.rows.filter((c) => c.rfm_segment.match(/[12][45][45]/)),
            cantLose: customers.rows.filter((c) => c.rfm_segment.match(/[12][45][45]/)),
            hibernating: customers.rows.filter((c) => c.rfm_segment.match(/[12][12][12]/))
        };
        const result = Object.entries(segments).map(([name, customers]) => ({
            segment: name,
            count: customers.length,
            avgValue: this.safeDivide(customers.reduce((sum, c) => sum + (parseFloat(c.monetary_value) || 0), 0), customers.length),
            characteristics: this.getSegmentCharacteristics(name)
        }));
        logger_1.logger.info('Customer segmentation completed', {
            venueId,
            segmentCount: result.length,
            totalCustomers: customers.rows.length
        });
        return result;
    }
    getSegmentCharacteristics(segment) {
        const characteristics = {
            champions: 'Best customers - recent, frequent, high spenders',
            loyalCustomers: 'Spend good money, responsive to promotions',
            potentialLoyalists: 'Recent customers with average frequency',
            newCustomers: 'Recently acquired, need nurturing',
            atRisk: 'Were great customers, but slipping away',
            cantLose: 'Were champions, now at risk of churning',
            hibernating: 'Low engagement, may be lost'
        };
        return characteristics[segment] || 'Unknown segment';
    }
}
exports.CustomerAnalytics = CustomerAnalytics;
//# sourceMappingURL=customer-analytics.js.map