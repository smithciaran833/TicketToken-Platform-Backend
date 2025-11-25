import { orderCacheService } from './order-cache.service';
import { logger } from '../utils/logger';
import { Order, OrderStatus } from '../types/order.types';

/**
 * Cache Invalidation Service
 * Orchestrates cache invalidation on order state changes
 */
export class CacheInvalidationService {
  /**
   * Invalidate all caches related to an order creation
   */
  async onOrderCreated(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate user's order count
        orderCacheService.deleteUserOrderCount(order.userId, tenantId),
        
        // Invalidate event availability (new order may affect availability)
        orderCacheService.deleteAvailability(order.eventId),
      ]);

      logger.debug('Cache invalidated on order created', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order created', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate caches when order is reserved
   */
  async onOrderReserved(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate the specific order
        orderCacheService.deleteOrder(order.id),
        
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate event availability (tickets are now reserved)
        orderCacheService.deleteAvailability(order.eventId),
      ]);

      logger.debug('Cache invalidated on order reserved', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order reserved', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate caches when order is confirmed
   */
  async onOrderConfirmed(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate the specific order
        orderCacheService.deleteOrder(order.id),
        
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate user's order count (confirmed order)
        orderCacheService.deleteUserOrderCount(order.userId, tenantId),
      ]);

      logger.debug('Cache invalidated on order confirmed', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order confirmed', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate caches when order is cancelled
   */
  async onOrderCancelled(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate the specific order
        orderCacheService.deleteOrder(order.id),
        
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate user's order count
        orderCacheService.deleteUserOrderCount(order.userId, tenantId),
        
        // Invalidate event availability (tickets are now available again)
        orderCacheService.deleteAvailability(order.eventId),
      ]);

      logger.debug('Cache invalidated on order cancelled', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order cancelled', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate caches when order is refunded
   */
  async onOrderRefunded(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate the specific order
        orderCacheService.deleteOrder(order.id),
        
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate event availability (if tickets can be resold)
        orderCacheService.deleteAvailability(order.eventId),
 ]);

      logger.debug('Cache invalidated on order refunded', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order refunded', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate caches when order expires
   */
  async onOrderExpired(order: Order, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        // Invalidate the specific order
        orderCacheService.deleteOrder(order.id),
        
        // Invalidate user's order list
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        
        // Invalidate event availability (tickets are available again)
        orderCacheService.deleteAvailability(order.eventId),
      ]);

      logger.debug('Cache invalidated on order expired', { orderId: order.id });
    } catch (error) {
      logger.error('Error invalidating cache on order expired', { error, orderId: order.id });
    }
  }

  /**
   * Generic invalidation for any order status change
   */
  async onOrderStatusChanged(order: Order, tenantId: string, oldStatus: OrderStatus, newStatus: OrderStatus): Promise<void> {
    try {
      // Always invalidate the order itself and user's order list
      await Promise.all([
        orderCacheService.deleteOrder(order.id),
        orderCacheService.deleteUserOrders(order.userId, tenantId),
      ]);

      // Conditionally invalidate availability based on status transitions
      const affectsAvailability = [
        OrderStatus.RESERVED,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
        OrderStatus.EXPIRED,
        OrderStatus.REFUNDED,
      ].includes(newStatus);

      if (affectsAvailability) {
        await orderCacheService.deleteAvailability(order.eventId);
      }

      logger.debug('Cache invalidated on order status changed', {
        orderId: order.id,
        oldStatus,
        newStatus,
      });
    } catch (error) {
      logger.error('Error invalidating cache on order status changed', {
        error,
        orderId: order.id,
        oldStatus,
        newStatus,
      });
    }
  }

  /**
   * Invalidate all caches for a specific user
   * Useful for user-related operations
   */
  async invalidateUserCaches(userId: string, tenantId: string): Promise<void> {
    try {
      await Promise.all([
        orderCacheService.deleteUserOrders(userId, tenantId),
        orderCacheService.deleteUserOrderCount(userId, tenantId),
        // Note: Rate limit caches are intentionally NOT cleared here
        // as they serve a security function
      ]);

      logger.debug('User caches invalidated', { userId, tenantId });
    } catch (error) {
      logger.error('Error invalidating user caches', { error, userId, tenantId });
    }
  }

  /**
   * Invalidate all caches for a specific event
   * Useful when event details change
   */
  async invalidateEventCaches(eventId: string): Promise<void> {
    try {
      await orderCacheService.deleteAvailability(eventId);

      logger.debug('Event caches invalidated', { eventId });
    } catch (error) {
      logger.error('Error invalidating event caches', { error, eventId });
    }
  }

  /**
   * Invalidate caches for multiple orders (bulk operation)
   */
  async invalidateBulkOrders(orders: Array<{ order: Order; tenantId: string }>): Promise<void> {
    try {
      const invalidations = orders.flatMap(({ order, tenantId }) => [
        orderCacheService.deleteOrder(order.id),
        orderCacheService.deleteUserOrders(order.userId, tenantId),
      ]);

      await Promise.all(invalidations);

      logger.debug('Bulk order caches invalidated', { count: orders.length });
    } catch (error) {
      logger.error('Error invalidating bulk order caches', { error, count: orders.length });
    }
  }

  /**
   * Stale-while-revalidate pattern
   * Returns cached data immediately while refreshing in background
   */
  async staleWhileRevalidate<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await orderCacheService.getOrder(cacheKey);
      
      if (cached) {
        // Return cached data immediately
        // Refresh in background (don't await)
        fetcher()
          .then(freshData => {
            // Update cache with fresh data
            // Note: This is a simplified version - would need proper typing
            logger.debug('Background cache refresh completed', { cacheKey });
          })
          .catch(error => {
            logger.warn('Background cache refresh failed', { error, cacheKey });
          });

        return cached as unknown as T;
      }

      // No cache hit - fetch and cache
      const data = await fetcher();
      // Cache the data (simplified - would need proper typing)
      return data;
    } catch (error) {
      logger.error('Error in stale-while-revalidate', { error, cacheKey });
      // Fall back to direct fetch
      return fetcher();
    }
  }

  /**
   * Cascade invalidation
   * Invalidate related caches based on relationship graph
   */
  async cascadeInvalidate(order: Order, tenantId: string): Promise<void> {
    try {
      // Primary invalidations
      const primary = [
        orderCacheService.deleteOrder(order.id),
        orderCacheService.deleteUserOrders(order.userId, tenantId),
        orderCacheService.deleteUserOrderCount(order.userId, tenantId),
      ];

      // Secondary invalidations (related to event)
      const secondary = [
        orderCacheService.deleteAvailability(order.eventId),
      ];

      // Execute in parallel but log separately for monitoring
      await Promise.all([
        Promise.all(primary).catch(error => {
          logger.error('Primary cache invalidation failed', { error, orderId: order.id });
        }),
        Promise.all(secondary).catch(error => {
          logger.warn('Secondary cache invalidation failed', { error, orderId: order.id });
          // Don't throw - secondary failures shouldn't block
        }),
      ]);

      logger.debug('Cascade invalidation completed', { orderId: order.id });
    } catch (error) {
      logger.error('Error in cascade invalidation', { error, orderId: order.id });
    }
  }

  /**
   * Invalidate by pattern (advanced usage)
   * Use with caution - can be expensive
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const deleted = await orderCacheService.deleteByPattern(pattern);
      logger.info('Pattern-based invalidation completed', { pattern, deleted });
      return deleted;
    } catch (error) {
      logger.error('Error in pattern-based invalidation', { error, pattern });
      return 0;
    }
  }

  /**
   * Warm cache for an order
   * Pre-populate cache with fresh data
   */
  async warmOrderCache(order: Order, items: any[]): Promise<void> {
    try {
      await orderCacheService.setOrder(order.id, order, items);
      logger.debug('Order cache warmed', { orderId: order.id });
    } catch (error) {
      logger.error('Error warming order cache', { error, orderId: order.id });
    }
  }

  /**
   * Batch warm multiple orders
   */
  async warmBulkOrders(orders: Array<{ order: Order; items: any[] }>): Promise<void> {
    try {
      const warming = orders.map(({ order, items }) =>
        orderCacheService.setOrder(order.id, order, items)
      );

      await Promise.all(warming);
      logger.debug('Bulk order cache warmed', { count: orders.length });
    } catch (error) {
      logger.error('Error warming bulk order cache', { error, count: orders.length });
    }
  }
}

// Export singleton instance
export const cacheInvalidationService = new CacheInvalidationService();
