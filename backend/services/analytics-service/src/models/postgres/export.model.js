"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportModel = void 0;
const database_1 = require("../../config/database");
class ExportModel {
    static tableName = 'analytics_exports';
    static async create(exportData) {
        const db = (0, database_1.getDb)();
        const [created] = await db(this.tableName).insert(exportData).returning('*');
        return created;
    }
    static async createExport(data) {
        return this.create({
            tenant_id: data.venueId || data.tenant_id,
            export_type: data.type || data.export_type,
            format: data.format || 'csv',
            status: data.status || 'pending',
            parameters: data.parameters || data.filters || {},
            requested_by: data.userId || data.requested_by,
            expires_at: data.expiresAt || data.expires_at,
        });
    }
    static async updateExportStatus(id, status, updates = {}) {
        const db = (0, database_1.getDb)();
        const [updated] = await db(this.tableName)
            .where({ id })
            .update({
            status,
            file_path: updates.filePath || updates.file_path,
            file_url: updates.fileUrl || updates.file_url,
            file_size: updates.fileSize || updates.file_size,
            error_message: updates.errorMessage || updates.error_message,
        })
            .returning('*');
        return updated || null;
    }
    static async getExportsByUser(userId, venueId, limit = 10) {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where({
            requested_by: userId,
            tenant_id: venueId,
        })
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    static async findById(id, tenantId) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName).where({ id });
        if (tenantId) {
            query = query.where({ tenant_id: tenantId });
        }
        const exportRecord = await query.first();
        return exportRecord || null;
    }
    static async findByStatus(status, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ status, tenant_id: tenantId })
            .orderBy('created_at', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.offset(options.offset);
        }
        return query;
    }
    static async findByUser(requestedBy, tenantId, options = {}) {
        const db = (0, database_1.getDb)();
        let query = db(this.tableName)
            .where({ requested_by: requestedBy, tenant_id: tenantId })
            .orderBy('created_at', 'desc');
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.offset(options.offset);
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
    static async delete(id, tenantId) {
        const db = (0, database_1.getDb)();
        const deleted = await db(this.tableName)
            .where({ id, tenant_id: tenantId })
            .delete();
        return deleted > 0;
    }
    static async deleteExpired() {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where('expires_at', '<', new Date())
            .delete();
    }
    static async findExpired() {
        const db = (0, database_1.getDb)();
        return db(this.tableName)
            .where('expires_at', '<', new Date())
            .orderBy('expires_at', 'asc');
    }
}
exports.ExportModel = ExportModel;
//# sourceMappingURL=export.model.js.map