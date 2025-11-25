import { getDb } from '../../config/database';

export interface Widget {
  id: string;
  tenant_id: string;
  dashboard_id: string;
  widget_type: string;
  title: string;
  description?: string;
  configuration: Record<string, any>;
  data_source: Record<string, any>;
  position: Record<string, any>;
  size: Record<string, any>;
  style: Record<string, any>;
  refresh_interval: number;
  created_at: Date;
  updated_at: Date;
}

export class WidgetModel {
  private static tableName = 'analytics_widgets';

  static async create(widget: Omit<Widget, 'id' | 'created_at' | 'updated_at'>): Promise<Widget> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(widget).returning('*');
    return created;
  }

  static async findById(id: string, tenantId: string): Promise<Widget | null> {
    const db = getDb();
    const widget = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return widget || null;
  }

  static async findByDashboard(dashboardId: string, tenantId: string): Promise<Widget[]> {
    const db = getDb();
    return db(this.tableName)
      .where({ dashboard_id: dashboardId, tenant_id: tenantId })
      .orderBy('created_at', 'asc');
  }

  static async findByType(widgetType: string, tenantId: string): Promise<Widget[]> {
    const db = getDb();
    return db(this.tableName)
      .where({ widget_type: widgetType, tenant_id: tenantId })
      .orderBy('created_at', 'desc');
  }

  static async update(id: string, tenantId: string, updates: Partial<Widget>): Promise<Widget | null> {
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

  static async deleteByDashboard(dashboardId: string, tenantId: string): Promise<number> {
    const db = getDb();
    return db(this.tableName)
      .where({ dashboard_id: dashboardId, tenant_id: tenantId })
      .delete();
  }
}
