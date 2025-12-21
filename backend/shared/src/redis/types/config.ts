/**
 * Redis Configuration Types
 * 
 * Type definitions for Redis configuration options, connection settings,
 * and operational parameters used throughout the Redis library.
 */

import { RedisOptions } from 'ioredis';

/**
 * Environment configuration for Redis connection
 */
export interface RedisEnvConfig {
  /** Redis host (default: localhost) */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Redis password for authentication */
  password?: string;
  /** Redis database number (default: 0) */
  db?: number;
  /** Full Redis URL (overrides individual settings) */
  url?: string;
}

/**
 * Connection pool configuration
 */
export interface RedisConnectionConfig extends RedisOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetriesPerRequest?: number;
  /** Enable offline queue (default: true) */
  enableOfflineQueue?: boolean;
  /** Enable ready check (default: true) */
  enableReadyCheck?: boolean;
  /** Lazy connect mode (default: false) */
  lazyConnect?: boolean;
}

/**
 * TTL (Time To Live) configuration for different data types
 */
export interface TTLConfig {
  /** Default TTL in seconds */
  default: number;
  /** Session TTL */
  session: number;
  /** Refresh token TTL */
  refreshToken: number;
  /** Rate limit window */
  rateLimit: number;
  /** Cache TTL variants */
  cache: {
    short: number;
    medium: number;
    long: number;
  };
  /** API key cache TTL */
  apiKey: number;
  /** Idempotency key TTL */
  idempotency: number;
  /** Circuit breaker state TTL */
  circuitBreaker: number;
  /** Service discovery cache TTL */
  serviceDiscovery: number;
  /** Distributed lock TTL */
  lock: number;
}

/**
 * Key prefix configuration for different data types
 */
export interface KeyPrefixConfig {
  /** Session keys */
  session: string;
  /** User session index */
  userSessions: string;
  /** Refresh token keys */
  refreshToken: string;
  /** Rate limit keys */
  rateLimit: string;
  /** Rate limit for tickets */
  rateLimitTicket: string;
  /** Rate limit by IP */
  rateLimitIP: string;
  /** Cache keys */
  cache: string;
  /** Distributed lock keys */
  lock: string;
  /** Circuit breaker state */
  circuitBreaker: string;
  /** Service discovery */
  serviceDiscovery: string;
  /** API key cache */
  apiKey: string;
  /** Idempotency keys */
  idempotency: string;
  /** Queue lock keys */
  queueLock: string;
  /** Health check keys */
  health: string;
  /** Analytics keys */
  analytics: string;
  /** Real-time metrics */
  realtime: string;
  /** Counter keys */
  counter: string;
  /** Gauge keys */
  gauge: string;
  /** Failed auth attempts */
  failedAuth: string;
  /** Auth lock keys */
  authLock: string;
}

/**
 * Cache strategy options
 */
export type CacheStrategy = 'cache-aside' | 'write-through' | 'write-behind' | 'refresh-ahead';

/**
 * Cache operation options
 */
export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
  /** Cache strategy to use */
  strategy?: CacheStrategy;
  /** Whether to compress large values */
  compress?: boolean;
  /** Namespace for cache keys */
  namespace?: string;
}

/**
 * Rate limiting algorithm types
 */
export type RateLimitAlgorithm = 'fixed-window' | 'sliding-window' | 'token-bucket' | 'leaky-bucket';

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum number of requests */
  max: number;
  /** Time window in milliseconds */
  window: number;
  /** Algorithm to use */
  algorithm?: RateLimitAlgorithm;
  /** Block duration after limit exceeded (ms) */
  blockDuration?: number;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Session TTL in seconds (default: 1800 = 30 minutes) */
  ttl?: number;
  /** Maximum sessions per user */
  maxSessionsPerUser?: number;
  /** Use Hash for storage (more efficient) vs JSON strings */
  useHash?: boolean;
}

/**
 * Pub/Sub channel configuration
 */
export interface PubSubConfig {
  /** Channel name pattern */
  pattern?: string;
  /** Whether to use pattern matching */
  usePattern?: boolean;
  /** Message serialization format */
  format?: 'json' | 'string' | 'buffer';
}

/**
 * Geo search options
 */
export interface GeoSearchOptions {
  /** Radius for search */
  radius?: number;
  /** Unit for radius (m, km, mi, ft) */
  unit?: 'm' | 'km' | 'mi' | 'ft';
  /** Maximum number of results */
  count?: number;
  /** Sort order */
  sort?: 'ASC' | 'DESC';
  /** Include coordinates in results */
  withCoord?: boolean;
  /** Include distance in results */
  withDist?: boolean;
}

/**
 * Stream consumer group options
 */
export interface StreamGroupOptions {
  /** Group name */
  group: string;
  /** Consumer name */
  consumer: string;
  /** Block time in milliseconds */
  block?: number;
  /** Number of messages to fetch */
  count?: number;
}

/**
 * Distributed lock options
 */
export interface LockOptions {
  /** Lock TTL in seconds */
  ttl?: number;
  /** Retry attempts */
  retryCount?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Automatic renewal interval */
  renewInterval?: number;
}

/**
 * Scan operation options
 */
export interface ScanOptions {
  /** Cursor for pagination */
  cursor?: string;
  /** Pattern to match */
  pattern?: string;
  /** Count hint for results per iteration */
  count?: number;
  /** Key type filter */
  type?: string;
}

/**
 * Batch operation result
 */
export interface BatchResult<T> {
  /** Successful operations */
  success: T[];
  /** Failed operations with errors */
  failed: Array<{ key: string; error: Error }>;
}

/**
 * Operation result with metadata
 */
export interface OperationResult<T> {
  /** Operation was successful */
  success: boolean;
  /** Result data */
  data?: T;
  /** Error if operation failed */
  error?: Error;
  /** Operation metadata */
  metadata?: {
    /** Time taken in milliseconds */
    duration?: number;
    /** Number of retries */
    retries?: number;
    /** Cache hit/miss */
    cacheHit?: boolean;
  };
}
