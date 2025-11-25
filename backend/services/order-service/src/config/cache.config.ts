/**
 * Cache Configuration
 * Defines TTL values and cache key patterns for the order service
 */

export const cacheConfig = {
  // TTL values in seconds
  ttl: {
    // Order caching
    order: 300, // 5 minutes - single order details
    userOrders: 120, // 2 minutes - user's order list
    orderCount: 600, // 10 minutes - aggregate counts
    eventOrders: 300, // 5 minutes - event order stats

    // Rate limiting
    rateLimitHourly: 3600, // 1 hour
    rateLimitDaily: 86400, // 24 hours

    // Availability
    availability: 30, // 30 seconds - ticket availability
    ticketType: 30, // 30 seconds - specific ticket type

    // Analytics
    analytics: 300, // 5 minutes - cached analytics
  },

  // Cache key prefixes
  keys: {
    order: 'order',
    userOrders: 'user:orders',
    userOrderCount: 'user:order:count',
    eventOrderCount: 'event:order:count',
    rateLimitHourly: 'ratelimit:hourly',
    rateLimitDaily: 'ratelimit:daily',
    availability: 'availability',
    ticketType: 'tickettype',
    analytics: 'analytics',
  },

  // Cache warming configuration
  warming: {
    enabled: true,
    intervalSeconds: 300, // 5 minutes
    topEventsCount: 100,
    hotOrdersHours: 24,
    vipUserOrdersEnabled: true,
  },

  // Monitoring
  monitoring: {
    enabled: true,
    sampleRate: 1.0, // 100% of cache operations
    slowOperationThresholdMs: 100,
  },
};

/**
 * Generate cache key for an order
 */
export function getOrderCacheKey(orderId: string): string {
  return `${cacheConfig.keys.order}:${orderId}`;
}

/**
 * Generate cache key for user orders
 */
export function getUserOrdersCacheKey(userId: string, tenantId: string): string {
  return `${cacheConfig.keys.userOrders}:${tenantId}:${userId}`;
}

/**
 * Generate cache key for user order count
 */
export function getUserOrderCountCacheKey(userId: string, tenantId: string): string {
  return `${cacheConfig.keys.userOrderCount}:${tenantId}:${userId}`;
}

/**
 * Generate cache key for event order count
 */
export function getEventOrderCountCacheKey(eventId: string, tenantId: string): string {
  return `${cacheConfig.keys.eventOrderCount}:${tenantId}:${eventId}`;
}

/**
 * Generate cache key for rate limiting
 */
export function getRateLimitCacheKey(userId: string, window: 'hourly' | 'daily'): string {
  const prefix = window === 'hourly' ? cacheConfig.keys.rateLimitHourly : cacheConfig.keys.rateLimitDaily;
  return `${prefix}:${userId}`;
}

/**
 * Generate cache key for event availability
 */
export function getAvailabilityCacheKey(eventId: string): string {
  return `${cacheConfig.keys.availability}:${eventId}`;
}

/**
 * Generate cache key for ticket type availability
 */
export function getTicketTypeCacheKey(ticketTypeId: string): string {
  return `${cacheConfig.keys.ticketType}:${ticketTypeId}`;
}

/**
 * Generate cache key for analytics
 */
export function getAnalyticsCacheKey(type: string, ...params: string[]): string {
  return `${cacheConfig.keys.analytics}:${type}:${params.join(':')}`;
}
