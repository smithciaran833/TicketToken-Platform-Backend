import { RedisService } from './redis.service';
import { logger } from '../utils/logger';
import {
  cacheConfig,
  getOrderCacheKey,
  getUserOrdersCacheKey,
  getUserOrderCountCacheKey,
  getEventOrderCountCacheKey,
  getRateLimitCacheKey,
  getAvailabilityCacheKey,
  getTicketTypeCacheKey,
  getAnalyticsCacheKey,
} from '../config/cache.config';
import { Order, OrderItem } from '../types/order.types';

interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalOperationTime: number;
}

interface CacheStats {
  hitRate: number;
  missRate: number;
  totalOperations: number;
  averageOperationTime: number;
  metrics: Record<string, CacheMetrics>;
}

/**
 * Order Cache Service
 * Comprehensive caching layer for orders with metrics tracking
 */
export class OrderCacheService {
  private metrics: Record<string, CacheMetrics> = {};
  private enabled: boolean;

  constructor() {
    this.enabled = cacheConfig.monitoring.enabled;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const patterns = Object.values(cacheConfig.keys);
    patterns.forEach(pattern => {
      this.metrics[pattern] = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        totalOperationTime: 0,
      };
    });
  }

  private recordMetric(
    pattern: string,
    operation: 'hit' | 'miss' | 'set' | 'delete' | 'error',
    duration: number = 0
  ): void {
    if (!this.enabled) return;

    if (!this.metrics[pattern]) {
      this.initializeMetrics();
    }

    const metric = this.metrics[pattern];
    
    switch (operation) {
      case 'hit':
        metric.hits++;
        break;
      case 'miss':
        metric.misses++;
        break;
      case 'set':
        metric.sets++;
        break;
      case 'delete':
        metric.deletes++;
        break;
      case 'error':
        metric.errors++;
        break;
    }

    metric.totalOperationTime += duration;

    // Log slow operations
    if (duration > cacheConfig.monitoring.slowOperationThresholdMs) {
      logger.warn('Slow cache operation detected', {
        pattern,
        operation,
        duration: `${duration}ms`,
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const stats: CacheStats = {
      hitRate: 0,
      missRate: 0,
      totalOperations: 0,
      averageOperationTime: 0,
      metrics: this.metrics,
    };

    let totalHits = 0;
    let totalMisses = 0;
    let totalTime = 0;
    let totalOps = 0;

    Object.values(this.metrics).forEach(metric => {
      totalHits += metric.hits;
      totalMisses += metric.misses;
      totalTime += metric.totalOperationTime;
      totalOps += metric.hits + metric.misses + metric.sets + metric.deletes;
    });

    const totalReads = totalHits + totalMisses;
    stats.hitRate = totalReads > 0 ? (totalHits / totalReads) * 100 : 0;
    stats.missRate = totalReads > 0 ? (totalMisses / totalReads) * 100 : 0;
    stats.totalOperations = totalOps;
    stats.averageOperationTime = totalOps > 0 ? totalTime / totalOps : 0;

    return stats;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.initializeMetrics();
  }

  // ============================================================================
  // TASK 1: Order Caching
  // ============================================================================

  /**
   * Get cached order
   */
  async getOrder(orderId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const startTime = Date.now();
    const key = getOrderCacheKey(orderId);

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(cacheConfig.keys.order, 'hit', duration);
        return JSON.parse(cached);
      }

      this.recordMetric(cacheConfig.keys.order, 'miss', duration);
      return null;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.order, 'error', Date.now() - startTime);
      logger.error('Error getting cached order', { error, orderId });
      return null;
    }
  }

  /**
   * Cache an order
   */
  async setOrder(orderId: string, order: Order, items: OrderItem[]): Promise<void> {
    const startTime = Date.now();
    const key = getOrderCacheKey(orderId);

    try {
      await RedisService.set(
        key,
        JSON.stringify({ order, items }),
        cacheConfig.ttl.order
      );
      this.recordMetric(cacheConfig.keys.order, 'set', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.order, 'error', Date.now() - startTime);
      logger.error('Error caching order', { error, orderId });
    }
  }

  /**
   * Get cached user orders
   */
  async getUserOrders(userId: string, tenantId: string): Promise<Order[] | null> {
    const startTime = Date.now();
    const key = getUserOrdersCacheKey(userId, tenantId);

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(cacheConfig.keys.userOrders, 'hit', duration);
        return JSON.parse(cached);
      }

      this.recordMetric(cacheConfig.keys.userOrders, 'miss', duration);
      return null;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrders, 'error', Date.now() - startTime);
      logger.error('Error getting cached user orders', { error, userId, tenantId });
      return null;
    }
  }

  /**
   * Cache user orders
   */
  async setUserOrders(userId: string, tenantId: string, orders: Order[]): Promise<void> {
    const startTime = Date.now();
    const key = getUserOrdersCacheKey(userId, tenantId);

    try {
      await RedisService.set(
        key,
        JSON.stringify(orders),
        cacheConfig.ttl.userOrders
      );
      this.recordMetric(cacheConfig.keys.userOrders, 'set', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrders, 'error', Date.now() - startTime);
      logger.error('Error caching user orders', { error, userId, tenantId });
    }
  }

  // ============================================================================
  // TASK 2: User Order Count Caching (Rate Limiting)
  // ============================================================================

  /**
   * Get user order count
   */
  async getUserOrderCount(userId: string, tenantId: string): Promise<number | null> {
    const startTime = Date.now();
    const key = getUserOrderCountCacheKey(userId, tenantId);

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(cacheConfig.keys.userOrderCount, 'hit', duration);
        return parseInt(cached, 10);
      }

      this.recordMetric(cacheConfig.keys.userOrderCount, 'miss', duration);
      return null;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrderCount, 'error', Date.now() - startTime);
      logger.error('Error getting cached user order count', { error, userId, tenantId });
      return null;
    }
  }

  /**
   * Set user order count
   */
  async setUserOrderCount(userId: string, tenantId: string, count: number): Promise<void> {
    const startTime = Date.now();
    const key = getUserOrderCountCacheKey(userId, tenantId);

    try {
      await RedisService.set(
        key,
        count.toString(),
        cacheConfig.ttl.orderCount
      );
      this.recordMetric(cacheConfig.keys.userOrderCount, 'set', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrderCount, 'error', Date.now() - startTime);
      logger.error('Error caching user order count', { error, userId, tenantId, count });
    }
  }

  /**
   * Increment user order count
   */
  async incrementUserOrderCount(userId: string, tenantId: string): Promise<number> {
    const startTime = Date.now();
    const key = getUserOrderCountCacheKey(userId, tenantId);

    try {
      const client = RedisService.getClient();
      const newCount = await client.incr(key);
      await client.expire(key, cacheConfig.ttl.orderCount);
      
      this.recordMetric(cacheConfig.keys.userOrderCount, 'set', Date.now() - startTime);
      return newCount;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrderCount, 'error', Date.now() - startTime);
      logger.error('Error incrementing user order count', { error, userId, tenantId });
      return 0;
    }
  }

  /**
   * Get rate limit counter
   */
  async getRateLimitCount(userId: string, window: 'hourly' | 'daily'): Promise<number> {
    const startTime = Date.now();
    const key = getRateLimitCacheKey(userId, window);
    const pattern = window === 'hourly' ? cacheConfig.keys.rateLimitHourly : cacheConfig.keys.rateLimitDaily;

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(pattern, 'hit', duration);
        return parseInt(cached, 10);
      }

      this.recordMetric(pattern, 'miss', duration);
      return 0;
    } catch (error) {
      this.recordMetric(pattern, 'error', Date.now() - startTime);
      logger.error('Error getting rate limit count', { error, userId, window });
      return 0;
    }
  }

  /**
   * Increment rate limit counter
   */
  async incrementRateLimitCount(userId: string, window: 'hourly' | 'daily'): Promise<number> {
    const startTime = Date.now();
    const key = getRateLimitCacheKey(userId, window);
    const pattern = window === 'hourly' ? cacheConfig.keys.rateLimitHourly : cacheConfig.keys.rateLimitDaily;
    const ttl = window === 'hourly' ? cacheConfig.ttl.rateLimitHourly : cacheConfig.ttl.rateLimitDaily;

    try {
      const client = RedisService.getClient();
      const newCount = await client.incr(key);
      await client.expire(key, ttl);
      
      this.recordMetric(pattern, 'set', Date.now() - startTime);
      return newCount;
    } catch (error) {
      this.recordMetric(pattern, 'error', Date.now() - startTime);
      logger.error('Error incrementing rate limit count', { error, userId, window });
      return 0;
    }
  }

  // ============================================================================
  // TASK 3: Event Availability Caching
  // ============================================================================

  /**
   * Get cached event availability
   */
  async getAvailability(eventId: string): Promise<Record<string, number> | null> {
    const startTime = Date.now();
    const key = getAvailabilityCacheKey(eventId);

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(cacheConfig.keys.availability, 'hit', duration);
        return JSON.parse(cached);
      }

      this.recordMetric(cacheConfig.keys.availability, 'miss', duration);
      return null;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.availability, 'error', Date.now() - startTime);
      logger.error('Error getting cached availability', { error, eventId });
      return null;
    }
  }

  /**
   * Cache event availability
   */
  async setAvailability(eventId: string, availability: Record<string, number>): Promise<void> {
    const startTime = Date.now();
    const key = getAvailabilityCacheKey(eventId);

    try {
      await RedisService.set(
        key,
        JSON.stringify(availability),
        cacheConfig.ttl.availability
      );
      this.recordMetric(cacheConfig.keys.availability, 'set', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.availability, 'error', Date.now() - startTime);
      logger.error('Error caching availability', { error, eventId });
    }
  }

  /**
   * Get cached ticket type availability
   */
  async getTicketTypeAvailability(ticketTypeId: string): Promise<number | null> {
    const startTime = Date.now();
    const key = getTicketTypeCacheKey(ticketTypeId);

    try {
      const cached = await RedisService.get(key);
      const duration = Date.now() - startTime;

      if (cached) {
        this.recordMetric(cacheConfig.keys.ticketType, 'hit', duration);
        return parseInt(cached, 10);
      }

      this.recordMetric(cacheConfig.keys.ticketType, 'miss', duration);
      return null;
    } catch (error) {
      this.recordMetric(cacheConfig.keys.ticketType, 'error', Date.now() - startTime);
      logger.error('Error getting cached ticket type availability', { error, ticketTypeId });
      return null;
    }
  }

  /**
   * Cache ticket type availability
   */
  async setTicketTypeAvailability(ticketTypeId: string, availability: number): Promise<void> {
    const startTime = Date.now();
    const key = getTicketTypeCacheKey(ticketTypeId);

    try {
      await RedisService.set(
        key,
        availability.toString(),
        cacheConfig.ttl.ticketType
      );
      this.recordMetric(cacheConfig.keys.ticketType, 'set', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.ticketType, 'error', Date.now() - startTime);
      logger.error('Error caching ticket type availability', { error, ticketTypeId });
    }
  }

  // ============================================================================
  // TASK 4: Cache Invalidation (will be extended by cache-invalidation.service)
  // ============================================================================

  /**
   * Delete cached order
   */
  async deleteOrder(orderId: string): Promise<void> {
    const startTime = Date.now();
    const key = getOrderCacheKey(orderId);

    try {
      await RedisService.del(key);
      this.recordMetric(cacheConfig.keys.order, 'delete', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.order, 'error', Date.now() - startTime);
      logger.error('Error deleting cached order', { error, orderId });
    }
  }

  /**
   * Delete cached user orders
   */
  async deleteUserOrders(userId: string, tenantId: string): Promise<void> {
    const startTime = Date.now();
    const key = getUserOrdersCacheKey(userId, tenantId);

    try {
      await RedisService.del(key);
      this.recordMetric(cacheConfig.keys.userOrders, 'delete', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrders, 'error', Date.now() - startTime);
      logger.error('Error deleting cached user orders', { error, userId, tenantId });
    }
  }

  /**
   * Delete cached user order count
   */
  async deleteUserOrderCount(userId: string, tenantId: string): Promise<void> {
    const startTime = Date.now();
    const key = getUserOrderCountCacheKey(userId, tenantId);

    try {
      await RedisService.del(key);
      this.recordMetric(cacheConfig.keys.userOrderCount, 'delete', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.userOrderCount, 'error', Date.now() - startTime);
      logger.error('Error deleting cached user order count', { error, userId, tenantId });
    }
  }

  /**
   * Delete cached availability
   */
  async deleteAvailability(eventId: string): Promise<void> {
    const startTime = Date.now();
    const key = getAvailabilityCacheKey(eventId);

    try {
      await RedisService.del(key);
      this.recordMetric(cacheConfig.keys.availability, 'delete', Date.now() - startTime);
    } catch (error) {
      this.recordMetric(cacheConfig.keys.availability, 'error', Date.now() - startTime);
      logger.error('Error deleting cached availability', { error, eventId });
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deleteByPattern(pattern: string): Promise<number> {
    const startTime = Date.now();

    try {
      const client = RedisService.getClient();
      const keys = await client.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await client.del(...keys);
      
      logger.info('Deleted cache keys by pattern', { pattern, count: deleted });
      return deleted;
    } catch (error) {
      logger.error('Error deleting cache keys by pattern', { error, pattern });
      return 0;
    }
  }

  /**
   * Flush all cache
   */
  async flushAll(): Promise<void> {
    try {
      const client = RedisService.getClient();
      await client.flushdb();
      logger.info('Flushed all cache');
    } catch (error) {
      logger.error('Error flushing cache', { error });
    }
  }
}

// Export singleton instance
export const orderCacheService = new OrderCacheService();
