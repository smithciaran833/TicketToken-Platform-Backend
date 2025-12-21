/**
 * Redis Module
 * 
 * Complete Redis integration for @tickettoken/shared package.
 * Provides operations, managers, utilities, and types for all Redis functionality.
 */

// Connection Management
export {
  ConnectionManager,
  getConnectionManager,
  getRedisClient,
  getRedisPubClient,
  getRedisSubClient,
} from './connection-manager';

export { RedisClientWrapper, createRedisWrapper, getRedisWrapper } from './redis-client';

// Configuration
export * from './config';

// Types
export * from './types';

// Operations
export * from './operations/hash';
export * from './operations/sorted-set';
export * from './operations/list';
export * from './operations/geo';
export * from './operations/stream';

// Utilities
export * from './utils/scanner';
export * from './utils/key-builder';
export * from './utils/serialization';

// Lua Scripts
export { ScriptLoader, getScriptLoader, executeScript } from './lua/script-loader';
export { RATE_LIMIT_SCRIPT } from './lua/scripts/rate-limit.lua';
export { SESSION_LIMIT_SCRIPT } from './lua/scripts/session-limit.lua';
export { BATCH_OPS_SCRIPT } from './lua/scripts/batch-ops.lua';

// Managers
export {
  SessionManager,
  getSessionManager,
  createSessionManager,
} from './managers/session-manager';

export {
  RateLimiter,
  getRateLimiter,
  createRateLimiter,
} from './managers/rate-limiter';

export {
  CacheManager,
  getCacheManager,
  createCacheManager,
} from './managers/cache-manager';

export {
  PubSubManager,
  getPubSubManager,
  createPubSubManager,
} from './managers/pubsub-manager';
