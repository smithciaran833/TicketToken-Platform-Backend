"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregationModel = void 0;
const database_1 = require("../../config/database");
class AggregationModel {
    static tableName = 'analytics_aggregations';
    static async create(aggregation) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(aggregation).returning('*');
        return created;
    }
    static async upsert(aggregation) {
        const db = (0, database_1.getDb)();
        const [result] = await db(this.tableName)
            .insert(aggregation)
            .onConflict(['tenant_id', 'aggregation_type', 'metric_type', 'entity_type', 'entity_id', 'time_period', 'period_start'])
            .merge()
            .returning('*');
        return result;
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const aggregation = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return aggregation || null;
    }
    static async findByPeriod(timePeriod, periodStart, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName).where({
            time_period: timePeriod,
            period_start: periodStart,
            tenant_id: tenantId,
        });
        if (options.metricType) {
            query = query.where('metric_type', options.metricType);
        }
        if (options.entityType) {
            query = query.where('entity_type', options.entityType);
        }
        if (options.entityId) {
            query = query.where('entity_id', options.entityId);
        }
        return query.orderBy('period_start', 'desc');
    }
    static async findByDateRange(startDate, endDate, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where('tenant_id', tenantId)
            .where('period_start', '>=', startDate)
            .where('period_end', '<=', endDate);
        if (options.metricType) {
            query = query.where('metric_type', options.metricType);
        }
        if (options.timePeriod) {
            query = query.where('time_period', options.timePeriod);
        }
        return query.orderBy('period_start', 'desc');
    }
    static async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
    static async upsertAggregation(venueId, aggregation) {
        return this.upsert({
            tenant_id: venueId,
            aggregation_type: aggregation.aggregationType || aggregation.aggregation_type,
            metric_type: aggregation.metricType || aggregation.metric_type,
            entity_type: aggregation.entityType || 'venue',
            entity_id: aggregation.entityId || venueId,
            dimensions: aggregation.dimensions || {},
            time_period: aggregation.timePeriod || aggregation.time_period,
            period_start: aggregation.periodStart || aggregation.period_start,
            period_end: aggregation.periodEnd || aggregation.period_end,
            value: aggregation.value,
            unit: aggregation.unit || 'count',
            sample_count: aggregation.sampleCount || aggregation.sample_count || 0,
            metadata: aggregation.metadata || {},
        });
    }
}
exports.AggregationModel = AggregationModel;
//# sourceMappingURL=aggregation.model.js.map