/**
 * Cache Fallback Service
 * 
 * Provides cached responses when the database is unavailable.
 * Only used for READ operations - never for writes.
 * 
 * WARNING: Cached data may be stale. Use with caution for
 * permission-sensitive operations.
 */

import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { Counter, Gauge } from 'prom-client';
import { register } from '../utils/metrics';

// Cache TTLs in seconds
const CACHE_TTL = {
  userProfile: 300,        // 5 minutes
  userPermissions: 60,     // 1 minute (shorter for security)
  tenantConfig: 600,       // 10 minutes
};

// Metrics
const cacheFallbackTotal = new Counter({
  name: 'auth_cache_fallback_total',
  help: 'Total number of cache fallback responses',
  labelNames: ['operation', 'status'],
  registers: [register]
});

const cacheHitTotal = new Counter({
  name: 'auth_cache_hit_total',
  help: 'Total number of cache hits',
  labelNames: ['operation'],
  registers: [register]
});

const cacheMissTotal = new Counter({
  name: 'auth_cache_miss_total',
  help: 'Total number of cache misses',
  labelNames: ['operation'],
  registers: [register]
});

// Redis key prefixes
const CACHE_KEYS = {
  userProfile: (userId: string, tenantId: string) => 
    `cache:user:${tenantId}:${userId}:profile`,
  userPermissions: (userId: string, tenantId: string) => 
    `cache:user:${tenantId}:${userId}:permissions`,
  tenantConfig: (tenantId: string) => 
    `cache:tenant:${tenantId}:config`,
};

export interface CachedUserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  tenant_id: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  cached_at: number;
}

export interface CachedPermissions {
  userId: string;
  tenantId: string;
  permissions: string[];
  role: string;
  cached_at: number;
}

class CacheFallbackService {
  /**
   * Cache a user profile after successful DB read
   */
  async cacheUserProfile(userId: string, tenantId: string, profile: any): Promise<void> {
    try {
      const redis = getRedis();
      const key = CACHE_KEYS.userProfile(userId, tenantId);
      
      const cached: CachedUserProfile = {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        tenant_id: profile.tenant_id,
        email_verified: profile.email_verified,
        mfa_enabled: profile.mfa_enabled,
        cached_at: Date.now(),
      };

      await redis.setex(key, CACHE_TTL.userProfile, JSON.stringify(cached));
    } catch (error) {
      // Don't fail the request if caching fails
      logger.warn('Failed to cache user profile', { userId, error });
    }
  }

  /**
   * Get cached user profile (fallback when DB is down)
   */
  async getCachedUserProfile(userId: string, tenantId: string): Promise<CachedUserProfile | null> {
    try {
      const redis = getRedis();
      const key = CACHE_KEYS.userProfile(userId, tenantId);
      const data = await redis.get(key);

      if (data) {
        cacheHitTotal.inc({ operation: 'userProfile' });
        return JSON.parse(data);
      }

      cacheMissTotal.inc({ operation: 'userProfile' });
      return null;
    } catch (error) {
      logger.warn('Failed to get cached user profile', { userId, error });
      return null;
    }
  }

  /**
   * Cache user permissions after successful DB read
   */
  async cacheUserPermissions(userId: string, tenantId: string, permissions: string[], role: string): Promise<void> {
    try {
      const redis = getRedis();
      const key = CACHE_KEYS.userPermissions(userId, tenantId);

      const cached: CachedPermissions = {
        userId,
        tenantId,
        permissions,
        role,
        cached_at: Date.now(),
      };

      await redis.setex(key, CACHE_TTL.userPermissions, JSON.stringify(cached));
    } catch (error) {
      logger.warn('Failed to cache user permissions', { userId, error });
    }
  }

  /**
   * Get cached permissions (fallback when DB is down)
   */
  async getCachedPermissions(userId: string, tenantId: string): Promise<CachedPermissions | null> {
    try {
      const redis = getRedis();
      const key = CACHE_KEYS.userPermissions(userId, tenantId);
      const data = await redis.get(key);

      if (data) {
        cacheHitTotal.inc({ operation: 'userPermissions' });
        return JSON.parse(data);
      }

      cacheMissTotal.inc({ operation: 'userPermissions' });
      return null;
    } catch (error) {
      logger.warn('Failed to get cached permissions', { userId, error });
      return null;
    }
  }

  /**
   * Invalidate user cache (call after profile/permission updates)
   */
  async invalidateUserCache(userId: string, tenantId: string): Promise<void> {
    try {
      const redis = getRedis();
      await Promise.all([
        redis.del(CACHE_KEYS.userProfile(userId, tenantId)),
        redis.del(CACHE_KEYS.userPermissions(userId, tenantId)),
      ]);
    } catch (error) {
      logger.warn('Failed to invalidate user cache', { userId, error });
    }
  }

  /**
   * Execute with fallback - tries DB first, falls back to cache
   */
  async withFallback<T>(
    operation: string,
    dbOperation: () => Promise<T>,
    cacheOperation: () => Promise<T | null>,
    userId?: string
  ): Promise<{ data: T; fromCache: boolean }> {
    try {
      // Try database first
      const data = await dbOperation();
      return { data, fromCache: false };
    } catch (dbError: any) {
      // Check if it's a connection error
      const isConnectionError = 
        dbError.code === 'ECONNREFUSED' ||
        dbError.code === 'ETIMEDOUT' ||
        dbError.code === 'ENOTFOUND' ||
        dbError.message?.includes('Connection terminated') ||
        dbError.message?.includes('connection refused');

      if (!isConnectionError) {
        // Not a connection error, rethrow
        throw dbError;
      }

      logger.warn('Database unavailable, trying cache fallback', {
        operation,
        userId,
        error: dbError.message,
      });

      // Try cache
      const cachedData = await cacheOperation();

      if (cachedData) {
        cacheFallbackTotal.inc({ operation, status: 'success' });
        
        logger.info('Serving from cache fallback', {
          operation,
          userId,
        });

        return { data: cachedData, fromCache: true };
      }

      // No cached data available
      cacheFallbackTotal.inc({ operation, status: 'miss' });
      
      logger.error('Cache fallback failed - no cached data', {
        operation,
        userId,
      });

      // Rethrow original error
      throw dbError;
    }
  }

  /**
   * Get cache age in seconds
   */
  getCacheAge(cachedAt: number): number {
    return Math.floor((Date.now() - cachedAt) / 1000);
  }

  /**
   * Check if cache is considered fresh
   */
  isCacheFresh(cachedAt: number, maxAgeSeconds: number): boolean {
    return this.getCacheAge(cachedAt) < maxAgeSeconds;
  }
}

export const cacheFallbackService = new CacheFallbackService();
