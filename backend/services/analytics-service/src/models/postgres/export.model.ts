import { getDb } from '../../config/database';

export interface Export {
  id: string;
  tenant_id: string;
  export_type: string;
  format: string;
  status: string;
  parameters: Record<string, any>;
  file_path?: string;
  file_url?: string;
  file_size?: number;
  expires_at?: Date;
  requested_by: string;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export class ExportModel {
  private static tableName = 'analytics_exports';

  static async create(exportData: Omit<Export, 'id' | 'created_at' | 'updated_at'>): Promise<Export> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(exportData).returning('*');
    return created;
  }

  // Legacy method for backward compatibility
  static async createExport(data: any): Promise<Export> {
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

  // Legacy method for backward compatibility
  static async updateExportStatus(id: string, status: string, updates: any = {}): Promise<Export | null> {
    const db = getDb();
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

  // Legacy method for backward compatibility  
  static async getExportsByUser(userId: string, venueId: string, limit: number = 10): Promise<Export[]> {
    const db = getDb();
    return db(this.tableName)
      .where({
        requested_by: userId,
        tenant_id: venueId,
      })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  static async findById(id: string, tenantId?: string): Promise<Export | null> {
    const db = getDb();
    let query = db(this.tableName).where({ id });
    
    if (tenantId) {
      query = query.where({ tenant_id: tenantId });
    }
    
    const exportRecord = await query.first();
    return exportRecord || null;
  }

  static async findByStatus(
    status: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Export[]> {
    const db = getDb();
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

  static async findByUser(
    requestedBy: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Export[]> {
    const db = getDb();
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

  static async update(id: string, tenantId: string, updates: Partial<Export>): Promise<Export | null> {
    const db = getDb();
    const [updated] = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update(updates)
      .returning('*');
    return updated || null;
  }

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete();
    return deleted > 0;
  }

  static async deleteExpired(): Promise<number> {
    const db = getDb();
    return db(this.tableName)
      .where('expires_at', '<', new Date())
      .delete();
  }

  static async findExpired(): Promise<Export[]> {
    const db = getDb();
    return db(this.tableName)
      .where('expires_at', '<', new Date())
      .orderBy('expires_at', 'asc');
  }
}
