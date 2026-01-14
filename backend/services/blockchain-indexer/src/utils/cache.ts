import Redis from 'ioredis';
import logger from './logger';
import { Counter, Histogram, Gauge } from 'prom-client';
import { register } from './metrics';

// =============================================================================
// CACHE METRICS
// AUDIT FIX: CACHE-5 - Add cache metrics for observability
// =============================================================================

export const cacheHits = new Counter({
  name: 'blockchain_indexer_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['operation'],
  registers: [register]
});

export const cacheMisses = new Counter({
  name: 'blockchain_indexer_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['operation'],
  registers: [register]
});

export const cacheErrors = new Counter({
  name: 'blockchain_indexer_cache_errors_total',
  help: 'Total number of cache errors',
  labelNames: ['operation', 'error_type'],
  registers: [register]
});

export const cacheOperationDuration = new Histogram({
  name: 'blockchain_indexer_cache_operation_duration_seconds',
  help: 'Duration of cache operations',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

export const cacheSize = new Gauge({
  name: 'blockchain_indexer_cache_keys_total',
  help: 'Total number of keys in cache',
  registers: [register]
});

export const cacheMemoryUsage = new Gauge({
  name: 'blockchain_indexer_cache_memory_bytes',
  help: 'Memory used by cache (estimated)',
  registers: [register]
});

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
}

/**
 * Cache Manager using Redis
 */
export class CacheManager {
  private client: Redis;
  private readonly defaultTTL: number;
  private readonly keyPrefix: string;

  constructor(config: CacheConfig) {
    this.defaultTTL = config.defaultTTL || 300; // 5 minutes default
    this.keyPrefix = config.keyPrefix || 'blockchain-indexer:';

    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: this.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      logger.info({ host: config.host, port: config.port }, 'Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis cache error');
    });
  }

  /**
   * Get value from cache
   * AUDIT FIX: CACHE-5 - Add cache metrics
   */
  async get<T>(key: string): Promise<T | null> {
    const timer = cacheOperationDuration.startTimer({ operation: 'get' });
    try {
      const value = await this.client.get(key);
      timer();
      
      if (!value) {
        cacheMisses.inc({ operation: 'get' });
        return null;
      }
      
      cacheHits.inc({ operation: 'get' });
      return JSON.parse(value) as T;
    } catch (error) {
      timer();
      cacheErrors.inc({ operation: 'get', error_type: 'parse_error' });
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   * AUDIT FIX: CACHE-5 - Add cache metrics
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const timer = cacheOperationDuration.startTimer({ operation: 'set' });
    try {
      const serialized = JSON.stringify(value);
      const expirySeconds = ttl || this.defaultTTL;
      
      await this.client.setex(key, expirySeconds, serialized);
      timer();
    } catch (error) {
      timer();
      cacheErrors.inc({ operation: 'set', error_type: 'write_error' });
      logger.error({ error, key }, 'Cache set error');
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        // Remove prefix since Redis client adds it automatically
        const strippedKeys = keys.map(key => key.replace(this.keyPrefix, ''));
        await this.client.del(...strippedKeys);
        logger.info({ pattern, count: keys.length }, 'Deleted keys matching pattern');
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache delete pattern error');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      logger.debug({ key }, 'Cache hit');
      return cached;
    }

    // Cache miss - fetch data
    logger.debug({ key }, 'Cache miss');
    const data = await fetchFn();
    
    // Store in cache
    await this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache incr error');
      return 0;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      logger.error({ error, key, seconds }, 'Cache expire error');
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(v => v ? JSON.parse(v) as T : null);
    } catch (error) {
      logger.error({ error, keys }, 'Cache mget error');
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys
   */
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const entry of entries) {
        const serialized = JSON.stringify(entry.value);
        const ttl = entry.ttl || this.defaultTTL;
        pipeline.setex(entry.key, ttl, serialized);
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.error({ error }, 'Cache mset error');
    }
  }

  /**
   * Clear all keys with this prefix
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys('*');
      if (keys.length > 0) {
        const strippedKeys = keys.map(key => key.replace(this.keyPrefix, ''));
        await this.client.del(...strippedKeys);
        logger.info({ count: keys.length }, 'Cleared all cache keys');
      }
    } catch (error) {
      logger.error({ error }, 'Cache clear error');
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    logger.info('Redis cache disconnected');
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{ keyCount: number; memoryUsed: string }> {
    try {
      const info = await this.client.info('memory');
      const keys = await this.client.keys('*');
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';
      
      return {
        keyCount: keys.length,
        memoryUsed
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats');
      return { keyCount: 0, memoryUsed: 'unknown' };
    }
  }
}

// Singleton instance
let cacheInstance: CacheManager | null = null;

/**
 * Initialize cache manager
 */
export function initializeCache(config: CacheConfig): CacheManager {
  if (cacheInstance) {
    logger.warn('Cache manager already initialized');
    return cacheInstance;
  }
  
  cacheInstance = new CacheManager(config);
  return cacheInstance;
}

/**
 * Get cache manager instance
 */
export function getCache(): CacheManager {
  if (!cacheInstance) {
    throw new Error('Cache manager not initialized. Call initializeCache() first.');
  }
  return cacheInstance;
}

/**
 * Cache key builders for common patterns
 * 
 * AUDIT FIX: MT-5/CACHE-3 - Tenant-scoped cache keys
 * All cache keys that could contain tenant-specific data should be prefixed with tenant_id
 */
export const CacheKeys = {
  // Tenant-scoped keys (for tenant-specific data)
  transaction: (signature: string, tenantId?: string) => 
    tenantId ? `tenant:${tenantId}:tx:${signature}` : `tx:${signature}`,
  
  walletActivity: (address: string, offset: number, limit: number, tenantId?: string) => 
    tenantId 
      ? `tenant:${tenantId}:wallet:${address}:activity:${offset}:${limit}`
      : `wallet:${address}:activity:${offset}:${limit}`,
  
  nftHistory: (tokenId: string, tenantId?: string) => 
    tenantId ? `tenant:${tenantId}:nft:${tokenId}:history` : `nft:${tokenId}:history`,
  
  marketplaceActivity: (marketplace: string | undefined, offset: number, limit: number, tenantId?: string) =>
    tenantId
      ? `tenant:${tenantId}:marketplace:${marketplace || 'all'}:${offset}:${limit}`
      : `marketplace:${marketplace || 'all'}:${offset}:${limit}`,

  // Global keys (not tenant-specific - blockchain state is shared)
  syncStatus: () => `sync:status`,
  slotTransactions: (slot: number) => `slot:${slot}:transactions`,
  
  // Helper to invalidate all tenant cache
  tenantPattern: (tenantId: string) => `tenant:${tenantId}:*`
};

/**
 * AUDIT FIX: MT-5/CACHE-3 - Helper to build tenant-scoped cache key
 */
export function buildTenantCacheKey(baseKey: string, tenantId?: string): string {
  if (!tenantId) {
    return baseKey;
  }
  return `tenant:${tenantId}:${baseKey}`;
}

// =============================================================================
// CACHE INVALIDATION STRATEGY
// AUDIT FIX: CACHE-2 - Cache invalidation strategy
// =============================================================================

/**
 * Cache invalidation patterns for different entity types
 */
export const CacheInvalidation = {
  /**
   * Invalidate all caches related to a specific transaction
   */
  async onTransactionProcessed(signature: string, tenantId?: string): Promise<void> {
    try {
      const cache = getCache();
      // Invalidate transaction cache
      await cache.del(CacheKeys.transaction(signature, tenantId));
      logger.debug({ signature, tenantId }, 'Invalidated transaction cache');
    } catch (error) {
      logger.error({ error, signature }, 'Failed to invalidate transaction cache');
    }
  },

  /**
   * Invalidate all caches related to a wallet address
   */
  async onWalletActivityChanged(walletAddress: string, tenantId?: string): Promise<void> {
    try {
      const cache = getCache();
      // Delete all wallet activity cache entries for this wallet
      const pattern = tenantId 
        ? `tenant:${tenantId}:wallet:${walletAddress}:*`
        : `wallet:${walletAddress}:*`;
      await cache.delPattern(pattern);
      logger.debug({ walletAddress, tenantId }, 'Invalidated wallet activity cache');
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to invalidate wallet cache');
    }
  },

  /**
   * Invalidate NFT history cache when ownership changes
   */
  async onNFTOwnershipChanged(tokenId: string, tenantId?: string): Promise<void> {
    try {
      const cache = getCache();
      await cache.del(CacheKeys.nftHistory(tokenId, tenantId));
      logger.debug({ tokenId, tenantId }, 'Invalidated NFT history cache');
    } catch (error) {
      logger.error({ error, tokenId }, 'Failed to invalidate NFT cache');
    }
  },

  /**
   * Invalidate marketplace activity caches
   */
  async onMarketplaceEvent(marketplace?: string, tenantId?: string): Promise<void> {
    try {
      const cache = getCache();
      // Invalidate general marketplace cache
      const pattern = tenantId
        ? `tenant:${tenantId}:marketplace:*`
        : `marketplace:*`;
      await cache.delPattern(pattern);
      logger.debug({ marketplace, tenantId }, 'Invalidated marketplace cache');
    } catch (error) {
      logger.error({ error, marketplace }, 'Failed to invalidate marketplace cache');
    }
  },

  /**
   * Invalidate sync status cache
   */
  async onSyncStatusChanged(): Promise<void> {
    try {
      const cache = getCache();
      await cache.del(CacheKeys.syncStatus());
      logger.debug('Invalidated sync status cache');
    } catch (error) {
      logger.error({ error }, 'Failed to invalidate sync status cache');
    }
  },

  /**
   * Invalidate all caches for a specific tenant
   */
  async onTenantDataChanged(tenantId: string): Promise<void> {
    try {
      const cache = getCache();
      await cache.delPattern(CacheKeys.tenantPattern(tenantId));
      logger.info({ tenantId }, 'Invalidated all tenant cache entries');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to invalidate tenant cache');
    }
  },

  /**
   * Batch invalidate multiple cache keys
   */
  async batchInvalidate(keys: string[]): Promise<void> {
    try {
      const cache = getCache();
      for (const key of keys) {
        await cache.del(key);
      }
      logger.debug({ count: keys.length }, 'Batch invalidated cache keys');
    } catch (error) {
      logger.error({ error, count: keys.length }, 'Failed to batch invalidate cache');
    }
  }
};

/**
 * Cache invalidation event types for event-driven invalidation
 */
export enum CacheInvalidationEvent {
  TRANSACTION_PROCESSED = 'cache:transaction_processed',
  WALLET_ACTIVITY_CHANGED = 'cache:wallet_activity_changed',
  NFT_OWNERSHIP_CHANGED = 'cache:nft_ownership_changed',
  MARKETPLACE_EVENT = 'cache:marketplace_event',
  SYNC_STATUS_CHANGED = 'cache:sync_status_changed',
  TENANT_DATA_CHANGED = 'cache:tenant_data_changed'
}

// =============================================================================
// CACHE WARMING
// AUDIT FIX: CACHE-4 - Cache warming for frequently accessed data
// =============================================================================

export interface CacheWarmingEntry<T> {
  key: string;
  fetchFn: () => Promise<T>;
  ttl?: number;
}

/**
 * Cache warming utilities for preloading frequently accessed data
 */
export const CacheWarming = {
  /**
   * Warm cache with sync status
   */
  async warmSyncStatus(fetchFn: () => Promise<any>): Promise<void> {
    try {
      const cache = getCache();
      const status = await fetchFn();
      await cache.set(CacheKeys.syncStatus(), status, 60); // 1 minute TTL
      logger.debug('Warmed sync status cache');
    } catch (error) {
      logger.error({ error }, 'Failed to warm sync status cache');
    }
  },

  /**
   * Warm cache with multiple entries in parallel
   * AUDIT FIX: CACHE-4 - Batch cache warming
   */
  async warmMultiple<T>(entries: CacheWarmingEntry<T>[]): Promise<{ 
    success: number; 
    failed: number; 
    errors: string[];
  }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    const warmingPromises = entries.map(async (entry) => {
      try {
        const cache = getCache();
        const data = await entry.fetchFn();
        await cache.set(entry.key, data, entry.ttl);
        results.success++;
        return { key: entry.key, success: true };
      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${entry.key}: ${errorMsg}`);
        return { key: entry.key, success: false, error: errorMsg };
      }
    });

    await Promise.allSettled(warmingPromises);
    
    logger.info({
      success: results.success,
      failed: results.failed,
      total: entries.length
    }, 'Cache warming completed');

    return results;
  },

  /**
   * Warm cache for recent slots (for quick lookups)
   */
  async warmRecentSlots(
    currentSlot: number,
    lookbackSlots: number,
    fetchSlotTransactions: (slot: number) => Promise<any[]>
  ): Promise<void> {
    try {
      const cache = getCache();
      const startSlot = currentSlot - lookbackSlots;
      let warmed = 0;
      
      for (let slot = startSlot; slot <= currentSlot; slot++) {
        try {
          const transactions = await fetchSlotTransactions(slot);
          if (transactions.length > 0) {
            await cache.set(CacheKeys.slotTransactions(slot), transactions, 3600); // 1 hour TTL
            warmed++;
          }
        } catch (error) {
          // Skip individual slot errors
          logger.debug({ slot, error }, 'Failed to warm slot cache');
        }
      }
      
      logger.info({ 
        startSlot, 
        endSlot: currentSlot, 
        warmed 
      }, 'Warmed recent slots cache');
    } catch (error) {
      logger.error({ error }, 'Failed to warm recent slots cache');
    }
  },

  /**
   * Schedule periodic cache warming
   */
  scheduleWarming(
    intervalMs: number,
    warmingFn: () => Promise<void>
  ): NodeJS.Timeout {
    const interval = setInterval(async () => {
      try {
        await warmingFn();
      } catch (error) {
        logger.error({ error }, 'Scheduled cache warming failed');
      }
    }, intervalMs);

    logger.info({ intervalMs }, 'Scheduled periodic cache warming');
    return interval;
  },

  /**
   * Stop scheduled cache warming
   */
  stopScheduledWarming(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    logger.info('Stopped scheduled cache warming');
  }
};

/**
 * Update cache metrics from stats
 * AUDIT FIX: CACHE-5 - Update Prometheus metrics periodically
 */
export async function updateCacheMetrics(): Promise<void> {
  try {
    const cache = getCache();
    const stats = await cache.getStats();
    
    cacheSize.set(stats.keyCount);
    
    // Parse memory if possible (e.g., "1.5M" -> 1572864)
    const memoryStr = stats.memoryUsed;
    if (memoryStr && memoryStr !== 'unknown') {
      const match = memoryStr.match(/^([\d.]+)([KMGT]?)$/i);
      if (match) {
        let bytes = parseFloat(match[1]);
        const unit = (match[2] || '').toUpperCase();
        const multipliers: Record<string, number> = {
          'K': 1024,
          'M': 1024 * 1024,
          'G': 1024 * 1024 * 1024,
          'T': 1024 * 1024 * 1024 * 1024
        };
        if (unit && multipliers[unit]) {
          bytes *= multipliers[unit];
        }
        cacheMemoryUsage.set(bytes);
      }
    }
    
    logger.debug({ stats }, 'Updated cache metrics');
  } catch (error) {
    logger.error({ error }, 'Failed to update cache metrics');
  }
}

// Start periodic cache metrics update
let metricsUpdateInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic cache metrics updates
 */
export function startCacheMetricsUpdates(intervalMs: number = 60000): void {
  if (metricsUpdateInterval) {
    return;
  }
  
  metricsUpdateInterval = setInterval(updateCacheMetrics, intervalMs);
  logger.info({ intervalMs }, 'Started cache metrics updates');
}

/**
 * Stop periodic cache metrics updates
 */
export function stopCacheMetricsUpdates(): void {
  if (metricsUpdateInterval) {
    clearInterval(metricsUpdateInterval);
    metricsUpdateInterval = null;
    logger.info('Stopped cache metrics updates');
  }
}
