import { logger } from './logger';

const log = logger.child({ component: 'Resilience' });

/**
 * SECURITY FIX (FB1): Fallback pattern for graceful degradation
 * Provides fallback methods when primary operations fail
 */

export interface FallbackOptions<T> {
  /** Primary operation to attempt */
  primary: () => Promise<T>;
  /** Fallback if primary fails */
  fallback: () => Promise<T> | T;
  /** Optional cache to check before primary */
  cache?: () => Promise<T | null>;
  /** Operation name for logging */
  name: string;
  /** Maximum retries for primary */
  maxRetries?: number;
  /** Timeout for primary operation (ms) */
  timeout?: number;
}

/**
 * SECURITY FIX (FB1): Execute operation with fallback
 */
export async function withFallback<T>(options: FallbackOptions<T>): Promise<T> {
  const { primary, fallback, cache, name, maxRetries = 1, timeout = 30000 } = options;

  // Check cache first if available
  if (cache) {
    try {
      const cached = await cache();
      if (cached !== null) {
        log.debug({ name }, 'Returning cached result');
        return cached;
      }
    } catch (cacheError) {
      log.warn({ name, error: cacheError }, 'Cache check failed');
    }
  }

  // Attempt primary with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        primary(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
        ),
      ]);
      return result;
    } catch (error: any) {
      log.warn({ name, attempt, maxRetries, error: error.message }, 'Primary operation failed');

      if (attempt === maxRetries) {
        // All retries exhausted, use fallback
        log.info({ name }, 'Using fallback after primary failures');
        try {
          const fallbackResult = await fallback();
          log.info({ name }, 'Fallback succeeded');
          return fallbackResult;
        } catch (fallbackError: any) {
          log.error({ name, error: fallbackError.message }, 'Fallback also failed');
          throw fallbackError;
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }

  // Should never reach here
  throw new Error('Unexpected error in withFallback');
}

/**
 * SECURITY FIX (SR8): Resource quota tracking per tenant
 */
export interface ResourceQuota {
  maxVenues: number;
  maxEventsPerVenue: number;
  maxIntegrationsPerVenue: number;
  maxStorageMb: number;
  maxApiCallsPerDay: number;
}

export interface TenantResourceUsage {
  venues: number;
  eventsPerVenue: Map<string, number>;
  integrationsPerVenue: Map<string, number>;
  storageMb: number;
  apiCallsToday: number;
}

// Default quotas by tier
const QUOTA_TIERS: Record<string, ResourceQuota> = {
  free: {
    maxVenues: 1,
    maxEventsPerVenue: 10,
    maxIntegrationsPerVenue: 2,
    maxStorageMb: 100,
    maxApiCallsPerDay: 1000,
  },
  basic: {
    maxVenues: 5,
    maxEventsPerVenue: 50,
    maxIntegrationsPerVenue: 5,
    maxStorageMb: 500,
    maxApiCallsPerDay: 10000,
  },
  professional: {
    maxVenues: 20,
    maxEventsPerVenue: 200,
    maxIntegrationsPerVenue: 10,
    maxStorageMb: 2000,
    maxApiCallsPerDay: 50000,
  },
  enterprise: {
    maxVenues: -1, // Unlimited
    maxEventsPerVenue: -1,
    maxIntegrationsPerVenue: -1,
    maxStorageMb: -1,
    maxApiCallsPerDay: -1,
  },
};

export class ResourceQuotaManager {
  private redis: any;
  private db: any;

  constructor(redis: any, db: any) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Get quota limits for a tenant based on their tier
   */
  async getQuotaForTenant(tenantId: string): Promise<ResourceQuota> {
    try {
      // Get tenant tier from database
      const tenant = await this.db('tenants')
        .where('id', tenantId)
        .select('subscription_tier', 'custom_quotas')
        .first();

      if (!tenant) {
        return QUOTA_TIERS.free;
      }

      const tierQuota = QUOTA_TIERS[tenant.subscription_tier] || QUOTA_TIERS.free;

      // Merge with custom quotas if any
      if (tenant.custom_quotas) {
        return { ...tierQuota, ...tenant.custom_quotas };
      }

      return tierQuota;
    } catch (error) {
      log.error({ tenantId, error }, 'Failed to get quota for tenant');
      return QUOTA_TIERS.free;
    }
  }

  /**
   * Check if a resource operation is within quota
   */
  async checkQuota(
    tenantId: string,
    resource: keyof ResourceQuota,
    currentCount?: number
  ): Promise<{ allowed: boolean; limit: number; current: number; remaining: number }> {
    const quota = await this.getQuotaForTenant(tenantId);
    const limit = quota[resource] as number;

    // Unlimited
    if (limit === -1) {
      return { allowed: true, limit: -1, current: currentCount || 0, remaining: -1 };
    }

    // Get current usage from cache or calculate
    let current = currentCount;
    if (current === undefined) {
      current = await this.getCurrentUsage(tenantId, resource);
    }

    const allowed = current < limit;
    const remaining = Math.max(0, limit - current);

    if (!allowed) {
      log.warn({ tenantId, resource, limit, current }, 'Quota exceeded');
    }

    return { allowed, limit, current, remaining };
  }

  /**
   * Get current usage for a resource
   */
  private async getCurrentUsage(tenantId: string, resource: keyof ResourceQuota): Promise<number> {
    const cacheKey = `quota:usage:${tenantId}:${resource}`;

    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        return parseInt(cached, 10);
      }

      // Calculate from database
      let count = 0;
      switch (resource) {
        case 'maxVenues':
          const venueResult = await this.db('venues')
            .where('tenant_id', tenantId)
            .count('* as count')
            .first();
          count = parseInt(venueResult?.count || '0', 10);
          break;

        case 'maxApiCallsPerDay':
          // Get from Redis counter
          const apiKey = `api_calls:${tenantId}:${new Date().toISOString().split('T')[0]}`;
          const apiCount = await this.redis.get(apiKey);
          count = parseInt(apiCount || '0', 10);
          break;

        default:
          count = 0;
      }

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, count.toString());

      return count;
    } catch (error) {
      log.error({ tenantId, resource, error }, 'Failed to get current usage');
      return 0;
    }
  }

  /**
   * Increment API call counter for rate limiting
   */
  async incrementApiCalls(tenantId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = `api_calls:${tenantId}:${today}`;

    try {
      const count = await this.redis.incr(key);
      // Set expiry on first increment (24 hours + buffer)
      if (count === 1) {
        await this.redis.expire(key, 90000); // 25 hours
      }
      return count;
    } catch (error) {
      log.error({ tenantId, error }, 'Failed to increment API calls');
      return 0;
    }
  }

  /**
   * Invalidate usage cache when resources change
   */
  async invalidateUsageCache(tenantId: string, resource: keyof ResourceQuota): Promise<void> {
    const cacheKey = `quota:usage:${tenantId}:${resource}`;
    try {
      await this.redis.del(cacheKey);
    } catch (error) {
      log.warn({ tenantId, resource, error }, 'Failed to invalidate usage cache');
    }
  }
}

/**
 * Create fallback value generators for common scenarios
 */
export const fallbackValues = {
  emptyArray: <T>(): T[] => [],
  emptyObject: <T extends object>(): T => ({} as T),
  defaultConfig: (defaults: Record<string, any>) => () => defaults,
  cachedValue: <T>(cache: Map<string, T>, key: string, defaultValue: T) => (): T => 
    cache.get(key) || defaultValue,
};

export { QUOTA_TIERS };
