import { createCache } from '@tickettoken/shared';
import { env } from '../config/env';

// Initialize cache with auth-service specific config
const cacheSystem = createCache({
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    keyPrefix: 'auth:',
  },
  ttls: {
    session: 5 * 60,        // 5 minutes for sessions
    user: 5 * 60,           // 5 minutes for user data
    event: 10 * 60,
    venue: 30 * 60,
    ticket: 30,
    template: 60 * 60,
    search: 5 * 60
  }
});

export const cache = cacheSystem.service;
export const cacheMiddleware = cacheSystem.middleware;
export const cacheStrategies = cacheSystem.strategies;
export const cacheInvalidator = cacheSystem.invalidator;

// Session-specific cache functions
export const sessionCache = {
  async getSession(sessionId: string): Promise<any> {
    return cache.get(`session:${sessionId}`, undefined, {
      ttl: 5 * 60,
      level: 'BOTH'
    });
  },

  async setSession(sessionId: string, data: any): Promise<void> {
    await cache.set(`session:${sessionId}`, data, {
      ttl: 5 * 60,
      level: 'BOTH',
      tags: [`user:${data.userId}`]
    });
  },

  async deleteSession(sessionId: string): Promise<void> {
    await cache.delete(`session:${sessionId}`);
  },

  async deleteUserSessions(userId: string): Promise<void> {
    await cache.deleteByTags([`user:${userId}`]);
  }
};

// User-specific cache functions
export const userCache = {
  async getUser(userId: string): Promise<any> {
    return cache.get(`user:${userId}`, undefined, {
      ttl: 5 * 60,
      level: 'BOTH'
    });
  },

  async setUser(userId: string, userData: any): Promise<void> {
    await cache.set(`user:${userId}`, userData, {
      ttl: 5 * 60,
      level: 'BOTH'
    });
  },

  async deleteUser(userId: string): Promise<void> {
    await cache.delete(`user:${userId}`);
    await cache.deleteByTags([`user:${userId}`]);
  },

  async getUserWithFetch(userId: string, fetcher: () => Promise<any>): Promise<any> {
    return cache.get(`user:${userId}`, fetcher, {
      ttl: 5 * 60,
      level: 'BOTH'
    });
  }
};

// Token blacklist cache (for logout)
export const tokenBlacklist = {
  async add(token: string, expiresIn: number): Promise<void> {
    await cache.set(`blacklist:${token}`, true, {
      ttl: expiresIn,
      level: 'L2' // Only Redis, no need for local cache
    });
  },

  async check(token: string): Promise<boolean> {
    const result = await cache.get(`blacklist:${token}`, undefined, {
      level: 'L2'
    });
    return result === true;
  }
};

// Rate limiting cache
export const rateLimitCache = {
  async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
    const count = await cache.get<number>(`ratelimit:${key}`, undefined, {
      level: 'L2'
    }) || 0;

    if (count >= limit) {
      return false;
    }

    await cache.set(`ratelimit:${key}`, count + 1, {
      ttl: window,
      level: 'L2'
    });

    return true;
  },

  async reset(key: string): Promise<void> {
    await cache.delete(`ratelimit:${key}`, 'L2');
  }
};

// Export cache stats for monitoring
export const getCacheStats = () => cache.getStats();

// Add serviceCache for compatibility
export const serviceCache = cache;
