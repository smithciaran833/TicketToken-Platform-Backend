import { BaseModel } from './base.model';
import { MetricAggregation, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AggregationModel extends BaseModel {
  protected static tableName = 'analytics_aggregations';
  
  static async createAggregation(
    venueId: string,
    data: MetricAggregation
  ): Promise<MetricAggregation> {
    const aggregation = {
      id: uuidv4(),
      venue_id: venueId,
      metric_type: data.metricType,
      period_start: data.period.startDate,
      period_end: data.period.endDate,
      granularity: JSON.stringify(data.granularity),
      data: JSON.stringify(data.data),
      summary: JSON.stringify(data.summary),
      created_at: new Date()
    };
    
    return await this.create(aggregation);
  }
  
  static async getAggregations(
    venueId: string,
    filters: {
      metricType?: string;
      granularity?: TimeGranularity;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MetricAggregation[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (filters.metricType) {
      query = query.where('metric_type', filters.metricType);
    }
    
    if (filters.granularity) {
      query = query.where('granularity', JSON.stringify(filters.granularity));
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween('period_start', [
        filters.startDate,
        filters.endDate
      ]);
    }
    
    const results = await query.orderBy('period_start', 'asc');
    
    // Transform back to proper format
    return results.map((row: any) => ({
      metricType: row.metric_type,
      period: {
        startDate: row.period_start,
        endDate: row.period_end
      },
      granularity: JSON.parse(row.granularity),
      data: JSON.parse(row.data),
      summary: JSON.parse(row.summary)
    }));
  }
  
  static async upsertAggregation(
    venueId: string,
    aggregation: MetricAggregation
  ): Promise<MetricAggregation> {
    const db = this.db();
    
    const existing = await db(this.tableName)
      .where({
        venue_id: venueId,
        metric_type: aggregation.metricType,
        period_start: aggregation.period.startDate,
        period_end: aggregation.period.endDate,
        granularity: JSON.stringify(aggregation.granularity)
      })
      .first();
    
    if (existing) {
      return await this.update(existing.id, {
        data: JSON.stringify(aggregation.data),
        summary: JSON.stringify(aggregation.summary),
        updated_at: new Date()
      });
    } else {
      return await this.createAggregation(venueId, aggregation);
    }
  }
  
  static async getHourlyAggregations(
    venueId: string,
    date: Date
  ): Promise<MetricAggregation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await this.getAggregations(venueId, {
      granularity: { unit: 'hour', value: 1 },
      startDate: startOfDay,
      endDate: endOfDay
    });
  }
  
  static async getDailyAggregations(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricAggregation[]> {
    return await this.getAggregations(venueId, {
      granularity: { unit: 'day', value: 1 },
      startDate,
      endDate
    });
  }
}
