import type Redis from 'ioredis';
import { getRedis } from '../config/redis';
import CacheManager from '../config/redis-cache-strategies';
import { logger } from '../utils/logger';

export interface TimeRange {
  start: Date;
  end: Date;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface AnalyticsQuery {
  venueId: string;
  metrics: string[];
  timeRange: TimeRange;
  filters?: Record<string, any>;
  groupBy?: string[];
}

export class AnalyticsEngine {
  private cache!: CacheManager;

  constructor() {
    // Cache will be initialized when needed
  }

  // Main query method
  async query(query: AnalyticsQuery): Promise<any> {
    if (!this.cache) this.cache = new CacheManager(getRedis());
    const cacheKey = this.generateCacheKey(query);

    // Try cache first
    const cached = await this.cache.get('analyticsQuery', cacheKey);
    if (cached) return cached;

    // Execute query based on metrics requested
    const results = await this.executeQuery(query);

    // Cache results
    await this.cache.set('analyticsQuery', cacheKey, results, 300); // 5 min cache

    return results;
  }

  private async executeQuery(query: AnalyticsQuery) {
    const results: Record<string, any> = {};

    for (const metric of query.metrics) {
      switch (metric) {
        case 'revenue':
          results.revenue = await this.calculateRevenue(query);
          break;
        case 'ticketSales':
          results.ticketSales = await this.calculateTicketSales(query);
          break;
        case 'conversionRate':
          results.conversionRate = await this.calculateConversionRate(query);
          break;
        case 'customerMetrics':
          results.customerMetrics = await this.calculateCustomerMetrics(query);
          break;
        case 'topEvents':
          results.topEvents = await this.getTopEvents(query);
          break;
        case 'salesTrends':
          results.salesTrends = await this.calculateSalesTrends(query);
          break;
        default:
          logger.warn(`Unknown metric requested: ${metric}`);
      }
    }

    return results;
  }

  private async calculateRevenue(query: AnalyticsQuery) {
    const { RevenueCalculator } = await import('./calculators/revenue-calculator.js');
    const calculator = new RevenueCalculator();
    
    const [byChannel, byEventType] = await Promise.all([
      calculator.calculateRevenueByChannel(query.venueId, query.timeRange.start, query.timeRange.end),
      calculator.calculateRevenueByEventType(query.venueId, query.timeRange.start, query.timeRange.end)
    ]);

    return { byChannel, byEventType };
  }

  private async calculateTicketSales(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator.js');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateSalesMetrics({
      venueId: query.venueId,
      startDate: query.timeRange.start,
      endDate: query.timeRange.end,
      granularity: query.timeRange.granularity || 'day'
    });
  }

  private async calculateConversionRate(query: AnalyticsQuery) {
    // Get page views from Redis
    const redis: Redis = getRedis();
    const dates = this.getDateRange(query.timeRange.start, query.timeRange.end);
    
    const conversionData = await Promise.all(dates.map(async (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      const trafficKey = `metrics:traffic:${query.venueId}:${dateStr}`;
      const purchaseKey = `metrics:purchase:${query.venueId}:${dateStr}`;
      
      const [traffic, purchase] = await Promise.all([
        redis.hget(trafficKey, 'page_views'),
        redis.hget(purchaseKey, 'total_sales')
      ]);
      
      const views = parseInt(traffic || '0');
      const sales = parseInt(purchase || '0');
      
      return {
        date: dateStr,
        pageViews: views,
        conversions: sales,
        rate: views > 0 ? (sales / views * 100).toFixed(2) : '0.00'
      };
    }));
    
    return conversionData;
  }

  private async calculateCustomerMetrics(query: AnalyticsQuery) {
    const { CustomerAnalytics } = await import('./calculators/customer-analytics.js');
    const analytics = new CustomerAnalytics();
    
    const [clv, churnRisk, segmentation] = await Promise.all([
      analytics.calculateCustomerLifetimeValue(query.venueId),
      analytics.identifyChurnRisk(query.venueId),
      analytics.calculateCustomerSegmentation(query.venueId)
    ]);
    
    return { clv, churnRisk, segmentation };
  }

  private async getTopEvents(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator.js');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateEventPerformance(
      query.venueId,
      query.timeRange.start,
      query.timeRange.end
    );
  }

  private async calculateSalesTrends(query: AnalyticsQuery) {
    const { PredictiveAnalytics } = await import('./calculators/predictive-analytics.js');
    const predictor = new PredictiveAnalytics();
    
    const [seasonal, pricing] = await Promise.all([
      predictor.predictSeasonalTrends(query.venueId),
      predictor.predictOptimalPricing(query.venueId, 'concert') // Default to concert
    ]);
    
    return { seasonal, pricing };
  }

  private generateCacheKey(query: AnalyticsQuery): string {
    return `${query.venueId}:${query.metrics.join(',')}:${query.timeRange.start.toISOString()}:${query.timeRange.end.toISOString()}`;
  }

  private getDateRange(start: Date, end: Date): Date[] {
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

export const analyticsEngine = new AnalyticsEngine();
