"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardModel = void 0;
const database_1 = require("../../config/database");
class DashboardModel {
    static tableName = 'analytics_dashboards';
    static async create(dashboard) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(dashboard).returning('*');
        return created;
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const dashboard = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return dashboard || null;
    }
    static async findByTenant(tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ tenant_id: tenantId })
            .orderBy('display_order', 'asc');
        if (options.type) {
            query = query.where('type', options.type);
        }
        if (options.createdBy) {
            query = query.where('created_by', options.createdBy);
        }
        if (options.visibility) {
            query = query.where('visibility', options.visibility);
        }
        return query;
    }
    static async findDefault(tenantId, type) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ tenant_id: tenantId, is_default: true });
        if (type) {
            query = query.where('type', type);
        }
        const dashboard = await query.first();
        return dashboard || null;
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
    static async setDefault(id, tenantId) {
        const db = (0, database_1.getDb)();
        const dashboard = await this.findById(id, tenantId);
        if (!dashboard)
            return null;
        await db(this.tableName)
            .where({ tenant_id: tenantId, type: dashboard.type })
            .update({ is_default: false });
        const [updated] = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .update({ is_default: true })
            .returning('*');
        return updated || null;
    }
}
exports.DashboardModel = DashboardModel;
//# sourceMappingURL=dashboard.model.js.map