/**
 * Unit Tests: Cache Configuration
 *
 * Tests cache key generation and configuration values
 */

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
} from '../../../src/config/cache.config';

describe('Cache Configuration', () => {
  // ============================================
  // TTL Configuration
  // ============================================
  describe('TTL Configuration', () => {
    it('should have order TTL of 300 seconds', () => {
      expect(cacheConfig.ttl.order).toBe(300);
    });

    it('should have userOrders TTL of 120 seconds', () => {
      expect(cacheConfig.ttl.userOrders).toBe(120);
    });

    it('should have orderCount TTL of 600 seconds', () => {
      expect(cacheConfig.ttl.orderCount).toBe(600);
    });

    it('should have eventOrders TTL of 300 seconds', () => {
      expect(cacheConfig.ttl.eventOrders).toBe(300);
    });

    it('should have hourly rate limit TTL of 3600 seconds', () => {
      expect(cacheConfig.ttl.rateLimitHourly).toBe(3600);
    });

    it('should have daily rate limit TTL of 86400 seconds', () => {
      expect(cacheConfig.ttl.rateLimitDaily).toBe(86400);
    });

    it('should have availability TTL of 30 seconds', () => {
      expect(cacheConfig.ttl.availability).toBe(30);
    });

    it('should have ticketType TTL of 30 seconds', () => {
      expect(cacheConfig.ttl.ticketType).toBe(30);
    });

    it('should have analytics TTL of 300 seconds', () => {
      expect(cacheConfig.ttl.analytics).toBe(300);
    });
  });

  // ============================================
  // Key Prefixes
  // ============================================
  describe('Key Prefixes', () => {
    it('should have order key prefix', () => {
      expect(cacheConfig.keys.order).toBe('order');
    });

    it('should have userOrders key prefix', () => {
      expect(cacheConfig.keys.userOrders).toBe('user:orders');
    });

    it('should have userOrderCount key prefix', () => {
      expect(cacheConfig.keys.userOrderCount).toBe('user:order:count');
    });

    it('should have eventOrderCount key prefix', () => {
      expect(cacheConfig.keys.eventOrderCount).toBe('event:order:count');
    });

    it('should have rateLimitHourly key prefix', () => {
      expect(cacheConfig.keys.rateLimitHourly).toBe('ratelimit:hourly');
    });

    it('should have rateLimitDaily key prefix', () => {
      expect(cacheConfig.keys.rateLimitDaily).toBe('ratelimit:daily');
    });

    it('should have availability key prefix', () => {
      expect(cacheConfig.keys.availability).toBe('availability');
    });

    it('should have ticketType key prefix', () => {
      expect(cacheConfig.keys.ticketType).toBe('tickettype');
    });

    it('should have analytics key prefix', () => {
      expect(cacheConfig.keys.analytics).toBe('analytics');
    });
  });

  // ============================================
  // Warming Configuration
  // ============================================
  describe('Warming Configuration', () => {
    it('should have warming enabled', () => {
      expect(cacheConfig.warming.enabled).toBe(true);
    });

    it('should have interval of 300 seconds', () => {
      expect(cacheConfig.warming.intervalSeconds).toBe(300);
    });

    it('should warm top 100 events', () => {
      expect(cacheConfig.warming.topEventsCount).toBe(100);
    });

    it('should warm orders from last 24 hours', () => {
      expect(cacheConfig.warming.hotOrdersHours).toBe(24);
    });

    it('should have VIP user orders warming enabled', () => {
      expect(cacheConfig.warming.vipUserOrdersEnabled).toBe(true);
    });
  });

  // ============================================
  // Monitoring Configuration
  // ============================================
  describe('Monitoring Configuration', () => {
    it('should have monitoring enabled', () => {
      expect(cacheConfig.monitoring.enabled).toBe(true);
    });

    it('should have 100% sample rate', () => {
      expect(cacheConfig.monitoring.sampleRate).toBe(1.0);
    });

    it('should have slow operation threshold of 100ms', () => {
      expect(cacheConfig.monitoring.slowOperationThresholdMs).toBe(100);
    });
  });

  // ============================================
  // getOrderCacheKey
  // ============================================
  describe('getOrderCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getOrderCacheKey('order-123');
      expect(key).toBe('order:order-123');
    });

    it('should handle UUID order IDs', () => {
      const key = getOrderCacheKey('550e8400-e29b-41d4-a716-446655440000');
      expect(key).toBe('order:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should handle empty string', () => {
      const key = getOrderCacheKey('');
      expect(key).toBe('order:');
    });
  });

  // ============================================
  // getUserOrdersCacheKey
  // ============================================
  describe('getUserOrdersCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getUserOrdersCacheKey('user-123', 'tenant-456');
      expect(key).toBe('user:orders:tenant-456:user-123');
    });

    it('should include tenant for isolation', () => {
      const key1 = getUserOrdersCacheKey('user-123', 'tenant-A');
      const key2 = getUserOrdersCacheKey('user-123', 'tenant-B');
      expect(key1).not.toBe(key2);
    });

    it('should differentiate between users', () => {
      const key1 = getUserOrdersCacheKey('user-1', 'tenant-A');
      const key2 = getUserOrdersCacheKey('user-2', 'tenant-A');
      expect(key1).not.toBe(key2);
    });
  });

  // ============================================
  // getUserOrderCountCacheKey
  // ============================================
  describe('getUserOrderCountCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getUserOrderCountCacheKey('user-123', 'tenant-456');
      expect(key).toBe('user:order:count:tenant-456:user-123');
    });

    it('should be different from getUserOrdersCacheKey', () => {
      const ordersKey = getUserOrdersCacheKey('user-123', 'tenant-456');
      const countKey = getUserOrderCountCacheKey('user-123', 'tenant-456');
      expect(ordersKey).not.toBe(countKey);
    });
  });

  // ============================================
  // getEventOrderCountCacheKey
  // ============================================
  describe('getEventOrderCountCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getEventOrderCountCacheKey('event-123', 'tenant-456');
      expect(key).toBe('event:order:count:tenant-456:event-123');
    });

    it('should include tenant for isolation', () => {
      const key1 = getEventOrderCountCacheKey('event-123', 'tenant-A');
      const key2 = getEventOrderCountCacheKey('event-123', 'tenant-B');
      expect(key1).not.toBe(key2);
    });
  });

  // ============================================
  // getRateLimitCacheKey
  // ============================================
  describe('getRateLimitCacheKey', () => {
    it('should generate hourly rate limit key', () => {
      const key = getRateLimitCacheKey('user-123', 'hourly');
      expect(key).toBe('ratelimit:hourly:user-123');
    });

    it('should generate daily rate limit key', () => {
      const key = getRateLimitCacheKey('user-123', 'daily');
      expect(key).toBe('ratelimit:daily:user-123');
    });

    it('should differentiate between hourly and daily', () => {
      const hourlyKey = getRateLimitCacheKey('user-123', 'hourly');
      const dailyKey = getRateLimitCacheKey('user-123', 'daily');
      expect(hourlyKey).not.toBe(dailyKey);
    });
  });

  // ============================================
  // getAvailabilityCacheKey
  // ============================================
  describe('getAvailabilityCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getAvailabilityCacheKey('event-123');
      expect(key).toBe('availability:event-123');
    });
  });

  // ============================================
  // getTicketTypeCacheKey
  // ============================================
  describe('getTicketTypeCacheKey', () => {
    it('should generate correct cache key', () => {
      const key = getTicketTypeCacheKey('ticket-type-123');
      expect(key).toBe('tickettype:ticket-type-123');
    });
  });

  // ============================================
  // getAnalyticsCacheKey
  // ============================================
  describe('getAnalyticsCacheKey', () => {
    it('should generate cache key with type only', () => {
      const key = getAnalyticsCacheKey('revenue');
      expect(key).toBe('analytics:revenue:');
    });

    it('should generate cache key with type and one param', () => {
      const key = getAnalyticsCacheKey('revenue', 'event-123');
      expect(key).toBe('analytics:revenue:event-123');
    });

    it('should generate cache key with type and multiple params', () => {
      const key = getAnalyticsCacheKey('orders', 'event-123', '2024-01', 'confirmed');
      expect(key).toBe('analytics:orders:event-123:2024-01:confirmed');
    });

    it('should handle empty params', () => {
      const key = getAnalyticsCacheKey('daily-stats');
      expect(key).toBe('analytics:daily-stats:');
    });
  });
});
