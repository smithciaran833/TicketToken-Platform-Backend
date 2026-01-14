import type Redis from 'ioredis';
import { getRedis } from '../config/redis';
import { getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';
import { emitMetricUpdate, emitAlert } from '../config/websocket';

interface AggregationWindow {
  interval: number; // in seconds
  retention: number; // in seconds
}

export class RealtimeAggregationService {
  private redis!: Redis;
  private _analyticsDb: ReturnType<typeof getAnalyticsDb> | null = null;
  private intervalHandles: NodeJS.Timeout[] = [];
  
  // Lazy initialization to avoid calling getAnalyticsDb() at class construction time
  private get analyticsDb() {
    if (!this._analyticsDb) {
      this._analyticsDb = getAnalyticsDb();
    }
    return this._analyticsDb;
  }
  
  private aggregationWindows: Record<string, AggregationWindow> = {
    '1min': { interval: 60, retention: 3600 },      // 1 hour retention
    '5min': { interval: 300, retention: 86400 },    // 24 hour retention
    '1hour': { interval: 3600, retention: 604800 }, // 7 day retention
  };

  async startAggregationPipeline() {
    logger.info('Starting real-time aggregation pipeline');

    // Initialize Redis client
    this.redis = getRedis();

    // Set up aggregation intervals
    this.setupAggregationIntervals();

    // Set up alert monitoring
    this.setupAlertMonitoring();
  }

  private setupAggregationIntervals() {
    // Use the configuration to set up intervals
    if (this.aggregationWindows['1min']) {
      const interval = setInterval(
        () => this.aggregate1Minute(), 
        this.aggregationWindows['1min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
    }

    if (this.aggregationWindows['5min']) {
      const interval = setInterval(
        () => this.aggregate5Minutes(), 
        this.aggregationWindows['5min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
    }

    if (this.aggregationWindows['1hour']) {
      const interval = setInterval(
        () => this.aggregateHourly(), 
        this.aggregationWindows['1hour'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
    }
  }

  // Method to stop all intervals (useful for cleanup)
  stopAggregationPipeline() {
    this.intervalHandles.forEach(handle => clearInterval(handle));
    this.intervalHandles = [];
    logger.info('Stopped aggregation pipeline');
  }

  private async aggregate1Minute() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['1min'].retention;

      for (const venueId of venues) {
        const metrics = await this.calculate1MinuteMetrics(venueId);

        // Store in real-time metrics table with configured retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '1min_summary',
            metric_value: metrics,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket
        emitMetricUpdate(venueId, 'realtime-summary', metrics);

        // Check for alerts
        await this.checkAlertConditions(venueId, metrics);
      }
    } catch (error) {
      logger.error('Failed to run 1-minute aggregation', error);
    }
  }

  private async calculate1MinuteMetrics(venueId: string) {
    const now = new Date();

    // Get Redis metrics
    const purchaseKey = `metrics:purchase:${venueId}:${now.toISOString().split('T')[0]}`;
    const trafficKey = `metrics:traffic:${venueId}:${now.toISOString().split('T')[0]}`;

    const [purchases, traffic] = await Promise.all([
      this.redis.hgetall(purchaseKey),
      this.redis.hgetall(trafficKey)
    ]);

    // Calculate rates
    const salesRate = parseInt(purchases.total_sales || '0') / 60; // per second
    const trafficRate = parseInt(traffic.page_views || '0') / 60;

    return {
      timestamp: now,
      sales: {
        count: parseInt(purchases.total_sales || '0'),
        revenue: parseFloat(purchases.revenue || '0'),
        rate: salesRate
      },
      traffic: {
        pageViews: parseInt(traffic.page_views || '0'),
        rate: trafficRate
      },
      conversion: {
        rate: trafficRate > 0 ? salesRate / trafficRate : 0
      }
    };
  }

  private async aggregate5Minutes() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['5min'].retention;

      for (const venueId of venues) {
        // Get 5-minute rolling metrics
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const today = now.toISOString().split('T')[0];
        
        const purchaseKey = `metrics:purchase:${venueId}:${today}`;
        const trafficKey = `metrics:traffic:${venueId}:${today}`;

        const [purchases, traffic] = await Promise.all([
          this.redis.hgetall(purchaseKey),
          this.redis.hgetall(trafficKey)
        ]);

        // Calculate 5-minute aggregates
        const metrics = {
          timestamp: now,
          window: '5min',
          sales: {
            count: parseInt(purchases.total_sales || '0'),
            revenue: parseFloat(purchases.revenue || '0'),
            averageOrderValue: purchases.total_sales && parseInt(purchases.total_sales) > 0
              ? parseFloat(purchases.revenue || '0') / parseInt(purchases.total_sales)
              : 0
          },
          traffic: {
            pageViews: parseInt(traffic.page_views || '0'),
            uniqueVisitors: parseInt(traffic.unique_visitors || '0')
          },
          conversion: {
            rate: traffic.page_views && parseInt(traffic.page_views) > 0
              ? parseInt(purchases.total_sales || '0') / parseInt(traffic.page_views)
              : 0
          }
        };

        // Store in database with retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '5min_summary',
            metric_value: JSON.stringify(metrics),
            created_at: now,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket for real-time dashboards
        emitMetricUpdate(venueId, '5min-summary', metrics);
      }
      
      logger.debug('5-minute aggregation completed', { venueCount: venues.length });
    } catch (error) {
      logger.error('Failed to run 5-minute aggregation', error);
    }
  }

  private async aggregateHourly() {
    try {
      const venues = await this.getActiveVenues();

      for (const venueId of venues) {
        // Calculate hourly metrics
        const hour = new Date().getHours();
        const today = new Date().toISOString().split('T')[0];

        // Get all Redis metrics for the hour
        const hourlyMetrics = await this.calculateHourlyMetrics(venueId);

        // Update database
        await this.analyticsDb('venue_analytics')
          .where({
            venue_id: venueId,
            date: today,
            hour: hour
          })
          .update({
            unique_customers: hourlyMetrics.uniqueCustomers,
            events_active: hourlyMetrics.activeEvents,
            updated_at: new Date()
          });
      }
    } catch (error) {
      logger.error('Failed to run hourly aggregation', error);
    }
  }

  private async calculateHourlyMetrics(venueId: string) {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentHour = now.getHours();
      
      // Get customer data from Redis
      const customerKey = `metrics:customers:${venueId}:${today}`;
      const eventKey = `metrics:events:${venueId}:${today}`;
      
      const [customerData, eventData] = await Promise.all([
        this.redis.hgetall(customerKey),
        this.redis.hgetall(eventKey)
      ]);
      
      // Count unique customers from set
      const uniqueCustomersKey = `unique:customers:${venueId}:${today}:${currentHour}`;
      const uniqueCustomerCount = await this.redis.scard(uniqueCustomersKey);
      
      // Get active events count from database
      const activeEventsResult = await this.analyticsDb('events')
        .where('venue_id', venueId)
        .where('status', 'active')
        .whereRaw('start_time <= NOW()')
        .whereRaw('end_time >= NOW()')
        .count('* as count')
        .first();
      
      return {
        uniqueCustomers: uniqueCustomerCount || parseInt(customerData.unique_count || '0'),
        activeEvents: parseInt(String(activeEventsResult?.count || '0')),
        totalSessions: parseInt(customerData.sessions || '0'),
        averageSessionDuration: parseFloat(customerData.avg_duration || '0'),
        ticketsSold: parseInt(eventData.tickets_sold || '0'),
        revenue: parseFloat(eventData.revenue || '0')
      };
    } catch (error) {
      logger.error('Failed to calculate hourly metrics', { venueId, error });
      return {
        uniqueCustomers: 0,
        activeEvents: 0,
        totalSessions: 0,
        averageSessionDuration: 0,
        ticketsSold: 0,
        revenue: 0
      };
    }
  }

  private async getActiveVenues(): Promise<string[]> {
    // Get venues with recent activity
    const result = await this.analyticsDb('venue_analytics')
      .distinct('venue_id')
      .where('updated_at', '>', new Date(Date.now() - 86400000)) // Last 24 hours
      .pluck('venue_id');

    return result;
  }

  private setupAlertMonitoring() {
    // Monitor for alert conditions
    setInterval(() => this.monitorAlerts(), 30000); // Every 30 seconds
  }

  private async checkAlertConditions(venueId: string, metrics: any) {
    // High traffic alert
    if (metrics.traffic.rate > 100) { // 100 views per second
      await this.createAlert(venueId, {
        type: 'high_traffic',
        severity: 'info',
        message: `High traffic detected: ${metrics.traffic.rate.toFixed(2)} views/second`,
        data: metrics.traffic
      });
    }

    // Low conversion alert
    if (metrics.traffic.pageViews > 1000 && metrics.conversion.rate < 0.01) {
      await this.createAlert(venueId, {
        type: 'low_conversion',
        severity: 'warning',
        message: `Low conversion rate: ${(metrics.conversion.rate * 100).toFixed(2)}%`,
        data: metrics.conversion
      });
    }
  }

  private async createAlert(venueId: string, alert: any) {
    // Store alert
    await this.analyticsDb('venue_alerts')
      .insert({
        venue_id: venueId,
        alert_name: alert.type,
        is_active: true
      });

    // Emit alert via WebSocket
    emitAlert(venueId, alert);
  }

  private async monitorAlerts() {
    // Monitor and clear expired alerts
    logger.debug('Monitoring alerts');
  }
}

export const realtimeAggregationService = new RealtimeAggregationService();
