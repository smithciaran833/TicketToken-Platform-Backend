"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataAggregationService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
class DataAggregationService {
    mainDb = (0, database_1.getDb)();
    analyticsDb = (0, database_1.getAnalyticsDb)();
    async aggregateVenueMetrics(venueId, date) {
        try {
            const ticketsSold = await this.mainDb('tickets')
                .where('venue_id', venueId)
                .whereRaw('DATE(created_at) = ?', [date])
                .count('id as count')
                .first();
            const revenue = await this.mainDb('tickets')
                .where('venue_id', venueId)
                .whereRaw('DATE(created_at) = ?', [date])
                .sum('price as total')
                .first();
            await this.analyticsDb('venue_analytics')
                .insert({
                venue_id: venueId,
                date: date,
                tickets_sold: ticketsSold?.count || 0,
                revenue: revenue?.total || 0,
                updated_at: new Date()
            })
                .onConflict(['venue_id', 'date', 'hour'])
                .merge();
            logger_1.logger.info('Aggregated venue metrics', { venueId, date });
        }
        catch (error) {
            logger_1.logger.error('Failed to aggregate venue metrics', error);
            throw error;
        }
    }
}
exports.DataAggregationService = DataAggregationService;
//# sourceMappingURL=data-aggregation.service.js.map