import { MetricModel } from '../models';
import { RealtimeModel, CacheModel } from '../models';
import { 
  Metric, 
  MetricType, 
  RealTimeMetric, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

export class MetricsService {
  private static instance: MetricsService;
  private log = logger.child({ component: 'MetricsService' });

  static getInstance(): MetricsService {
    if (!this.instance) {
      this.instance = new MetricsService();
    }
    return this.instance;
  }

  async recordMetric(
    venueId: string,
    metricType: MetricType,
    value: number,
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<Metric> {
    try {
      // Create metric
      const metric = await MetricModel.createMetric({
        venueId,
        metricType,
        value,
        timestamp: new Date(),
        granularity: { unit: 'minute', value: 1 },
        dimensions,
        metadata
      });

      // Update real-time counter
      await RealtimeModel.updateRealTimeMetric(venueId, metricType, value);

      // Invalidate cache
      await CacheModel.invalidateVenueCache(venueId);

      this.log.debug('Metric recorded', {
        venueId,
        metricType,
        value
      });

      return metric;
    } catch (error) {
      this.log.error('Failed to record metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    try {
      // Check cache first
      const cacheKey = CacheModel.getCacheKey(
        'metrics',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString()
      );
      
      const cached = await CacheModel.get<Metric[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        granularity
      );

      // Cache results
      await CacheModel.set(cacheKey, metrics, CONSTANTS.CACHE_TTL.METRICS);

      return metrics;
    } catch (error) {
      this.log.error('Failed to get metrics', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<RealTimeMetric | null> {
    try {
      return await RealtimeModel.getRealTimeMetric(venueId, metricType);
    } catch (error) {
      this.log.error('Failed to get real-time metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetrics(
    venueId: string
  ): Promise<Record<string, RealTimeMetric>> {
    try {
      const metricTypes = Object.values(MetricType);
      const metrics: Record<string, RealTimeMetric> = {};

      await Promise.all(
        metricTypes.map(async (type) => {
          const metric = await this.getRealTimeMetric(venueId, type);
          if (metric) {
            metrics[type] = metric;
          }
        })
      );

      return metrics;
    } catch (error) {
      this.log.error('Failed to get real-time metrics', { error, venueId });
      throw error;
    }
  }

  async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    try {
      return await RealtimeModel.incrementCounter(venueId, counterType, by);
    } catch (error) {
      this.log.error('Failed to increment counter', { error, venueId, counterType });
      throw error;
    }
  }

  async aggregateMetric(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    try {
      return await MetricModel.aggregateMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        aggregation
      );
    } catch (error) {
      this.log.error('Failed to aggregate metric', { 
        error, 
        venueId, 
        metricType,
        aggregation 
      });
      throw error;
    }
  }

  async getMetricTrend(
    venueId: string,
    metricType: MetricType,
    periods: number,
    periodUnit: 'hour' | 'day' | 'week' | 'month'
  ): Promise<Array<{ period: Date; value: number; change: number }>> {
    try {
      const now = new Date();
      const results = [];

      for (let i = periods - 1; i >= 0; i--) {
        const periodStart = new Date(now);
        const periodEnd = new Date(now);

        switch (periodUnit) {
          case 'hour':
            periodStart.setHours(periodStart.getHours() - i - 1);
            periodEnd.setHours(periodEnd.getHours() - i);
            break;
          case 'day':
            periodStart.setDate(periodStart.getDate() - i - 1);
            periodEnd.setDate(periodEnd.getDate() - i);
            break;
          case 'week':
            periodStart.setDate(periodStart.getDate() - (i + 1) * 7);
            periodEnd.setDate(periodEnd.getDate() - i * 7);
            break;
          case 'month':
            periodStart.setMonth(periodStart.getMonth() - i - 1);
            periodEnd.setMonth(periodEnd.getMonth() - i);
            break;
        }

        const value = await this.aggregateMetric(
          venueId,
          metricType,
          { startDate: periodStart, endDate: periodEnd },
          'sum'
        );

        const previousValue: number = results[results.length - 1]?.value || 0;
        const change: number = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;

        results.push({
          period: periodEnd,
          value,
          change
        });
      }

      return results;
    } catch (error) {
      this.log.error('Failed to get metric trend', { error, venueId, metricType });
      throw error;
    }
  }

  async bulkRecordMetrics(
    metrics: Array<{
      venueId: string;
      metricType: MetricType;
      value: number;
      timestamp?: Date;
      dimensions?: Record<string, string>;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const metricsToInsert = metrics.map(m => ({
        ...m,
        timestamp: m.timestamp || new Date(),
        granularity: { unit: 'minute' as const, value: 1 }
      }));

      await MetricModel.bulkInsert(metricsToInsert);

      // Update real-time metrics
      await Promise.all(
        metrics.map(m => 
          RealtimeModel.updateRealTimeMetric(m.venueId, m.metricType, m.value)
        )
      );

      this.log.debug('Bulk metrics recorded', { count: metrics.length });
    } catch (error) {
      this.log.error('Failed to bulk record metrics', { error });
      throw error;
    }
  }

  async getCapacityMetrics(
    venueId: string,
    eventId: string
  ): Promise<{
    totalCapacity: number;
    soldTickets: number;
    availableTickets: number;
    occupancyRate: number;
  }> {
    try {
      // This would integrate with the venue and ticket services
      // For now, return mock data
      const totalCapacity = 1000;
      const soldTickets = 750;
      const availableTickets = totalCapacity - soldTickets;
      const occupancyRate = (soldTickets / totalCapacity) * 100;

      return {
        totalCapacity,
        soldTickets,
        availableTickets,
        occupancyRate
      };
    } catch (error) {
      this.log.error('Failed to get capacity metrics', { error, venueId, eventId });
      throw error;
    }
  }
}

export const metricsService = MetricsService.getInstance();
