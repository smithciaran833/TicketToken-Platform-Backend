"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueCalculator = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../utils/logger");
const VALIDATION = {
    MIN_VENUE_ID_LENGTH: 36,
    MAX_DATE_RANGE_DAYS: 730,
    MIN_PROJECTION_DAYS: 1,
    MAX_PROJECTION_DAYS: 365,
};
class RevenueCalculator {
    mainDb = (0, database_1.getDb)();
    analyticsDb = (0, database_1.getAnalyticsDb)();
    validateVenueId(venueId) {
        if (!venueId || typeof venueId !== 'string') {
            throw new Error('Invalid venue ID: must be a non-empty string');
        }
        if (venueId.length < VALIDATION.MIN_VENUE_ID_LENGTH) {
            throw new Error(`Invalid venue ID: must be at least ${VALIDATION.MIN_VENUE_ID_LENGTH} characters`);
        }
    }
    validateDateRange(startDate, endDate) {
        if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
            throw new Error('Invalid start date');
        }
        if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
            throw new Error('Invalid end date');
        }
        if (startDate >= endDate) {
            throw new Error('Start date must be before end date');
        }
        const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > VALIDATION.MAX_DATE_RANGE_DAYS) {
            throw new Error(`Date range too large: maximum ${VALIDATION.MAX_DATE_RANGE_DAYS} days allowed`);
        }
    }
    validateProjectionDays(days) {
        if (!Number.isInteger(days)) {
            throw new Error('Invalid projection days: must be an integer');
        }
        if (days < VALIDATION.MIN_PROJECTION_DAYS || days > VALIDATION.MAX_PROJECTION_DAYS) {
            throw new Error(`Invalid projection days: must be between ${VALIDATION.MIN_PROJECTION_DAYS} and ${VALIDATION.MAX_PROJECTION_DAYS}`);
        }
    }
    safeParseFloat(value, defaultValue = 0) {
        const parsed = parseFloat(value);
        return isFinite(parsed) ? parsed : defaultValue;
    }
    safeParseInt(value, defaultValue = 0) {
        const parsed = parseInt(value);
        return isFinite(parsed) ? parsed : defaultValue;
    }
    async calculateRevenueByChannel(venueId, startDate, endDate) {
        this.validateVenueId(venueId);
        this.validateDateRange(startDate, endDate);
        logger_1.logger.info('Calculating revenue by channel', { venueId, startDate, endDate });
        const analytics = await this.analyticsDb('venue_analytics')
            .select(this.analyticsDb.raw('SUM(revenue) as total_revenue'), this.analyticsDb.raw('SUM(ticket_sales) as total_tickets'), this.analyticsDb.raw('COUNT(*) as days_count'))
            .where('venue_id', venueId)
            .whereBetween('date', [startDate, endDate]);
        const total = this.safeParseFloat(analytics[0]?.total_revenue);
        const ticketCount = this.safeParseInt(analytics[0]?.total_tickets);
        const result = {
            channels: [{
                    channel: 'Direct Sales',
                    ticket_count: ticketCount,
                    revenue: total,
                    percentage: '100.00'
                }],
            total
        };
        logger_1.logger.info('Revenue by channel calculated', { venueId, total, ticketCount });
        return result;
    }
    async calculateRevenueByEventType(venueId, startDate, endDate) {
        this.validateVenueId(venueId);
        this.validateDateRange(startDate, endDate);
        logger_1.logger.info('Calculating revenue by event type', { venueId, startDate, endDate });
        const eventAnalytics = await this.analyticsDb('event_analytics')
            .select(this.analyticsDb.raw('SUM(revenue) as total_revenue'), this.analyticsDb.raw('SUM(tickets_sold) as tickets_sold'), this.analyticsDb.raw('COUNT(DISTINCT event_id) as event_count'))
            .join('events', 'event_analytics.event_id', 'events.id')
            .where('events.venue_id', venueId)
            .whereBetween('event_analytics.date', [startDate, endDate]);
        const result = [{
                event_type: 'All Events',
                event_count: this.safeParseInt(eventAnalytics[0]?.event_count),
                revenue: this.safeParseFloat(eventAnalytics[0]?.total_revenue),
                tickets_sold: this.safeParseInt(eventAnalytics[0]?.tickets_sold)
            }];
        logger_1.logger.info('Revenue by event type calculated', { venueId, result });
        return result;
    }
    async projectRevenue(venueId, days) {
        this.validateVenueId(venueId);
        this.validateProjectionDays(days);
        logger_1.logger.info('Projecting revenue', { venueId, days });
        const last30Days = await this.analyticsDb('venue_analytics')
            .select(this.analyticsDb.raw('AVG(revenue) as avg_daily_revenue'))
            .where('venue_id', venueId)
            .where('date', '>=', this.analyticsDb.raw('CURRENT_DATE - INTERVAL \'30 days\''));
        const avgDaily = this.safeParseFloat(last30Days[0]?.avg_daily_revenue);
        const result = {
            projectedRevenue: avgDaily * days,
            avgDailyRevenue: avgDaily,
            daysProjected: days
        };
        logger_1.logger.info('Revenue projection calculated', { venueId, result });
        return result;
    }
}
exports.RevenueCalculator = RevenueCalculator;
//# sourceMappingURL=revenue-calculator.js.map