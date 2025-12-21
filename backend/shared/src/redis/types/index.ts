/**
 * Redis Types
 * 
 * Central export point for all Redis-related type definitions
 */

export * from './config';

import { Redis } from 'ioredis';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in window */
  remaining: number;
  /** When the limit resets (timestamp) */
  resetAt: Date;
  /** Current retry-after time in seconds (if blocked) */
  retryAfter?: number;
  /** Total limit */
  limit: number;
  /** Current usage count */
  current: number;
}

/**
 * Session data structure
 */
export interface SessionData {
  /** Unique session ID */
  sessionId: string;
  /** User ID associated with session */
  userId: string;
  /** Venue ID (if applicable) */
  venueId?: string;
  /** Session start time */
  startTime: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Number of page views */
  pageViews: number;
  /** Session events */
  events: SessionEvent[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Session event
 */
export interface SessionEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data?: any;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
  /** Whether lock was acquired */
  acquired: boolean;
  /** Lock ID (for releasing) */
  lockId?: string;
  /** Lock TTL in seconds */
  ttl?: number;
  /** Error if acquisition failed */
  error?: Error;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Time cached */
  cachedAt: Date;
  /** TTL in seconds */
  ttl: number;
  /** Expiration time */
  expiresAt: Date;
}

/**
 * Geo location
 */
export interface GeoLocation {
  /** Longitude */
  longitude: number;
  /** Latitude */
  latitude: number;
  /** Location name/identifier */
  member: string;
}

/**
 * Geo search result
 */
export interface GeoSearchResult extends GeoLocation {
  /** Distance from search point */
  distance?: number;
  /** Distance unit */
  unit?: string;
}

/**
 * Sorted set member with score
 */
export interface SortedSetMember {
  /** Member value */
  member: string;
  /** Score */
  score: number;
}

/**
 * Stream message
 */
export interface StreamMessage {
  /** Message ID */
  id: string;
  /** Message fields */
  fields: Record<string, string>;
}

/**
 * Stream read result
 */
export interface StreamReadResult {
  /** Stream key */
  stream: string;
  /** Messages */
  messages: StreamMessage[];
}

/**
 * Pub/Sub message
 */
export interface PubSubMessage<T = any> {
  /** Channel name */
  channel: string;
  /** Message data */
  data: T;
  /** Pattern (if using pattern subscription) */
  pattern?: string;
  /** Message timestamp */
  timestamp: Date;
}

/**
 * Pub/Sub subscription
 */
export interface PubSubSubscription {
  /** Channel or pattern */
  channel: string;
  /** Message handler */
  handler: (message: PubSubMessage) => void | Promise<void>;
  /** Whether using pattern matching */
  isPattern: boolean;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Service is healthy */
  healthy: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Redis server info */
  info?: {
    version: string;
    mode: string;
    uptime: number;
    connectedClients: number;
    usedMemory: number;
    maxMemory: number;
  };
  /** Error if unhealthy */
  error?: string;
}

/**
 * Metrics data
 */
export interface RedisMetrics {
  /** Total commands executed */
  commandsProcessed: number;
  /** Commands per second */
  commandsPerSecond: number;
  /** Connections */
  connections: {
    current: number;
    total: number;
    rejected: number;
  };
  /** Memory usage */
  memory: {
    used: number;
    peak: number;
    fragmentation: number;
  };
  /** Keyspace statistics */
  keyspace: {
    keys: number;
    expires: number;
    avgTTL: number;
  };
}

/**
 * Connection state
 */
export type ConnectionState = 
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'reconnecting'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

/**
 * Connection info
 */
export interface ConnectionInfo {
  /** Current connection state */
  state: ConnectionState;
  /** Host */
  host: string;
  /** Port */
  port: number;
  /** Database number */
  db: number;
  /** Connection uptime in seconds */
  uptime: number;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Last error */
  lastError?: Error;
}

/**
 * Lua script definition
 */
export interface LuaScript {
  /** Script name */
  name: string;
  /** Script source code */
  source: string;
  /** SHA1 hash after loading */
  sha?: string;
  /** Number of keys the script expects */
  numberOfKeys: number;
}

/**
 * Batch operation
 */
export interface BatchOperation<T = any> {
  /** Operation type */
  type: 'get' | 'set' | 'del' | 'expire';
  /** Key */
  key: string;
  /** Value (for set operations) */
  value?: T;
  /** TTL (for set/expire operations) */
  ttl?: number;
}

/**
 * Key info
 */
export interface KeyInfo {
  /** Key name */
  key: string;
  /** Key type */
  type: 'string' | 'list' | 'set' | 'zset' | 'hash' | 'stream';
  /** TTL in seconds (-1 = no expiry, -2 = doesn't exist) */
  ttl: number;
  /** Memory usage in bytes */
  memory?: number;
  /** Encoding */
  encoding?: string;
}

/**
 * Redis client types
 */
export type RedisClient = Redis;
export type RedisPubClient = Redis;
export type RedisSubClient = Redis;

/**
 * Error types
 */
export class RedisConnectionError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'RedisConnectionError';
  }
}

export class RedisOperationError extends Error {
  constructor(
    message: string,
    public operation: string,
    public key?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'RedisOperationError';
  }
}

export class RedisScanError extends Error {
  constructor(message: string, public pattern: string, public originalError?: Error) {
    super(message);
    this.name = 'RedisScanError';
  }
}

export class RedisLockError extends Error {
  constructor(message: string, public lockKey: string, public originalError?: Error) {
    super(message);
    this.name = 'RedisLockError';
  }
}

export class RedisRateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
    public limit: number,
    public current: number
  ) {
    super(message);
    this.name = 'RedisRateLimitError';
  }
}

/**
 * Callback types
 */
export type ScanCallback = (keys: string[]) => Promise<void> | void;
export type MessageHandler<T = any> = (message: PubSubMessage<T>) => Promise<void> | void;
export type ErrorHandler = (error: Error) => void;
export type CacheFetcher<T> = () => Promise<T> | T;
