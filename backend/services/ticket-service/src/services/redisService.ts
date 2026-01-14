/**
 * Redis Service - Migrated to @tickettoken/shared
 * 
 * Maintains backwards compatibility wrapper while using shared Redis client
 * 
 * Batch 25 Fix:
 * - MT1: Tenant data isolation in cache - prefix all keys with tenant_id
 */

import { getCacheManager } from '@tickettoken/shared';
import { getRedis, initRedis } from '../config/redis';
import { logger } from '../utils/logger';
import type Redis from 'ioredis';

// =============================================================================
// MT1: TENANT DATA ISOLATION (Batch 25)
// All cache keys must be prefixed with tenant_id to ensure isolation
// =============================================================================

const SERVICE_PREFIX = 'ticket-svc';
const KEY_SEPARATOR = ':';

/**
 * Build a tenant-isolated cache key
 * Format: service:tenant:namespace:key
 * 
 * MT1 Fix: Ensures tenant data cannot leak between tenants
 */
function buildTenantKey(tenantId: string, namespace: string, key: string): string {
  if (!tenantId) {
    throw new Error('Tenant ID is required for cache operations');
  }
  return [SERVICE_PREFIX, tenantId, namespace, key].join(KEY_SEPARATOR);
}

/**
 * Build a global cache key (for cross-tenant data like system configs)
 * Format: service:global:namespace:key
 */
function buildGlobalKey(namespace: string, key: string): string {
  return [SERVICE_PREFIX, 'global', namespace, key].join(KEY_SEPARATOR);
}

/**
 * Parse a cache key to extract tenant information
 */
function parseKey(fullKey: string): { service: string; tenant: string; namespace: string; key: string } | null {
  const parts = fullKey.split(KEY_SEPARATOR);
  if (parts.length < 4) return null;
  return {
    service: parts[0],
    tenant: parts[1],
    namespace: parts[2],
    key: parts.slice(3).join(KEY_SEPARATOR),
  };
}

class RedisServiceClass {
  private client: Redis | null = null;
  private log = logger.child({ component: 'RedisService' });
  private cacheManager = getCacheManager();

  async initialize(): Promise<void> {
    try {
      // Initialize Redis using config
      await initRedis();
      this.client = getRedis();
      this.log.info('Redis connection initialized via @tickettoken/shared');
    } catch (error) {
      this.log.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not initialized - call initialize() first');
    }
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.cacheManager.get<string>(key);
      return value;
    } catch (error: any) {
      this.log.error('Redis get failed:', { error: error.message, key });
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error: any) {
      this.log.error('Redis set failed:', { error: error.message, key });
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.delete(key);
    } catch (error: any) {
      this.log.error('Redis del failed:', { error: error.message, key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.cacheManager.get(key);
      return value !== null;
    } catch (error: any) {
      this.log.error('Redis exists failed:', { error: error.message, key });
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const client = getRedis();
      return await client.incr(key);
    } catch (error: any) {
      this.log.error('Redis incr failed:', { error: error.message, key });
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      const client = getRedis();
      await client.expire(key, ttl);
    } catch (error: any) {
      this.log.error('Redis expire failed:', { error: error.message, key });
      throw error;
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];

    try {
      const client = getRedis();
      return await client.mget(...keys);
    } catch (error: any) {
      this.log.error('Redis mget failed:', { error: error.message });
      return keys.map(() => null);
    }
  }

  async mset(pairs: { key: string; value: string }[]): Promise<void> {
    if (pairs.length === 0) return;

    try {
      const client = getRedis();
      const args: string[] = [];
      pairs.forEach(({ key, value }) => {
        args.push(key, value);
      });
      await client.mset(...args);
    } catch (error: any) {
      this.log.error('Redis mset failed:', { error: error.message });
      throw error;
    }
  }

  async close(): Promise<void> {
    // Connection managed by shared library
    this.log.info('Redis connection managed by @tickettoken/shared');
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = getRedis();
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // MT1: TENANT-ISOLATED CACHE METHODS (Batch 25)
  // These methods automatically prefix keys with tenant ID
  // ===========================================================================

  /**
   * Get a tenant-scoped value from cache
   * MT1 Fix: Key is prefixed with tenant_id to prevent cross-tenant data access
   */
  async getTenant(tenantId: string, namespace: string, key: string): Promise<string | null> {
    const fullKey = buildTenantKey(tenantId, namespace, key);
    return this.get(fullKey);
  }

  /**
   * Set a tenant-scoped value in cache
   * MT1 Fix: Key is prefixed with tenant_id to prevent cross-tenant data access
   */
  async setTenant(tenantId: string, namespace: string, key: string, value: string, ttl?: number): Promise<void> {
    const fullKey = buildTenantKey(tenantId, namespace, key);
    return this.set(fullKey, value, ttl);
  }

  /**
   * Delete a tenant-scoped value from cache
   */
  async delTenant(tenantId: string, namespace: string, key: string): Promise<void> {
    const fullKey = buildTenantKey(tenantId, namespace, key);
    return this.del(fullKey);
  }

  /**
   * Check if a tenant-scoped key exists
   */
  async existsTenant(tenantId: string, namespace: string, key: string): Promise<boolean> {
    const fullKey = buildTenantKey(tenantId, namespace, key);
    return this.exists(fullKey);
  }

  /**
   * Increment a tenant-scoped counter
   */
  async incrTenant(tenantId: string, namespace: string, key: string): Promise<number> {
    const fullKey = buildTenantKey(tenantId, namespace, key);
    return this.incr(fullKey);
  }

  /**
   * Get multiple tenant-scoped values
   */
  async mgetTenant(tenantId: string, namespace: string, keys: string[]): Promise<(string | null)[]> {
    const fullKeys = keys.map(k => buildTenantKey(tenantId, namespace, k));
    return this.mget(fullKeys);
  }

  /**
   * Set multiple tenant-scoped values
   */
  async msetTenant(tenantId: string, namespace: string, pairs: { key: string; value: string }[]): Promise<void> {
    const fullPairs = pairs.map(p => ({
      key: buildTenantKey(tenantId, namespace, p.key),
      value: p.value,
    }));
    return this.mset(fullPairs);
  }

  /**
   * Delete all keys for a specific tenant (use with caution)
   * Useful for tenant offboarding or data cleanup
   */
  async deleteAllTenantKeys(tenantId: string): Promise<number> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    try {
      const client = getRedis();
      const pattern = `${SERVICE_PREFIX}:${tenantId}:*`;
      let deletedCount = 0;
      let cursor = '0';

      do {
        const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;

        if (keys.length > 0) {
          await client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      this.log.info('Deleted all tenant cache keys', { tenantId, deletedCount });
      return deletedCount;
    } catch (error: any) {
      this.log.error('Failed to delete tenant keys:', { error: error.message, tenantId });
      throw error;
    }
  }

  /**
   * Get a global (cross-tenant) value from cache
   */
  async getGlobal(namespace: string, key: string): Promise<string | null> {
    const fullKey = buildGlobalKey(namespace, key);
    return this.get(fullKey);
  }

  /**
   * Set a global (cross-tenant) value in cache
   */
  async setGlobal(namespace: string, key: string, value: string, ttl?: number): Promise<void> {
    const fullKey = buildGlobalKey(namespace, key);
    return this.set(fullKey, value, ttl);
  }

  /**
   * Delete a global (cross-tenant) value from cache
   */
  async delGlobal(namespace: string, key: string): Promise<void> {
    const fullKey = buildGlobalKey(namespace, key);
    return this.del(fullKey);
  }

  // ===========================================================================
  // CACHE NAMESPACE HELPERS
  // ===========================================================================

  /**
   * Cache namespaces for different data types
   */
  static readonly NAMESPACES = {
    TICKET: 'ticket',
    RESERVATION: 'reservation',
    QR_CODE: 'qr',
    SESSION: 'session',
    RATE_LIMIT: 'ratelimit',
    IDEMPOTENCY: 'idempotency',
    CONFIG: 'config',
    METRICS: 'metrics',
  } as const;
}

// Export helper functions for external use
export { buildTenantKey, buildGlobalKey, parseKey };

export const RedisService = new RedisServiceClass();
