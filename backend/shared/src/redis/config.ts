/**
 * Redis Configuration
 * 
 * Default configuration values for Redis operations including TTL values,
 * key prefixes, and connection options. These match existing patterns found
 * in the codebase.
 */

import { TTLConfig, KeyPrefixConfig, RedisConnectionConfig } from './types';

/**
 * Default TTL values (in seconds)
 * These match existing patterns in the codebase
 */
export const DEFAULT_TTL: TTLConfig = {
  default: 300, // 5 minutes
  session: 1800, // 30 minutes
  refreshToken: 604800, // 7 days
  rateLimit: 60, // 1 minute
  cache: {
    short: 60, // 1 minute
    medium: 300, // 5 minutes
    long: 3600, // 1 hour
  },
  apiKey: 86400, // 24 hours
  idempotency: 86400, // 24 hours
  circuitBreaker: 300, // 5 minutes
  serviceDiscovery: 30, // 30 seconds
  lock: 30, // 30 seconds
};

/**
 * Default key prefixes
 * These match existing patterns found in analytics-service, api-gateway, and auth-service
 */
export const DEFAULT_KEY_PREFIXES: KeyPrefixConfig = {
  // Session management (matches analytics-service)
  session: 'session:',
  userSessions: 'user:sessions:',
  
  // Authentication (matches auth-service)
  refreshToken: 'refresh:',
  failedAuth: 'failed_auth:',
  authLock: 'auth_lock:',
  
  // Rate limiting (matches api-gateway)
  rateLimit: 'rl:',
  rateLimitTicket: 'rl:ticket:',
  rateLimitIP: 'rl:ip:',
  
  // Caching (matches api-gateway)
  cache: 'cache:',
  
  // Infrastructure (matches api-gateway)
  lock: 'lock:',
  circuitBreaker: 'cb:',
  serviceDiscovery: 'sd:',
  health: 'health:',
  queueLock: 'queue:lock:',
  apiKey: 'apikey:',
  idempotency: 'idem:',
  
  // Analytics (matches analytics-service)
  analytics: 'analytics:',
  realtime: 'realtime:',
  counter: 'counter:',
  gauge: 'gauge:',
};

/**
 * Default Redis connection configuration
 * Matches retry strategies found across services
 */
export const DEFAULT_CONNECTION_CONFIG: Partial<RedisConnectionConfig> = {
  // Retry strategy: exponential backoff up to 2 seconds
  // (matches analytics, api-gateway, auth, event, ticket services)
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  
  // Maximum retry attempts per request
  maxRetriesPerRequest: 3,
  
  // Enable offline queue to buffer commands while reconnecting
  enableOfflineQueue: true,
  
  // Enable ready check before executing commands
  enableReadyCheck: true,
  
  // Connection timeout
  connectTimeout: 10000, // 10 seconds (matches payment-service)
  
  // Command timeout
  commandTimeout: 5000, // 5 seconds (matches payment-service)
  
  // Reconnect on specific errors
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(target => err.message.includes(target));
  },
};

/**
 * Environment variable names for Redis connection
 * These are standardized across all services
 */
export const REDIS_ENV_VARS = {
  HOST: 'REDIS_HOST',
  PORT: 'REDIS_PORT',
  PASSWORD: 'REDIS_PASSWORD',
  DB: 'REDIS_DB',
  URL: 'REDIS_URL',
} as const;

/**
 * Default environment values
 */
export const DEFAULT_REDIS_ENV = {
  HOST: 'localhost',
  PORT: 6379,
  DB: 0,
} as const;

/**
 * Cache strategy priorities
 * Used to determine which strategy to use based on use case
 */
export const CACHE_STRATEGY_PRIORITY = {
  'cache-aside': 1, // Most common, least complex
  'write-through': 2, // Consistency important
  'write-behind': 3, // Performance critical
  'refresh-ahead': 4, // Predictable access patterns
} as const;

/**
 * Rate limit algorithm characteristics
 */
export const RATE_LIMIT_ALGORITHMS = {
  'fixed-window': {
    description: 'Simple counter per time window',
    pros: ['Simple', 'Memory efficient', 'Fast'],
    cons: ['Burst at window boundaries'],
    useCases: ['General API rate limiting'],
  },
  'sliding-window': {
    description: 'Timestamp-based using sorted sets',
    pros: ['Accurate', 'No boundary bursts'],
    cons: ['More memory', 'Slightly slower'],
    useCases: ['Critical operations', 'Ticket purchases'],
  },
  'token-bucket': {
    description: 'Token replenishment over time',
    pros: ['Smooth rate limiting', 'Burst allowance'],
    cons: ['More complex'],
    useCases: ['Brute force protection', 'API throttling'],
  },
  'leaky-bucket': {
    description: 'Fixed output rate queue',
    pros: ['Consistent rate', 'Queue support'],
    cons: ['Requires queue management'],
    useCases: ['Traffic shaping', 'Background jobs'],
  },
} as const;

/**
 * Lua script names
 * Used for script loading and caching
 */
export const LUA_SCRIPTS = {
  RATE_LIMIT_SLIDING: 'rate_limit_sliding_window',
  RATE_LIMIT_TOKEN: 'rate_limit_token_bucket',
  SESSION_LIMIT: 'session_limit_check',
  BATCH_OPS: 'batch_operations',
  ATOMIC_INCREMENT: 'atomic_increment_with_limit',
} as const;

/**
 * Geo distance units
 */
export const GEO_UNITS = {
  METERS: 'm',
  KILOMETERS: 'km',
  MILES: 'mi',
  FEET: 'ft',
} as const;

/**
 * Stream special IDs
 */
export const STREAM_IDS = {
  NEW_ENTRIES: '$', // Only new entries
  ALL_ENTRIES: '0', // All entries from beginning
  AUTO_GENERATE: '*', // Let Redis generate ID
} as const;

/**
 * Scan batch size
 * Number of keys to fetch per SCAN iteration
 */
export const SCAN_BATCH_SIZE = 100;

/**
 * Maximum key pattern results
 * Safety limit to prevent memory issues
 */
export const MAX_SCAN_RESULTS = 10000;

/**
 * Pub/Sub message serialization format
 */
export const PUBSUB_DEFAULT_FORMAT = 'json' as const;

/**
 * Session configuration defaults
 */
export const SESSION_DEFAULTS = {
  TTL: 1800, // 30 minutes (matches analytics-service)
  MAX_PER_USER: 5, // Maximum concurrent sessions per user
  USE_HASH: true, // Use hash for better performance
  CLEANUP_INTERVAL: 300000, // 5 minutes
} as const;

/**
 * Lock configuration defaults
 */
export const LOCK_DEFAULTS = {
  TTL: 30, // 30 seconds (matches existing)
  RETRY_COUNT: 3,
  RETRY_DELAY: 100, // milliseconds
  RENEW_INTERVAL: 10000, // 10 seconds (renew at 1/3 of TTL)
} as const;

/**
 * Cache compression threshold
 * Values larger than this (in bytes) will be compressed
 */
export const CACHE_COMPRESSION_THRESHOLD = 1024; // 1KB

/**
 * Health check configuration
 */
export const HEALTH_CHECK_CONFIG = {
  TIMEOUT: 5000, // 5 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

/**
 * Metrics collection interval
 */
export const METRICS_INTERVAL = 60000; // 1 minute

/**
 * Feature flags
 * Can be used to enable/disable features during migration
 */
export const REDIS_FEATURES = {
  USE_HASH_FOR_SESSIONS: true,
  USE_LUA_SCRIPTS: true,
  USE_STREAMS: true,
  USE_GEO: true,
  ENABLE_METRICS: true,
  ENABLE_COMPRESSION: false, // Disabled by default
  ENABLE_CIRCUIT_BREAKER: true,
} as const;
