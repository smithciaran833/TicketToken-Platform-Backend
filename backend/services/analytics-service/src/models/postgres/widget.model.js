"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WidgetModel = void 0;
const database_1 = require("../../config/database");
class WidgetModel {
    static tableName = 'analytics_widgets';
    static async create(widget) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(widget).returning('*');
        return created;
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const widget = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return widget || null;
    }
    static async findByDashboard(dashboardId, tenantId) {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where({ dashboard_id: dashboardId, tenant_id: tenantId })
            .orderBy('created_at', 'asc');
    }
    static async findByType(widgetType, tenantId) {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where({ widget_type: widgetType, tenant_id: tenantId })
            .orderBy('created_at', 'desc');
    }
    static async update(id, tenantId, updates) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .update(updates)
            .returning('*');
        return updated || null;
    }
    static async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
    static async deleteByDashboard(dashboardId, tenantId) {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where({ dashboard_id: dashboardId, tenant_id: tenantId })
            .delete();
    }
}
exports.WidgetModel = WidgetModel;
//# sourceMappingURL=widget.model.js.map