/**
 * Redis Service for Compliance Service
 * 
 * AUDIT FIX MT-1: Add tenant prefix to all Redis keys for multi-tenancy
 * 
 * All keys are namespaced with tenant ID to prevent cross-tenant data access.
 */
import Redis from 'ioredis';

// Service prefix for namespace isolation
const SERVICE_PREFIX = 'compliance';

class RedisService {
  private client: Redis | null = null;

  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true
      });

      await this.client.connect();
      await this.client.ping();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Don't throw - Redis is optional
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  /**
   * AUDIT FIX MT-1: Build tenant-prefixed key
   * Format: compliance:{tenant_id}:{key}
   */
  private buildKey(tenantId: string | null, key: string): string {
    if (!tenantId) {
      // For non-tenant-scoped keys (like global health checks)
      return `${SERVICE_PREFIX}:global:${key}`;
    }
    return `${SERVICE_PREFIX}:${tenantId}:${key}`;
  }

  /**
   * Get a value with tenant isolation
   */
  async get(tenantId: string | null, key: string): Promise<string | null> {
    if (!this.client) return null;
    const fullKey = this.buildKey(tenantId, key);
    return this.client.get(fullKey);
  }

  /**
   * Set a value with tenant isolation
   */
  async set(tenantId: string | null, key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) return;
    const fullKey = this.buildKey(tenantId, key);
    if (ttl) {
      await this.client.setex(fullKey, ttl, value);
    } else {
      await this.client.set(fullKey, value);
    }
  }

  /**
   * Delete a key with tenant isolation
   */
  async del(tenantId: string | null, key: string): Promise<void> {
    if (!this.client) return;
    const fullKey = this.buildKey(tenantId, key);
    await this.client.del(fullKey);
  }

  /**
   * Get JSON value with tenant isolation
   */
  async getJson<T>(tenantId: string | null, key: string): Promise<T | null> {
    const value = await this.get(tenantId, key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set JSON value with tenant isolation
   */
  async setJson<T>(tenantId: string | null, key: string, value: T, ttl?: number): Promise<void> {
    await this.set(tenantId, key, JSON.stringify(value), ttl);
  }

  /**
   * Check if key exists with tenant isolation
   */
  async exists(tenantId: string | null, key: string): Promise<boolean> {
    if (!this.client) return false;
    const fullKey = this.buildKey(tenantId, key);
    const result = await this.client.exists(fullKey);
    return result === 1;
  }

  /**
   * Increment a counter with tenant isolation
   */
  async incr(tenantId: string | null, key: string): Promise<number> {
    if (!this.client) return 0;
    const fullKey = this.buildKey(tenantId, key);
    return this.client.incr(fullKey);
  }

  /**
   * Set expiry on a key with tenant isolation
   */
  async expire(tenantId: string | null, key: string, seconds: number): Promise<void> {
    if (!this.client) return;
    const fullKey = this.buildKey(tenantId, key);
    await this.client.expire(fullKey, seconds);
  }

  /**
   * Get all keys matching pattern for a tenant
   * WARNING: Use sparingly - KEYS is expensive in production
   */
  async keys(tenantId: string | null, pattern: string): Promise<string[]> {
    if (!this.client) return [];
    const fullPattern = this.buildKey(tenantId, pattern);
    return this.client.keys(fullPattern);
  }

  /**
   * Delete all keys for a tenant (for GDPR data deletion)
   * Uses SCAN instead of KEYS for production safety
   */
  async deleteAllForTenant(tenantId: string): Promise<number> {
    if (!this.client) return 0;
    const pattern = `${SERVICE_PREFIX}:${tenantId}:*`;
    let cursor = '0';
    let deleted = 0;

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
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  /**
   * Hash operations with tenant isolation
   */
  async hset(tenantId: string | null, key: string, field: string, value: string): Promise<void> {
    if (!this.client) return;
    const fullKey = this.buildKey(tenantId, key);
    await this.client.hset(fullKey, field, value);
  }

  async hget(tenantId: string | null, key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    const fullKey = this.buildKey(tenantId, key);
    return this.client.hget(fullKey, field);
  }

  async hgetall(tenantId: string | null, key: string): Promise<Record<string, string> | null> {
    if (!this.client) return null;
    const fullKey = this.buildKey(tenantId, key);
    return this.client.hgetall(fullKey);
  }

  /**
   * Set operations with tenant isolation (for rate limiting, etc.)
   */
  async sadd(tenantId: string | null, key: string, ...members: string[]): Promise<number> {
    if (!this.client) return 0;
    const fullKey = this.buildKey(tenantId, key);
    return this.client.sadd(fullKey, ...members);
  }

  async sismember(tenantId: string | null, key: string, member: string): Promise<boolean> {
    if (!this.client) return false;
    const fullKey = this.buildKey(tenantId, key);
    const result = await this.client.sismember(fullKey, member);
    return result === 1;
  }

  /**
   * Distributed lock for tenant-scoped operations
   */
  async acquireLock(tenantId: string | null, resource: string, ttlMs: number): Promise<boolean> {
    if (!this.client) return true; // If no Redis, allow operation
    const lockKey = this.buildKey(tenantId, `lock:${resource}`);
    const result = await this.client.set(lockKey, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(tenantId: string | null, resource: string): Promise<void> {
    if (!this.client) return;
    const lockKey = this.buildKey(tenantId, `lock:${resource}`);
    await this.client.del(lockKey);
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      console.log('Redis connection closed');
    }
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const redis = new RedisService();

// Alias for backwards compatibility with code expecting 'redisService'
export const redisService = {
  /**
   * Get value (simplified interface without tenant)
   */
  async get<T = string>(key: string): Promise<T | null> {
    const value = await redis.get(null, key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  /**
   * Set value with TTL (simplified interface without tenant)
   */
  async setWithTTL<T>(key: string, value: T, ttl: number): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await redis.set(null, key, stringValue, ttl);
  },

  /**
   * Set with NX (only if not exists) - for distributed locks
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const client = redis.getClient();
    if (!client) return false;
    const result = await client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  },

  /**
   * Eval Lua script - for atomic operations
   */
  async eval(script: string, keys: string[], args: string[]): Promise<any> {
    const client = redis.getClient();
    if (!client) return null;
    return client.eval(script, keys.length, ...keys, ...args);
  }
};

export default redis;
