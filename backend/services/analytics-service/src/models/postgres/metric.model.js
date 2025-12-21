"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricModel = void 0;
const database_1 = require("../../config/database");
class MetricModel {
    static tableName = 'analytics_metrics';
    static async create(metric) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(metric).returning('*');
        return created;
    }
    static async createMetric(data) {
        return this.create({
            tenant_id: data.venueId || data.tenant_id,
            metric_type: data.metricType || data.metric_type,
            entity_type: data.entityType || 'venue',
            entity_id: data.venueId || data.entity_id,
            dimensions: data.dimensions || {},
            value: data.value,
            unit: data.unit || 'count',
            metadata: data.metadata || {},
            timestamp: data.timestamp || new Date(),
        });
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const metric = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return metric || null;
    }
    static async findByEntity(entityType, entityId, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({
            entity_type: entityType,
            entity_id: entityId,
            tenant_id: tenantId,
        })
            .orderBy('timestamp', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.offset(options.offset);
        }
        return query;
    }
    static async findByType(metricType, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({
            metric_type: metricType,
            tenant_id: tenantId,
        })
            .orderBy('timestamp', 'desc');
        if (options.startDate) {
            query = query.where('timestamp', '>=', options.startDate);
        }
        if (options.endDate) {
            query = query.where('timestamp', '<=', options.endDate);
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        return query;
    }
    static async getMetrics(venueId, metricType, startDate, endDate, granularity) {
        return this.findByType(metricType, venueId, {
            startDate,
            endDate,
        });
    }
    static async aggregateMetrics(venueId, metricType, aggregationType, startDate, endDate) {
        const db = (0, database_1.getDb)();
        const result = await db(this.tableName)
            .where({
            tenant_id: venueId,
            metric_type: metricType,
        })
            .whereBetween('timestamp', [startDate, endDate])
            .select(db.raw('SUM(value) as sum'), db.raw('AVG(value) as avg'), db.raw('MIN(value) as min'), db.raw('MAX(value) as max'), db.raw('COUNT(*) as count'))
            .first();
        return result;
    }
    static async bulkInsert(metrics) {
        const db = (0, database_1.getDb)();
        const formattedMetrics = metrics.map((m) => ({
            tenant_id: m.venueId || m.tenant_id,
            metric_type: m.metricType || m.metric_type,
            entity_type: m.entityType || 'venue',
            entity_id: m.venueId || m.entity_id,
            dimensions: m.dimensions || {},
            value: m.value,
            unit: m.unit || 'count',
            metadata: m.metadata || {},
            timestamp: m.timestamp || new Date(),
        }));
        await db(this.tableName).insert(formattedMetrics);
    }
    static async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
    static async deleteOld(daysToKeep, tenantId) {
        const db = (0, database_1.getDb)();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        return db(this.tableName)
            .where('tenant_id', tenantId)
            .where('timestamp', '<', cutoffDate)
            .delete();
    }
}
exports.MetricModel = MetricModel;
//# sourceMappingURL=metric.model.js.map