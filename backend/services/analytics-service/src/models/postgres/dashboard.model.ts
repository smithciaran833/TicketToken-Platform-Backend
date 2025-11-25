import { getDb } from '../../config/database';

export interface Dashboard {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: string;
  layout: Record<string, any>;
  filters: Record<string, any>;
  visibility: string;
  created_by: string;
  is_default: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export class DashboardModel {
  private static tableName = 'analytics_dashboards';

  static async create(dashboard: Omit<Dashboard, 'id' | 'created_at' | 'updated_at'>): Promise<Dashboard> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(dashboard).returning('*');
    return created;
  }

  static async findById(id: string, tenantId: string): Promise<Dashboard | null> {
    const db = getDb();
    const dashboard = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return dashboard || null;
  }

  static async findByTenant(
    tenantId: string,
    options: { type?: string; createdBy?: string; visibility?: string } = {}
  ): Promise<Dashboard[]> {
    const db = getDb();
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

  static async findDefault(tenantId: string, type?: string): Promise<Dashboard | null> {
    const db = getDb();
    let query = db(this.tableName)
      .where({ tenant_id: tenantId, is_default: true });

    if (type) {
      query = query.where('type', type);
    }

    const dashboard = await query.first();
    return dashboard || null;
  }

  static async update(id: string, tenantId: string, updates: Partial<Dashboard>): Promise<Dashboard | null> {
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

  static async setDefault(id: string, tenantId: string): Promise<Dashboard | null> {
    const db = getDb();
    
    // First, unset all defaults for this tenant and type
    const dashboard = await this.findById(id, tenantId);
    if (!dashboard) return null;

    await db(this.tableName)
      .where({ tenant_id: tenantId, type: dashboard.type })
      .update({ is_default: false });

    // Then set the new default
    const [updated] = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update({ is_default: true })
      .returning('*');
    
    return updated || null;
  }
}
