import { EventEmitter } from 'events';
import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { emitMetricUpdate } from '../config/websocket';
import { getAnalyticsDb } from '../config/database';

export interface StreamEvent {
  type: string;
  venueId: string;
  data: any;
  timestamp: Date;
}

export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();
  private redis: any; // Lazy loaded
  private analyticsDb: any; // Lazy loaded
  private initialized = false;

  constructor() {
    super();
  }

  private async initialize() {
    if (this.initialized) return;
    
    this.redis = getRedis();
    this.analyticsDb = getAnalyticsDb();
    this.initializeQueues();
    this.initialized = true;
  }

  private initializeQueues() {
    // Create queues for different event types
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan', 
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  // Process incoming events
  async processEvent(type: string, data: StreamEvent) {
    try {
      logger.debug('Processing event', { type, venueId: data.venueId });

      // Emit event for real-time processing
      this.emit(type, data);

      // Update real-time metrics
      await this.updateRealTimeMetrics(type, data);

      // Emit to WebSocket clients (only if WebSocket is initialized)
      try {
        emitMetricUpdate(data.venueId, type, data);
      } catch (e) {
        // WebSocket might not be initialized in tests
      }

      // Store raw event for later processing
      await this.storeRawEvent(type, data);

    } catch (error) {
      logger.error('Failed to process event', { type, error });
    }
  }

  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
    const { venueId, data } = event;

    switch (type) {
      case 'ticket-purchase':
        await this.updatePurchaseMetrics(venueId, data);
        break;
      
      case 'ticket-scan':
        await this.updateScanMetrics(venueId, data);
        break;
      
      case 'page-view':
        await this.updateTrafficMetrics(venueId, data);
        break;
    }
  }

  private async updatePurchaseMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    
    // Update real-time purchase metrics
    const key = `metrics:purchase:${venueId}:${new Date().toISOString().split('T')[0]}`;
    
    await this.redis.hincrby(key, 'total_sales', 1);
    await this.redis.hincrbyfloat(key, 'revenue', data.amount);
    await this.redis.expire(key, 86400); // 24 hour TTL

    // Update database with aggregated metrics
    if (!this.analyticsDb) return;
    
    const hour = new Date().getHours();
    await this.analyticsDb('venue_analytics')
      .insert({
        venue_id: venueId,
        date: new Date(),
        hour: hour,
        tickets_sold: 1,
        revenue: data.amount
      })
      .onConflict(['venue_id', 'date', 'hour'])
      .merge({
        tickets_sold: this.analyticsDb.raw('venue_analytics.tickets_sold + 1'),
        revenue: this.analyticsDb.raw('venue_analytics.revenue + ?', [data.amount]),
        updated_at: new Date()
      });
  }

  private async updateScanMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:scan:${venueId}:${data.eventId}`;
    await this.redis.hincrby(key, 'scanned', 1);
    await this.redis.expire(key, 86400);
  }

  private async updateTrafficMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:traffic:${venueId}:${new Date().toISOString().split('T')[0]}`;
    await this.redis.hincrby(key, 'page_views', 1);
    await this.redis.pfadd(`unique_visitors:${venueId}`, data.sessionId);
    await this.redis.expire(key, 86400);
  }

  private async storeRawEvent(type: string, event: StreamEvent) {
    // Store in MongoDB for later analysis
    // We'll implement this when MongoDB is configured
    logger.debug('Storing raw event', { type, venueId: event.venueId });
  }

  // Public method to push events
  async pushEvent(type: string, event: StreamEvent) {
    await this.initialize();
    
    const queue = this.queues.get(type);
    if (queue) {
      await queue.add(event, {
        removeOnComplete: true,
        removeOnFail: false
      });
    }
  }

  // Subscribe to external events (from other services)
  async subscribeToExternalEvents() {
    await this.initialize();
    
    // Subscribe to Redis pub/sub for cross-service events
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('analytics:events');
    
    subscriber.on('message', async (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        await this.pushEvent(event.type, event);
      } catch (error) {
        logger.error('Failed to process external event', error);
      }
    });
  }
}

export const eventStreamService = new EventStreamService();
