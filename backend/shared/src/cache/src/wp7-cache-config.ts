/**
 * WP-7 Cache Configuration
 * Two-tier caching with L1 (in-memory) and L2 (Redis)
 */

export interface CacheTTLConfig {
  // L1 (in-memory) TTLs - shorter
  l1: {
    sessions: number; // 5 min
    events: number; // 2 min
    availability: number; // 30 sec
    search: number; // 1 min
    users: number; // 5 min
    venues: number; // 10 min
    orders: number; // 1 min
  };
  // L2 (Redis) TTLs - longer
  l2: {
    sessions: number; // 30 min
    events: number; // 10 min
    availability: number; // 2 min
    search: number; // 5 min
    users: number; // 30 min
    venues: number; // 60 min
    orders: number; // 5 min
  };
}

export const CACHE_TTL: CacheTTLConfig = {
  l1: {
    sessions: 300, // 5 minutes
    events: 120, // 2 minutes
    availability: 30, // 30 seconds (hot path)
    search: 60, // 1 minute
    users: 300, // 5 minutes
    venues: 600, // 10 minutes
    orders: 60, // 1 minute
  },
  l2: {
    sessions: 1800, // 30 minutes
    events: 600, // 10 minutes
    availability: 120, // 2 minutes
    search: 300, // 5 minutes
    users: 1800, // 30 minutes
    venues: 3600, // 1 hour
    orders: 300, // 5 minutes
  },
};

// Cache key patterns for invalidation
export const CACHE_PATTERNS = {
  event: {
    detail: 'event:detail:{id}',
    list: 'event:list:{venueId}:{page}',
    availability: 'event:availability:{id}',
    tickets: 'event:tickets:{id}',
    search: 'event:search:{query}:{filters}',
  },
  user: {
    profile: 'user:profile:{id}',
    session: 'user:session:{sessionId}',
    orders: 'user:orders:{id}:{page}',
    tickets: 'user:tickets:{id}',
  },
  venue: {
    detail: 'venue:detail:{id}',
    events: 'venue:events:{id}:{page}',
    settings: 'venue:settings:{id}',
    analytics: 'venue:analytics:{id}:{period}',
  },
  ticket: {
    availability: 'ticket:availability:{eventId}:{typeId}',
    inventory: 'ticket:inventory:{eventId}',
    qr: 'ticket:qr:{ticketId}',
    scan: 'ticket:scan:{ticketId}',
  },
  order: {
    detail: 'order:detail:{id}',
    items: 'order:items:{id}',
    payment: 'order:payment:{id}',
  },
  gateway: {
    response: 'gateway:response:{method}:{path}:{params}',
  },
};

// Feature flags
export const CACHE_FEATURES = {
  ENABLE_L1_CACHE: process.env.ENABLE_L1_CACHE !== 'false',
  ENABLE_L2_CACHE: process.env.ENABLE_L2_CACHE !== 'false',
  ENABLE_CACHE_METRICS: process.env.ENABLE_CACHE_METRICS === 'true',
  ENABLE_CACHE_WARMUP: process.env.ENABLE_CACHE_WARMUP === 'true',
  ENABLE_AGGRESSIVE_INVALIDATION: process.env.ENABLE_AGGRESSIVE_INVALIDATION === 'true',
};
