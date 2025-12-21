"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rfmCalculatorWorker = void 0;
const node_schedule_1 = __importDefault(require("node-schedule"));
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
class RFMCalculatorWorker {
    isRunning = false;
    async start() {
        logger_1.logger.info('Starting RFM Calculator Worker');
        node_schedule_1.default.scheduleJob('0 2 * * *', async () => {
            if (this.isRunning) {
                logger_1.logger.warn('RFM calculation already running, skipping...');
                return;
            }
            logger_1.logger.info('Starting scheduled RFM calculation');
            await this.calculateAllVenueRFM();
        });
        logger_1.logger.info('Running initial RFM calculation on startup');
        await this.calculateAllVenueRFM();
    }
    async calculateAllVenueRFM() {
        this.isRunning = true;
        const startTime = Date.now();
        try {
            let venues;
            const hasVenuesTable = await database_1.db.schema.hasTable('venues');
            if (hasVenuesTable) {
                venues = await (0, database_1.db)('venues').select('id', 'name');
            }
            else {
                const venueIds = await (0, database_1.db)('orders')
                    .distinct('venue_id')
                    .whereNotNull('venue_id')
                    .pluck('venue_id');
                venues = venueIds.map((id) => ({ id, name: `Venue ${id}` }));
            }
            logger_1.logger.info(`Calculating RFM for ${venues.length} venues`);
            for (const venue of venues) {
                try {
                    await this.calculateVenueRFM(venue.id);
                    logger_1.logger.info(`✓ RFM calculated for venue: ${venue.name || venue.id}`);
                }
                catch (error) {
                    logger_1.logger.error(`✗ Failed to calculate RFM for venue ${venue.id}:`, error);
                }
            }
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger_1.logger.info(`RFM calculation complete for all venues in ${duration}s`);
        }
        catch (error) {
            logger_1.logger.error('RFM calculation failed:', error);
        }
        finally {
            this.isRunning = false;
        }
    }
    async calculateVenueRFM(venueId) {
        let tenantId;
        const hasVenuesTable = await database_1.db.schema.hasTable('venues');
        if (hasVenuesTable) {
            const venue = await (0, database_1.db)('venues').where('id', venueId).first();
            tenantId = venue?.tenant_id || '00000000-0000-0000-0000-000000000000';
        }
        else {
            tenantId = '00000000-0000-0000-0000-000000000000';
        }
        const customers = await (0, database_1.db)('orders')
            .join('users', 'orders.user_id', 'users.id')
            .where('orders.venue_id', venueId)
            .where('orders.status', 'completed')
            .groupBy('users.id')
            .select('users.id as customer_id', database_1.db.raw('MAX(orders.created_at) as last_purchase_date'), database_1.db.raw('MIN(orders.created_at) as first_purchase_date'), database_1.db.raw('COUNT(*) as total_purchases'), database_1.db.raw('SUM(orders.total_amount) as total_spent'));
        if (customers.length === 0) {
            logger_1.logger.debug(`No customers found for venue ${venueId}`);
            return;
        }
        const now = new Date();
        for (const customer of customers) {
            try {
                const daysSinceLastPurchase = Math.floor((now.getTime() - new Date(customer.last_purchase_date).getTime()) /
                    (1000 * 60 * 60 * 24));
                const recencyScore = this.scoreRecency(daysSinceLastPurchase);
                const frequencyScore = this.scoreFrequency(customer.total_purchases);
                const monetaryScore = await this.scoreMonetary(venueId, parseFloat(customer.total_spent.toString()));
                const totalScore = recencyScore + frequencyScore + monetaryScore;
                const segment = this.determineSegment(totalScore, daysSinceLastPurchase);
                const churnRisk = this.calculateChurnRisk(daysSinceLastPurchase, customer.total_purchases);
                const avgOrderValue = parseFloat(customer.total_spent.toString()) / customer.total_purchases;
                await (0, database_1.db)('customer_rfm_scores')
                    .insert({
                    customer_id: customer.customer_id,
                    venue_id: venueId,
                    tenant_id: tenantId,
                    recency_score: recencyScore,
                    frequency_score: frequencyScore,
                    monetary_score: monetaryScore,
                    total_score: totalScore,
                    days_since_last_purchase: daysSinceLastPurchase,
                    total_purchases: customer.total_purchases,
                    total_spent: customer.total_spent,
                    average_order_value: avgOrderValue,
                    segment,
                    churn_risk: churnRisk,
                    calculated_at: new Date(),
                    updated_at: new Date(),
                })
                    .onConflict(['customer_id', 'venue_id'])
                    .merge();
            }
            catch (error) {
                logger_1.logger.error(`Failed to calculate RFM for customer ${customer.customer_id}:`, error);
            }
        }
        await this.updateSegmentSummary(venueId, tenantId);
        await this.calculateCLVForVenue(venueId, tenantId);
    }
    scoreRecency(days) {
        if (days <= 30)
            return 5;
        if (days <= 60)
            return 4;
        if (days <= 90)
            return 3;
        if (days <= 180)
            return 2;
        return 1;
    }
    scoreFrequency(purchases) {
        if (purchases >= 10)
            return 5;
        if (purchases >= 7)
            return 4;
        if (purchases >= 4)
            return 3;
        if (purchases >= 2)
            return 2;
        return 1;
    }
    async scoreMonetary(venueId, totalSpent) {
        const allSpending = await (0, database_1.db)('orders')
            .where('venue_id', venueId)
            .where('status', 'completed')
            .groupBy('user_id')
            .select(database_1.db.raw('SUM(total_amount) as total'))
            .orderBy('total', 'desc');
        if (allSpending.length === 0)
            return 3;
        const spendingAmounts = allSpending.map((s) => parseFloat(s.total.toString()));
        const percentile = this.calculatePercentile(spendingAmounts, totalSpent);
        if (percentile >= 80)
            return 5;
        if (percentile >= 60)
            return 4;
        if (percentile >= 40)
            return 3;
        if (percentile >= 20)
            return 2;
        return 1;
    }
    calculatePercentile(values, target) {
        const sorted = values.sort((a, b) => a - b);
        const index = sorted.findIndex((v) => v >= target);
        if (index === -1)
            return 100;
        return (index / sorted.length) * 100;
    }
    determineSegment(totalScore, daysSinceLastPurchase) {
        if (totalScore >= 12)
            return 'VIP';
        if (totalScore >= 8)
            return 'Regular';
        if (totalScore >= 5 && daysSinceLastPurchase <= 180)
            return 'At-Risk';
        return 'Lost';
    }
    calculateChurnRisk(daysSinceLastPurchase, totalPurchases) {
        if (daysSinceLastPurchase > 180 && totalPurchases >= 3)
            return 'high';
        if (daysSinceLastPurchase > 90 && totalPurchases >= 2)
            return 'medium';
        return 'low';
    }
    async updateSegmentSummary(venueId, tenantId) {
        const segments = ['VIP', 'Regular', 'At-Risk', 'Lost'];
        for (const segment of segments) {
            const stats = await (0, database_1.db)('customer_rfm_scores')
                .where('venue_id', venueId)
                .where('segment', segment)
                .select(database_1.db.raw('COUNT(*) as customer_count'), database_1.db.raw('SUM(total_spent) as total_revenue'), database_1.db.raw('AVG(average_order_value) as avg_order_value'), database_1.db.raw('AVG(total_purchases) / (AVG(days_since_last_purchase) / 365.0) as avg_purchase_frequency'))
                .first();
            await (0, database_1.db)('customer_segments')
                .insert({
                venue_id: venueId,
                tenant_id: tenantId,
                segment_name: segment,
                customer_count: stats.customer_count || 0,
                total_revenue: stats.total_revenue || 0,
                avg_order_value: stats.avg_order_value || 0,
                avg_purchase_frequency: stats.avg_purchase_frequency || 0,
                last_calculated_at: new Date(),
                updated_at: new Date(),
            })
                .onConflict(['venue_id', 'segment_name'])
                .merge();
        }
    }
    async calculateCLVForVenue(venueId, tenantId) {
        const customers = await (0, database_1.db)('customer_rfm_scores')
            .where('venue_id', venueId)
            .select('*');
        for (const customer of customers) {
            const lifespanDays = customer.days_since_last_purchase +
                (await this.getCustomerAgeDays(customer.customer_id, venueId));
            const purchaseFrequency = customer.total_purchases / (lifespanDays / 365.0);
            const clv = customer.average_order_value * purchaseFrequency * (lifespanDays / 365.0);
            const predicted12Months = customer.average_order_value * purchaseFrequency * 1;
            const predicted24Months = customer.average_order_value * purchaseFrequency * 2;
            let churnProb = 0;
            if (customer.days_since_last_purchase > 180)
                churnProb = 0.7;
            else if (customer.days_since_last_purchase > 90)
                churnProb = 0.4;
            else if (customer.days_since_last_purchase > 60)
                churnProb = 0.2;
            else
                churnProb = 0.1;
            await (0, database_1.db)('customer_lifetime_value')
                .insert({
                customer_id: customer.customer_id,
                venue_id: venueId,
                tenant_id: tenantId,
                clv: clv || 0,
                avg_order_value: customer.average_order_value,
                purchase_frequency: purchaseFrequency,
                customer_lifespan_days: lifespanDays,
                total_purchases: customer.total_purchases,
                total_revenue: customer.total_spent,
                predicted_clv_12_months: predicted12Months,
                predicted_clv_24_months: predicted24Months,
                churn_probability: churnProb,
                calculated_at: new Date(),
                updated_at: new Date(),
            })
                .onConflict('customer_id')
                .merge();
        }
    }
    async getCustomerAgeDays(customerId, venueId) {
        const firstOrder = await (0, database_1.db)('orders')
            .where('user_id', customerId)
            .where('venue_id', venueId)
            .orderBy('created_at', 'asc')
            .first();
        if (!firstOrder)
            return 0;
        const days = Math.floor((Date.now() - new Date(firstOrder.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return days;
    }
}
exports.rfmCalculatorWorker = new RFMCalculatorWorker();
//# sourceMappingURL=rfm-calculator.worker.js.map