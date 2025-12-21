"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertModel = void 0;
const database_1 = require("../../config/database");
class AlertModel {
    static tableName = 'analytics_alerts';
    static async create(alert) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(alert).returning('*');
        return created;
    }
    static async createAlert(data) {
        return this.create({
            tenant_id: data.venueId || data.tenant_id,
            alert_type: data.type || data.alert_type,
            severity: data.severity || 'medium',
            metric_type: data.metricType || data.metric_type || 'unknown',
            entity_type: data.entityType || 'venue',
            entity_id: data.venueId || data.entity_id,
            threshold_config: data.thresholdConfig || data.threshold_config || {},
            current_value: data.currentValue || data.current_value,
            threshold_value: data.thresholdValue || data.threshold_value,
            status: data.status || 'active',
            message: data.message,
            metadata: data.metadata || {},
            triggered_at: data.triggeredAt || new Date(),
        });
    }
    static async updateAlert(id, data) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id })
            .update({
            alert_type: data.type || data.alert_type,
            severity: data.severity,
            threshold_config: data.thresholdConfig || data.threshold_config,
            message: data.message,
            metadata: data.metadata,
        })
            .returning('*');
        return updated || null;
    }
    static async toggleAlert(id, enabled) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id })
            .update({
            status: enabled ? 'active' : 'inactive',
        })
            .returning('*');
        return updated || null;
    }
    static async getAlertsByVenue(venueId, activeOnly = false) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ tenant_id: venueId });
        if (activeOnly) {
            query = query.where('status', 'active');
        }
        return query.orderBy('triggered_at', 'desc');
    }
    static async incrementTriggerCount(id) {
        const db = (0, database_1.getDb)();
        await db(this.tableName)
            .where({ id })
            .update({ updated_at: new Date() });
    }
    static async createAlertInstance(data) {
        return {
            id: data.alertId,
            alert_id: data.alertId,
            status: 'active',
            triggered_at: new Date(),
            ...data,
        };
    }
    static async resolveAlertInstance(instanceId) {
        const db = (0, database_1.getDb)();
        await db(this.tableName)
            .where({ id: instanceId })
            .update({
            status: 'resolved',
            resolved_at: new Date(),
        });
    }
    static async getAlertInstances(alertId, limit = 10) {
        const db = (0, database_1.getDb)();
        const alerts = await db(this.tableName)
            .where({ id: alertId })
            .limit(limit);
        return alerts;
    }
    static async acknowledgeAlertInstance(instanceId, userId, notes) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id: instanceId })
            .update({
            metadata: db.raw(`metadata || ?::jsonb`, [JSON.stringify({ acknowledged_by: userId, notes })]),
            updated_at: new Date(),
        })
            .returning('*');
        return updated;
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const alert = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return alert || null;
    }
    static async findByStatus(status, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ status, tenant_id: tenantId })
            .orderBy('triggered_at', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.offset(options.offset);
        }
        return query;
    }
    static async findByEntity(entityType, entityId, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({
            entity_type: entityType,
            entity_id: entityId,
            tenant_id: tenantId,
        })
            .orderBy('triggered_at', 'desc');
        if (options.status) {
            query = query.where('status', options.status);
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        return query;
    }
    static async update(id, tenantId, updates) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .update(updates)
            .returning('*');
        return updated || null;
    }
    static async resolve(id, tenantId, resolvedBy) {
        const db = (0, database_1.getDb)();
        const [resolved] = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .update({
            status: 'resolved',
            resolved_at: new Date(),
            resolved_by: resolvedBy,
        })
            .returning('*');
        return resolved || null;
    }
    static async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
}
exports.AlertModel = AlertModel;
//# sourceMappingURL=alert.model.js.map