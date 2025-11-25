import { RedisService } from './redis.service';
import { logger } from '../utils/logger';
import { OrderEvents } from '../events/event-types';

export interface EventMetrics {
  eventType: string;
  published: number;
  consumed: number;
  failed: number;
  averageProcessingTimeMs: number;
}

/**
 * Event Monitoring Service
 * Tracks event publication and consumption metrics
 */
export class EventMonitoringService {
  private readonly METRICS_PREFIX = 'event:metrics:';
  private readonly METRICS_TTL = 86400 * 7; // 7 days

  /**
   * Record event publication
   */
  async recordPublished(eventType: OrderEvents): Promise<void> {
    const key = `${this.METRICS_PREFIX}${eventType}:published`;
    
    try {
      const client = RedisService.getClient();
      await client.incr(key);
      await client.expire(key, this.METRICS_TTL);
    } catch (error) {
      logger.warn('Failed to record published event metric', { error, eventType });
    }
  }

  /**
   * Record event consumption
   */
  async recordConsumed(eventType: OrderEvents, processingTimeMs: number): Promise<void> {
    const client = RedisService.getClient();
    
    try {
      // Increment consumed count
      const countKey = `${this.METRICS_PREFIX}${eventType}:consumed`;
      await client.incr(countKey);
      await client.expire(countKey, this.METRICS_TTL);
      
      // Track processing time (use sorted set for average calculation)
      const timeKey = `${this.METRICS_PREFIX}${eventType}:processing_times`;
      await client.zadd(timeKey, Date.now(), String(processingTimeMs));
      await client.expire(timeKey, this.METRICS_TTL);
      
      // Keep only last 1000 samples
      await client.zremrangebyrank(timeKey, 0, -1001);
    } catch (error) {
      logger.warn('Failed to record consumed event metric', { error, eventType });
    }
  }

  /**
   * Record event consumption failure
   */
  async recordFailed(eventType: OrderEvents): Promise<void> {
    const key = `${this.METRICS_PREFIX}${eventType}:failed`;
    
    try {
      const client = RedisService.getClient();
      await client.incr(key);
      await client.expire(key, this.METRICS_TTL);
    } catch (error) {
      logger.warn('Failed to record failed event metric', { error, eventType });
    }
  }

  /**
   * Get metrics for a specific event type
   */
  async getMetrics(eventType: OrderEvents): Promise<EventMetrics> {
    const client = RedisService.getClient();
    
    try {
      const [published, consumed, failed, processingTimes] = await Promise.all([
        client.get(`${this.METRICS_PREFIX}${eventType}:published`),
        client.get(`${this.METRICS_PREFIX}${eventType}:consumed`),
        client.get(`${this.METRICS_PREFIX}${eventType}:failed`),
        client.zrange(`${this.METRICS_PREFIX}${eventType}:processing_times`, 0, -1),
      ]);
      
      // Calculate average processing time
      let averageProcessingTimeMs = 0;
      if (processingTimes && processingTimes.length > 0) {
        const sum = processingTimes.reduce((acc, time) => acc + parseInt(time, 10), 0);
        averageProcessingTimeMs = Math.round(sum / processingTimes.length);
      }
      
      return {
        eventType,
        published: published ? parseInt(published, 10) : 0,
        consumed: consumed ? parseInt(consumed, 10) : 0,
        failed: failed ? parseInt(failed, 10) : 0,
        averageProcessingTimeMs,
      };
    } catch (error) {
      logger.error('Failed to get event metrics', { error, eventType });
      return {
        eventType,
        published: 0,
        consumed: 0,
        failed: 0,
        averageProcessingTimeMs: 0,
      };
    }
  }

  /**
   * Get metrics for all event types
   */
  async getAllMetrics(): Promise<EventMetrics[]> {
    const eventTypes = Object.values(OrderEvents);
    const metricsPromises = eventTypes.map(eventType => this.getMetrics(eventType));
    
    try {
      return await Promise.all(metricsPromises);
    } catch (error) {
      logger.error('Failed to get all event metrics', { error });
      return [];
    }
  }

  /**
   * Reset metrics for an event type
   */
  async resetMetrics(eventType: OrderEvents): Promise<void> {
    const client = RedisService.getClient();
    
    try {
      await Promise.all([
        client.del(`${this.METRICS_PREFIX}${eventType}:published`),
        client.del(`${this.METRICS_PREFIX}${eventType}:consumed`),
        client.del(`${this.METRICS_PREFIX}${eventType}:failed`),
        client.del(`${this.METRICS_PREFIX}${eventType}:processing_times`),
      ]);
      
      logger.info('Event metrics reset', { eventType });
    } catch (error) {
      logger.error('Failed to reset event metrics', { error, eventType });
      throw error;
    }
  }
}

export const eventMonitoringService = new EventMonitoringService();
