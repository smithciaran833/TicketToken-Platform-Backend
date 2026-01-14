/**
 * Redis Configuration with Tenant-Scoped Caching
 * 
 * Provides:
 * - Connection management with timeouts
 * - Tenant-isolated cache operations
 * - Health checking
 * - Metrics collection
 */

import Redis, { RedisOptions } from 'ioredis';
import { Counter, Histogram, Gauge } from 'prom-client';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Connection timeout in milliseconds
const REDIS_CONNECT_TIMEOUT_MS = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000');

// Command timeout in milliseconds
const REDIS_COMMAND_TIMEOUT_MS = parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || '5000');

// Default cache TTL in seconds
const DEFAULT_CACHE_TTL_SECONDS = parseInt(process.env.REDIS_DEFAULT_TTL_SECONDS || '3600');

// Key prefix for this service
const SERVICE_PREFIX = 'minting';

// =============================================================================
// METRICS
// =============================================================================

const cacheHitCounter = new Counter({
  name: 'minting_redis_cache_hits_total',
  help: 'Total number of Redis cache hits',
  labelNames: ['operation', 'tenant_id']
});

const cacheMissCounter = new Counter({
  name: 'minting_redis_cache_misses_total',
  help: 'Total number of Redis cache misses',
  labelNames: ['operation', 'tenant_id']
});

const cacheOperationDuration = new Histogram({
  name: 'minting_redis_operation_duration_seconds',
  help: 'Redis operation duration in seconds',
  labelNames: ['operation', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
});

const cacheErrorCounter = new Counter({
  name: 'minting_redis_errors_total',
  help: 'Total number of Redis errors',
  labelNames: ['operation', 'error_type']
});

const redisConnectionGauge = new Gauge({
  name: 'minting_redis_connection_status',
  help: 'Redis connection status (1 = connected, 0 = disconnected)'
});

// =============================================================================
// REDIS CLIENT SINGLETON
// =============================================================================

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Get Redis connection options
 */
function getRedisOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    
    // Connection timeouts
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    
    // Retry configuration
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis max retries exceeded', { times });
        return null; // Stop retrying
      }
      // Exponential backoff with jitter
      const delay = Math.min(times * 100 + Math.random() * 100, 3000);
      logger.warn('Redis retry', { attempt: times, delayMs: delay });
      return delay;
    },
    
    // Connection behavior
    enableOfflineQueue: true,
    enableReadyCheck: true,
    lazyConnect: false,
    
    // TLS configuration for production
    ...(process.env.NODE_ENV === 'production' && process.env.REDIS_TLS === 'true' && {
      tls: {
        rejectUnauthorized: true
      }
    })
  };
}

/**
 * Initialize Redis client
 */
export async function initializeRedis(): Promise<Redis> {
  if (redisClient && isConnected) {
    return redisClient;
  }

  redisClient = new Redis(getRedisOptions());

  // Connection event handlers
  redisClient.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    isConnected = true;
    redisConnectionGauge.set(1);
    logger.info('✅ Redis connected and ready');
  });

  redisClient.on('error', (error) => {
    cacheErrorCounter.inc({ operation: 'connection', error_type: 'connection_error' });
    logger.error('Redis error', { error: error.message });
  });

  redisClient.on('close', () => {
    isConnected = false;
    redisConnectionGauge.set(0);
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  // Wait for connection with timeout
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis connection timeout after ${REDIS_CONNECT_TIMEOUT_MS}ms`));
    }, REDIS_CONNECT_TIMEOUT_MS);

    redisClient!.once('ready', () => {
      clearTimeout(timeout);
      resolve(redisClient!);
    });

    redisClient!.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return isConnected && redisClient?.status === 'ready';
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    redisConnectionGauge.set(0);
    logger.info('Redis connection closed');
  }
}

// =============================================================================
// TENANT-SCOPED CACHE OPERATIONS
// =============================================================================

/**
 * Build a tenant-scoped cache key
 * Format: {service}:{tenant_id}:{namespace}:{key}
 */
export function buildTenantKey(tenantId: string, namespace: string, key: string): string {
  // Validate inputs to prevent key injection
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenant ID for cache key');
  }
  if (!namespace || typeof namespace !== 'string') {
    throw new Error('Invalid namespace for cache key');
  }
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid key for cache key');
  }

  // Sanitize components (remove colons to prevent key collision)
  const sanitizedTenant = tenantId.replace(/:/g, '_');
  const sanitizedNamespace = namespace.replace(/:/g, '_');
  const sanitizedKey = key.replace(/:/g, '_');

  return `${SERVICE_PREFIX}:${sanitizedTenant}:${sanitizedNamespace}:${sanitizedKey}`;
}

/**
 * Build a global (non-tenant) cache key
 * Format: {service}:global:{namespace}:{key}
 */
export function buildGlobalKey(namespace: string, key: string): string {
  const sanitizedNamespace = namespace.replace(/:/g, '_');
  const sanitizedKey = key.replace(/:/g, '_');
  return `${SERVICE_PREFIX}:global:${sanitizedNamespace}:${sanitizedKey}`;
}

/**
 * Tenant-scoped cache class
 * All operations are isolated to a specific tenant
 */
export class TenantCache {
  private tenantId: string;
  private client: Redis;

  constructor(tenantId: string) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for TenantCache');
    }
    this.tenantId = tenantId;
    this.client = getRedisClient();
  }

  /**
   * Get a value from the tenant's cache
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const cacheKey = buildTenantKey(this.tenantId, namespace, key);
    const startTime = Date.now();

    try {
      const value = await this.client.get(cacheKey);
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'get', success: 'true' }, duration);

      if (value) {
        cacheHitCounter.inc({ operation: 'get', tenant_id: this.tenantId });
        return JSON.parse(value) as T;
      } else {
        cacheMissCounter.inc({ operation: 'get', tenant_id: this.tenantId });
        return null;
      }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'get', success: 'false' }, duration);
      cacheErrorCounter.inc({ operation: 'get', error_type: 'parse_error' });
      
      logger.error('Cache get error', {
        tenantId: this.tenantId,
        namespace,
        key,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Set a value in the tenant's cache
   */
  async set<T>(
    namespace: string,
    key: string,
    value: T,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
  ): Promise<boolean> {
    const cacheKey = buildTenantKey(this.tenantId, namespace, key);
    const startTime = Date.now();

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(cacheKey, ttlSeconds, serialized);
      
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'set', success: 'true' }, duration);
      
      return true;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'set', success: 'false' }, duration);
      cacheErrorCounter.inc({ operation: 'set', error_type: 'write_error' });
      
      logger.error('Cache set error', {
        tenantId: this.tenantId,
        namespace,
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Delete a value from the tenant's cache
   */
  async delete(namespace: string, key: string): Promise<boolean> {
    const cacheKey = buildTenantKey(this.tenantId, namespace, key);
    const startTime = Date.now();

    try {
      await this.client.del(cacheKey);
      
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'delete', success: 'true' }, duration);
      
      return true;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'delete', success: 'false' }, duration);
      cacheErrorCounter.inc({ operation: 'delete', error_type: 'delete_error' });
      
      logger.error('Cache delete error', {
        tenantId: this.tenantId,
        namespace,
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Delete all cache entries for this tenant in a namespace
   */
  async deleteNamespace(namespace: string): Promise<number> {
    const pattern = buildTenantKey(this.tenantId, namespace, '*');
    const startTime = Date.now();

    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'delete_namespace', success: 'true' }, duration);

      logger.info('Cache namespace cleared', {
        tenantId: this.tenantId,
        namespace,
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      cacheOperationDuration.observe({ operation: 'delete_namespace', success: 'false' }, duration);
      cacheErrorCounter.inc({ operation: 'delete_namespace', error_type: 'scan_error' });
      
      logger.error('Cache namespace delete error', {
        tenantId: this.tenantId,
        namespace,
        error: (error as Error).message
      });
      return 0;
    }
  }

  /**
   * Get or set with callback (cache-aside pattern)
   */
  async getOrSet<T>(
    namespace: string,
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(namespace, key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const value = await fetchFn();

    // Store in cache (fire and forget)
    this.set(namespace, key, value, ttlSeconds).catch(err => {
      logger.warn('Failed to cache value', { error: err.message });
    });

    return value;
  }
}

/**
 * Factory function to create a tenant-scoped cache
 */
export function createTenantCache(tenantId: string): TenantCache {
  return new TenantCache(tenantId);
}

// =============================================================================
// GLOBAL CACHE OPERATIONS
// =============================================================================

/**
 * Global cache operations (not tenant-scoped)
 * Use sparingly - prefer tenant-scoped cache
 */
export const globalCache = {
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const cacheKey = buildGlobalKey(namespace, key);
    const client = getRedisClient();

    try {
      const value = await client.get(cacheKey);
      if (value) {
        cacheHitCounter.inc({ operation: 'get', tenant_id: 'global' });
        return JSON.parse(value) as T;
      }
      cacheMissCounter.inc({ operation: 'get', tenant_id: 'global' });
      return null;
    } catch (error) {
      logger.error('Global cache get error', { namespace, key, error: (error as Error).message });
      return null;
    }
  },

  async set<T>(
    namespace: string,
    key: string,
    value: T,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS
  ): Promise<boolean> {
    const cacheKey = buildGlobalKey(namespace, key);
    const client = getRedisClient();

    try {
      await client.setex(cacheKey, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Global cache set error', { namespace, key, error: (error as Error).message });
      return false;
    }
  },

  async delete(namespace: string, key: string): Promise<boolean> {
    const cacheKey = buildGlobalKey(namespace, key);
    const client = getRedisClient();

    try {
      await client.del(cacheKey);
      return true;
    } catch (error) {
      logger.error('Global cache delete error', { namespace, key, error: (error as Error).message });
      return false;
    }
  }
};

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Get Redis health status
 */
export async function getRedisHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  info: {
    connected: boolean;
    usedMemory?: string;
    connectedClients?: string;
  };
}> {
  const startTime = Date.now();

  if (!redisClient || !isConnected) {
    return {
      healthy: false,
      latencyMs: 0,
      info: { connected: false }
    };
  }

  try {
    // Ping to measure latency
    await redisClient.ping();
    const latencyMs = Date.now() - startTime;

    // Get basic info
    const info = await redisClient.info('memory');
    const clientsInfo = await redisClient.info('clients');

    const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
    const connectedClientsMatch = clientsInfo.match(/connected_clients:(\d+)/);

    return {
      healthy: true,
      latencyMs,
      info: {
        connected: true,
        usedMemory: usedMemoryMatch?.[1],
        connectedClients: connectedClientsMatch?.[1]
      }
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      info: { connected: false }
    };
  }
}

export default {
  initializeRedis,
  getRedisClient,
  isRedisConnected,
  closeRedis,
  createTenantCache,
  globalCache,
  getRedisHealth,
  buildTenantKey,
  buildGlobalKey
};
