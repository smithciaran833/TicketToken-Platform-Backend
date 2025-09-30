import { BaseModel } from './base.model';
import { Metric, MetricType, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MetricModel extends BaseModel {
  protected static tableName = 'analytics_metrics';
  
  static async createMetric(data: Omit<Metric, 'id'>): Promise<Metric> {
    const metric = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    
    return await this.create(metric);
  }
  
  static async getMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    const db = this.db();
    
    let query = db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .orderBy('timestamp', 'asc');
    
    if (granularity) {
      query = query.where('granularity', granularity);
    }
    
    return await query;
  }
  
  static async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    const db = this.db();
    
    const result = await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .select(db.raw(`${aggregation}(value) as result`))
      .first();
    
    return result?.result || 0;
  }
  
  static async getLatestMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<Metric | null> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .orderBy('timestamp', 'desc')
      .first();
  }
  
  static async bulkInsert(metrics: Omit<Metric, 'id'>[]): Promise<void> {
    const db = this.db();
    
    const metricsWithIds = metrics.map(metric => ({
      id: uuidv4(),
      ...metric,
      created_at: new Date()
    }));
    
    await db(this.tableName).insert(metricsWithIds);
  }
  
  static async deleteOldMetrics(
    retentionDays: number
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    return await db(this.tableName)
      .where('timestamp', '<', cutoffDate)
      .delete();
  }
}
