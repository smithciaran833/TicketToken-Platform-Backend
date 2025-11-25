import { getDb } from '../../config/database';

export interface Metric {
  id: string;
  tenant_id: string;
  metric_type: string;
  entity_type: string;
  entity_id: string;
  dimensions: Record<string, any>;
  value: number;
  unit: string;
  metadata: Record<string, any>;
  timestamp: Date;
  created_at: Date;
  updated_at: Date;
}

export class MetricModel {
  private static tableName = 'analytics_metrics';

  static async create(metric: Omit<Metric, 'id' | 'created_at' | 'updated_at'>): Promise<Metric> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(metric).returning('*');
    return created;
  }

  // Legacy method for backward compatibility
  static async createMetric(data: any): Promise<Metric> {
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

  static async findById(id: string, tenantId: string): Promise<Metric | null> {
    const db = getDb();
    const metric = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return metric || null;
  }

  static async findByEntity(
    entityType: string,
    entityId: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Metric[]> {
    const db = getDb();
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

  static async findByType(
    metricType: string,
    tenantId: string,
    options: { limit?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<Metric[]> {
    const db = getDb();
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

  // Legacy method for backward compatibility
  static async getMetrics(
    venueId: string,
    metricType: string,
    startDate: Date,
    endDate: Date,
    granularity?: any
  ): Promise<Metric[]> {
    return this.findByType(metricType, venueId, {
      startDate,
      endDate,
    });
  }

  // Legacy method for backward compatibility
  static async aggregateMetrics(
    venueId: string,
    metricType: string,
    aggregationType: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const db = getDb();
    const result = await db(this.tableName)
      .where({
        tenant_id: venueId,
        metric_type: metricType,
      })
      .whereBetween('timestamp', [startDate, endDate])
      .select(
        db.raw('SUM(value) as sum'),
        db.raw('AVG(value) as avg'),
        db.raw('MIN(value) as min'),
        db.raw('MAX(value) as max'),
        db.raw('COUNT(*) as count')
      )
      .first();

    return result;
  }

  // Legacy method for backward compatibility
  static async bulkInsert(metrics: any[]): Promise<void> {
    const db = getDb();
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

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete();
    return deleted > 0;
  }

  static async deleteOld(daysToKeep: number, tenantId: string): Promise<number> {
    const db = getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return db(this.tableName)
      .where('tenant_id', tenantId)
      .where('timestamp', '<', cutoffDate)
      .delete();
  }
}
