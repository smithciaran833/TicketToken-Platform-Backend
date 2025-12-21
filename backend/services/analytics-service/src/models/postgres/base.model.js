"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseModel = void 0;
const database_1 = require("../../config/database");
class BaseModel {
    async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        const record = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .first();
        return record || null;
    }
    async findAll(tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ tenant_id: tenantId })
            .orderBy('created_at', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.offset(options.offset);
        }
        return query;
    }
    async create(data) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(data).returning('*');
        return created;
    }
    async update(id, tenantId, updates) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .update(updates)
            .returning('*');
        return updated || null;
    }
    async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
    async count(tenantId, conditions = {}) {
        const db = (0, database_1.getDb)();
        const result = await db(this.tableName)
            .where({ tenant_id: tenantId, ...conditions })
            .count('* as count')
            .first();
        return parseInt(result?.count) || 0;
    }
}
exports.BaseModel = BaseModel;
//# sourceMappingURL=base.model.js.map