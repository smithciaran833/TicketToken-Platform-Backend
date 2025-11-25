import { getDb } from '../../config/database';

export interface Aggregation {
  id: string;
  tenant_id: string;
  aggregation_type: string;
  metric_type: string;
  entity_type: string;
  entity_id?: string;
  dimensions: Record<string, any>;
  time_period: string;
  period_start: Date;
  period_end: Date;
  value: number;
  unit: string;
  sample_count: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export class AggregationModel {
  private static tableName = 'analytics_aggregations';

  static async create(aggregation: Omit<Aggregation, 'id' | 'created_at' | 'updated_at'>): Promise<Aggregation> {
    const db = getDb();
    const [created] = await db(this.tableName).insert(aggregation).returning('*');
    return created;
  }

  static async upsert(aggregation: Omit<Aggregation, 'id' | 'created_at' | 'updated_at'>): Promise<Aggregation> {
    const db = getDb();
    const [result] = await db(this.tableName)
      .insert(aggregation)
      .onConflict(['tenant_id', 'aggregation_type', 'metric_type', 'entity_type', 'entity_id', 'time_period', 'period_start'])
      .merge()
      .returning('*');
    return result;
  }

  static async findById(id: string, tenantId: string): Promise<Aggregation | null> {
    const db = getDb();
    const aggregation = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .first();
    return aggregation || null;
  }

  static async findByPeriod(
    timePeriod: string,
    periodStart: Date,
    tenantId: string,
    options: { metricType?: string; entityType?: string; entityId?: string } = {}
  ): Promise<Aggregation[]> {
    const db = getDb();
    let query = db(this.tableName).where({
      time_period: timePeriod,
      period_start: periodStart,
      tenant_id: tenantId,
    });

    if (options.metricType) {
      query = query.where('metric_type', options.metricType);
    }
    if (options.entityType) {
      query = query.where('entity_type', options.entityType);
    }
    if (options.entityId) {
      query = query.where('entity_id', options.entityId);
    }

    return query.orderBy('period_start', 'desc');
  }

  static async findByDateRange(
    startDate: Date,
    endDate: Date,
    tenantId: string,
    options: { metricType?: string; timePeriod?: string } = {}
  ): Promise<Aggregation[]> {
    const db = getDb();
    let query = db(this.tableName)
      .where('tenant_id', tenantId)
      .where('period_start', '>=', startDate)
      .where('period_end', '<=', endDate);

    if (options.metricType) {
      query = query.where('metric_type', options.metricType);
    }
    if (options.timePeriod) {
      query = query.where('time_period', options.timePeriod);
    }

    return query.orderBy('period_start', 'desc');
  }

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const db = getDb();
    const deleted = await db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .delete();
    return deleted > 0;
  }

  // Legacy method for backward compatibility
  static async upsertAggregation(venueId: string, aggregation: any): Promise<Aggregation> {
    return this.upsert({
      tenant_id: venueId,
      aggregation_type: aggregation.aggregationType || aggregation.aggregation_type,
      metric_type: aggregation.metricType || aggregation.metric_type,
      entity_type: aggregation.entityType || 'venue',
      entity_id: aggregation.entityId || venueId,
      dimensions: aggregation.dimensions || {},
      time_period: aggregation.timePeriod || aggregation.time_period,
      period_start: aggregation.periodStart || aggregation.period_start,
      period_end: aggregation.periodEnd || aggregation.period_end,
      value: aggregation.value,
      unit: aggregation.unit || 'count',
      sample_count: aggregation.sampleCount || aggregation.sample_count || 0,
      metadata: aggregation.metadata || {},
    });
  }
}
