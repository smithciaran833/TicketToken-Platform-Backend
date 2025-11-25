import { JobExecutor, JobConfig } from './job-executor';
import { getDatabase } from '../config/database';
import { orderCacheService } from '../services/order-cache.service';
import { cacheInvalidationService } from '../services/cache-invalidation.service';
import { cacheConfig } from '../config/cache.config';
import { Order, OrderItem } from '../types/order.types';

/**
 * Cache Warming Job
 * Pre-loads frequently accessed data into cache on startup and periodically
 */
export class CacheWarmingJob extends JobExecutor {
  constructor() {
    const config: JobConfig = {
      name: 'cache-warming',
      enabled: cacheConfig.warming.enabled,
      intervalSeconds: cacheConfig.warming.intervalSeconds,
      enableRetry: true,
      retryOptions: {
        maxAttempts: 2,
        delayMs: 3000,
        backoffMultiplier: 1.5,
        maxDelayMs: 10000,
      },
      enableCircuitBreaker: false, // Not needed for cache warming
      enableDistributedLock: true, // Prevent multiple instances warming simultaneously
      lockTTLMs: 120000, // 2 minutes
      timeoutMs: 180000, // 3 minutes
    };

    super(config);
  }

  protected async executeCore(): Promise<void> {
    const db = getDatabase();
    let totalWarmed = 0;

    try {
      // 1. Warm hot orders (last 24 hours)
      const hotOrdersWarmed = await this.warmHotOrders(db);
      totalWarmed += hotOrdersWarmed;

      // 2. Warm VIP user orders (if enabled)
      if (cacheConfig.warming.vipUserOrdersEnabled) {
        const vipOrdersWarmed = await this.warmVIPUserOrders(db);
        totalWarmed += vipOrdersWarmed;
      }

      // 3. Warm top events availability
      const eventsWarmed = await this.warmTopEventsAvailability(db);
      totalWarmed += eventsWarmed;

      this.jobLogger.info('Cache warming completed', {
        totalWarmed,
        hotOrdersWarmed,
        vipOrdersWarmed: cacheConfig.warming.vipUserOrdersEnabled ? 'enabled' : 'disabled',
        eventsWarmed,
      });
    } catch (error) {
      this.jobLogger.error('Cache warming failed', { error, totalWarmed });
      throw error;
    }
  }

  /**
   * Warm cache for hot orders (orders from last 24 hours)
   */
  private async warmHotOrders(db: any): Promise<number> {
    try {
      const hoursAgo = cacheConfig.warming.hotOrdersHours;
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      // Get recent orders
      const result = await db.query(
        `
        SELECT o.*, oi.ticket_type_id, oi.quantity, oi.unit_price_cents, oi.total_price_cents
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.created_at >= $1
        AND o.status IN ('PENDING', 'RESERVED', 'CONFIRMED')
        ORDER BY o.created_at DESC
        LIMIT 1000
        `,
        [cutoffTime]
      );

      if (result.rows.length === 0) {
        this.jobLogger.debug('No hot orders to warm');
        return 0;
      }

      // Group orders and their items
      const ordersMap = new Map<string, { order: Order; items: OrderItem[] }>();

      for (const row of result.rows) {
        const orderId = row.id;

        if (!ordersMap.has(orderId)) {
          const order: Order = {
            id: row.id,
            orderNumber: row.order_number,
            userId: row.user_id,
            eventId: row.event_id,
            status: row.status,
            subtotalCents: row.subtotal_cents,
            platformFeeCents: row.platform_fee_cents,
            processingFeeCents: row.processing_fee_cents,
            taxCents: row.tax_cents,
            discountCents: row.discount_cents,
            totalCents: row.total_cents,
            currency: row.currency,
            paymentIntentId: row.payment_intent_id,
            expiresAt: row.expires_at,
            confirmedAt: row.confirmed_at,
            cancelledAt: row.cancelled_at,
            refundedAt: row.refunded_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            idempotencyKey: row.idempotency_key,
            metadata: row.metadata,
          };

          ordersMap.set(orderId, { order, items: [] });
        }

        // Add item if exists
        if (row.ticket_type_id) {
          const item: OrderItem = {
            id: row.id,
            orderId: row.order_id,
            ticketTypeId: row.ticket_type_id,
            quantity: row.quantity,
            unitPriceCents: row.unit_price_cents,
            totalPriceCents: row.total_price_cents,
            createdAt: row.created_at,
          };
          ordersMap.get(orderId)!.items.push(item);
        }
      }

      // Warm cache in batches
      const orders = Array.from(ordersMap.values());
      await cacheInvalidationService.warmBulkOrders(orders);

      this.jobLogger.debug('Hot orders cache warmed', { count: orders.length });
      return orders.length;
    } catch (error) {
      this.jobLogger.error('Error warming hot orders', { error });
      return 0;
    }
  }

  /**
   * Warm cache for VIP user orders
   */
  private async warmVIPUserOrders(db: any): Promise<number> {
    try {
      // Get VIP users (users with > 10 orders)
      const vipResult = await db.query(
        `
        SELECT DISTINCT user_id, tenant_id
        FROM orders
        GROUP BY user_id, tenant_id
        HAVING COUNT(*) > 10
        LIMIT 100
        `
      );

      if (vipResult.rows.length === 0) {
        this.jobLogger.debug('No VIP users found for cache warming');
        return 0;
      }

      let warmedCount = 0;

      // Warm cache for each VIP user
      for (const row of vipResult.rows) {
        try {
          const ordersResult = await db.query(
            `
            SELECT * FROM orders
            WHERE user_id = $1 AND tenant_id = $2
            ORDER BY created_at DESC
            LIMIT 50
            `,
            [row.user_id, row.tenant_id]
          );

          if (ordersResult.rows.length > 0) {
            const orders = ordersResult.rows.map((r: any) => ({
              id: r.id,
              orderNumber: r.order_number,
              userId: r.user_id,
              eventId: r.event_id,
              status: r.status,
              subtotalCents: r.subtotal_cents,
              platformFeeCents: r.platform_fee_cents,
              processingFeeCents: r.processing_fee_cents,
              taxCents: r.tax_cents,
              discountCents: r.discount_cents,
              totalCents: r.total_cents,
              currency: r.currency,
              paymentIntentId: r.payment_intent_id,
              expiresAt: r.expires_at,
              confirmedAt: r.confirmed_at,
              cancelledAt: r.cancelled_at,
              refundedAt: r.refunded_at,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
              idempotencyKey: r.idempotency_key,
              metadata: r.metadata,
            }));

            await orderCacheService.setUserOrders(row.user_id, row.tenant_id, orders);
            await orderCacheService.setUserOrderCount(row.user_id, row.tenant_id, orders.length);
            warmedCount++;
          }
        } catch (error) {
          this.jobLogger.warn('Error warming VIP user cache', {
            userId: row.user_id,
            tenantId: row.tenant_id,
            error,
          });
        }
      }

      this.jobLogger.debug('VIP user orders cache warmed', { count: warmedCount });
      return warmedCount;
    } catch (error) {
      this.jobLogger.error('Error warming VIP user orders', { error });
      return 0;
    }
  }

  /**
   * Warm cache for top events availability
   * Note: This would normally coordinate with ticket-service
   */
  private async warmTopEventsAvailability(db: any): Promise<number> {
    try {
      // Get top events by recent orders
      const result = await db.query(
        `
        SELECT DISTINCT event_id, COUNT(*) as order_count
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days'
        AND status IN ('PENDING', 'RESERVED', 'CONFIRMED')
        GROUP BY event_id
        ORDER BY order_count DESC
        LIMIT $1
        `,
        [cacheConfig.warming.topEventsCount]
      );

      if (result.rows.length === 0) {
        this.jobLogger.debug('No events to warm availability cache');
        return 0;
      }

      let warmedCount = 0;

      // In a real implementation, this would call ticket-service to get availability
      // For now, we'll just mark the cache keys as ready to be populated
      for (const row of result.rows) {
        try {
          // Placeholder: In production, call ticket-service here
          // const availability = await ticketClient.checkAvailability([row.event_id]);
          // await orderCacheService.setAvailability(row.event_id, availability);
          
          this.jobLogger.debug('Event availability would be warmed here', {
            eventId: row.event_id,
            orderCount: row.order_count,
          });
          warmedCount++;
        } catch (error) {
          this.jobLogger.warn('Error warming event availability', {
            eventId: row.event_id,
            error,
          });
        }
      }

      this.jobLogger.debug('Event availability cache warming prepared', { count: warmedCount });
      return warmedCount;
    } catch (error) {
      this.jobLogger.error('Error warming event availability', { error });
      return 0;
    }
  }

  /**
   * Run cache warming on startup (called externally)
   */
  async warmOnStartup(): Promise<void> {
    this.jobLogger.info('Running cache warming on startup');
    try {
      await this.executeCore();
    } catch (error) {
      this.jobLogger.error('Startup cache warming failed', { error });
      // Don't fail startup if cache warming fails
    }
  }
}

// Export singleton instance
export const cacheWarmingJob = new CacheWarmingJob();
