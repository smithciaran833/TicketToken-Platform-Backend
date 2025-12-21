/**
 * Redis Rate Limiter
 * 
 * Multiple rate limiting strategies: sliding window, fixed window, and token bucket.
 * Uses Lua scripts for atomic operations to prevent race conditions.
 */

import { getRedisClient } from '../connection-manager';
import { getSortedSetOps } from '../operations/sorted-set';
import { getKeyBuilder } from '../utils/key-builder';
import { executeScript } from '../lua/script-loader';
import { RATE_LIMIT_SCRIPT } from '../lua/scripts/rate-limit.lua';
import { RateLimitResult, RateLimiterConfig, RedisOperationError } from '../types';

/**
 * Rate Limiter Class
 */
export class RateLimiter {
  private sortedSetOps = getSortedSetOps();
  private keyBuilder = getKeyBuilder();
  
  /**
   * Sliding window rate limit using sorted sets and Lua script
   * Most accurate, prevents burst at window boundaries
   */
  async slidingWindow(
    key: string,
    max: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const result = await executeScript<[number, number, number]>(
        'rate-limit-sliding',
        RATE_LIMIT_SCRIPT,
        [key],
        [now, windowMs, max]
      );
      
      const [allowed, remaining, resetAt] = result;
      
      return {
        allowed: allowed === 1,
        remaining,
        resetAt: new Date(resetAt),
        retryAfter: allowed === 0 ? Math.ceil((resetAt - now) / 1000) : undefined,
        limit: max,
        current: max - remaining,
      };
    } catch (error) {
      throw new RedisOperationError(
        'Sliding window rate limit failed',
        'slidingWindow',
        key,
        error as Error
      );
    }
  }
  
  /**
   * Fixed window rate limit using INCR and EXPIRE
   * Simpler and faster, but allows burst at window boundaries
   */
  async fixedWindow(
    key: string,
    max: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    try {
      const client = await getRedisClient();
      const windowSec = Math.ceil(windowMs / 1000);
      
      // Increment counter
      const current = await client.incr(key);
      
      // Set expiry on first request
      if (current === 1) {
        await client.expire(key, windowSec);
      }
      
      // Get TTL to calculate reset time
      const ttl = await client.ttl(key);
      const resetAt = new Date(Date.now() + (ttl * 1000));
      
      const allowed = current <= max;
      const remaining = Math.max(0, max - current);
      
      return {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : ttl,
        limit: max,
        current,
      };
    } catch (error) {
      throw new RedisOperationError(
        'Fixed window rate limit failed',
        'fixedWindow',
        key,
        error as Error
      );
    }
  }
  
  /**
   * Token bucket rate limit
   * Allows burst traffic while maintaining average rate
   */
  async tokenBucket(
    key: string,
    capacity: number,
    refillRate: number,
    tokensRequested: number = 1
  ): Promise<RateLimitResult> {
    try {
      const client = await getRedisClient();
      const now = Date.now();
      
      // Get current bucket state
      const bucketData = await client.hgetall(key);
      
      let tokens = capacity;
      let lastRefill = now;
      
      if (bucketData && Object.keys(bucketData).length > 0) {
        tokens = parseFloat(bucketData.tokens || String(capacity));
        lastRefill = parseInt(bucketData.lastRefill || String(now), 10);
        
        // Refill tokens based on time elapsed
        const timePassed = now - lastRefill;
        const tokensToAdd = (timePassed / 1000) * refillRate;
        tokens = Math.min(capacity, tokens + tokensToAdd);
      }
      
      // Check if we have enough tokens
      const allowed = tokens >= tokensRequested;
      
      if (allowed) {
        tokens -= tokensRequested;
      }
      
      // Update bucket state
      await client.hmset(key, {
        tokens: tokens.toString(),
        lastRefill: now.toString(),
      });
      
      // Set expiry (2x the time to fill bucket)
      const expirySeconds = Math.ceil((capacity / refillRate) * 2);
      await client.expire(key, expirySeconds);
      
      const resetAt = new Date(now + ((capacity - tokens) / refillRate) * 1000);
      
      return {
        allowed,
        remaining: Math.floor(tokens),
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil((tokensRequested - tokens) / refillRate),
        limit: capacity,
        current: Math.floor(capacity - tokens),
      };
    } catch (error) {
      throw new RedisOperationError(
        'Token bucket rate limit failed',
        'tokenBucket',
        key,
        error as Error
      );
    }
  }
  
  /**
   * Check rate limit and return result without modifying state
   */
  async check(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const client = await getRedisClient();
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Count requests in window without modifying
      const current = await client.zcount(key, windowStart, now);
      const allowed = current < max;
      const remaining = Math.max(0, max - current);
      
      // Get reset time from oldest entry
      let resetAt = new Date(now + windowMs);
      if (current > 0) {
        const oldest = await client.zrange(key, 0, 0, 'WITHSCORES') as any;
        if (oldest.length >= 2) {
          resetAt = new Date(parseFloat(oldest[1]) + windowMs);
        }
      }
      
      return {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000),
        limit: max,
        current,
      };
    } catch (error) {
      throw new RedisOperationError(
        'Rate limit check failed',
        'check',
        key,
        error as Error
      );
    }
  }
  
  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const deleted = await client.del(key);
      return deleted > 0;
    } catch (error) {
      throw new RedisOperationError(
        'Rate limit reset failed',
        'reset',
        key,
        error as Error
      );
    }
  }
  
  /**
   * Get current usage without affecting the limit
   */
  async getUsage(key: string, windowMs: number): Promise<number> {
    try {
      const client = await getRedisClient();
      const now = Date.now();
      const windowStart = now - windowMs;
      return await client.zcount(key, windowStart, now);
    } catch (error) {
      throw new RedisOperationError(
        'Get usage failed',
        'getUsage',
        key,
        error as Error
      );
    }
  }
}

// Singleton
let rateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter();
  }
  return rateLimiter;
}

export function createRateLimiter(): RateLimiter {
  return new RateLimiter();
}
