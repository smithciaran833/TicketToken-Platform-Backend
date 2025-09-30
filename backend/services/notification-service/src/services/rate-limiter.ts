import Redis from 'ioredis';
import { logger } from '../config/logger';

interface RateLimitConfig {
  max: number;           // Maximum requests
  duration: number;      // Time window in seconds
  keyPrefix?: string;    // Redis key prefix
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until retry
}

export class RateLimiter {
  private redis: Redis;
  private configs: Map<string, RateLimitConfig>;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
    
    this.configs = new Map();
    this.initializeConfigs();
  }
  
  private initializeConfigs() {
    // Per-user rate limits
    this.configs.set('email:user', {
      max: parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '20'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:email:user:'
    });
    
    this.configs.set('sms:user', {
      max: parseInt(process.env.RATE_LIMIT_SMS_PER_HOUR || '5'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:sms:user:'
    });
    
    this.configs.set('push:user', {
      max: parseInt(process.env.RATE_LIMIT_PUSH_PER_HOUR || '50'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:push:user:'
    });
    
    // Global rate limits
    this.configs.set('email:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_EMAIL_PER_MIN || '1000'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:email:global'
    });
    
    this.configs.set('sms:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_SMS_PER_MIN || '100'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:sms:global'
    });
    
    // API endpoint rate limits
    this.configs.set('api:send', {
      max: 100,
      duration: 60, // 100 requests per minute
      keyPrefix: 'rl:api:send:'
    });
    
    this.configs.set('api:preferences', {
      max: 50,
      duration: 60, // 50 requests per minute
      keyPrefix: 'rl:api:pref:'
    });
  }
  
  async checkLimit(
    type: string,
    identifier: string = 'global'
  ): Promise<RateLimitResult> {
    const config = this.configs.get(type);
    
    if (!config) {
      // No rate limit configured, allow
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 3600000)
      };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    try {
      // Use Redis sorted set for sliding window
      const pipe = this.redis.pipeline();
      
      // Remove old entries outside the window
      pipe.zremrangebyscore(key, '-inf', windowStart);
      
      // Count current entries in window
      pipe.zcard(key);
      
      // Add current request
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiry
      pipe.expire(key, config.duration);
      
      const results = await pipe.exec();
      
      if (!results) {
        throw new Error('Redis pipeline failed');
      }
      
      const count = (results[1]?.[1] as number) || 0;
      const allowed = count < config.max;
      
      if (!allowed) {
        // Get oldest entry to calculate retry time
        const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestEntry?.[1] ? parseInt(oldestEntry[1]) : now;
        const retryAfter = Math.ceil((oldestTime + config.duration * 1000 - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          type,
          identifier,
          count,
          max: config.max,
          retryAfter
        });
        
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(oldestTime + config.duration * 1000),
          retryAfter
        };
      }
      
      return {
        allowed: true,
        remaining: config.max - count - 1,
        resetAt: new Date(now + config.duration * 1000)
      };
      
    } catch (error) {
      logger.error('Rate limit check failed', { error, type, identifier });
      
      // On error, be permissive but log
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date(now + 60000)
      };
    }
  }
  
  async checkMultiple(
    checks: Array<{ type: string; identifier?: string }>
  ): Promise<boolean> {
    const results = await Promise.all(
      checks.map(check => this.checkLimit(check.type, check.identifier))
    );
    
    return results.every(result => result.allowed);
  }
  
  async reset(type: string, identifier: string = 'global'): Promise<void> {
    const config = this.configs.get(type);
    if (!config) return;
    
    const key = `${config.keyPrefix}${identifier}`;
    await this.redis.del(key);
    
    logger.info('Rate limit reset', { type, identifier });
  }
  
  async getStatus(type: string, identifier: string = 'global'): Promise<any> {
    const config = this.configs.get(type);
    if (!config) {
      return { configured: false };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    // Clean old entries and get count
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await this.redis.zcard(key);
    
    return {
      configured: true,
      current: count,
      max: config.max,
      remaining: Math.max(0, config.max - count),
      duration: config.duration,
      resetAt: new Date(now + config.duration * 1000)
    };
  }
  
  // Middleware for Express routes
  middleware(type: string = 'api:send') {
    return async (req: any, res: any, next: any) => {
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await this.checkLimit(type, identifier);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.configs.get(type)?.max || 0,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': result.resetAt.toISOString()
      });
      
      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: result.retryAfter,
          resetAt: result.resetAt
        });
      }
      
      next();
    };
  }
  
  // Check if notification should be sent based on rate limits
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<boolean> {
    // Check both user and global limits
    const checks = [
      { type: `${channel}:user`, identifier: userId },
      { type: `${channel}:global` }
    ];
    
    return this.checkMultiple(checks);
  }
  
  // Record notification sent (for accurate counting)
  async recordNotificationSent(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<void> {
    const now = Date.now();
    
    // Update user limit
    const userConfig = this.configs.get(`${channel}:user`);
    if (userConfig) {
      const userKey = `${userConfig.keyPrefix}${userId}`;
      await this.redis.zadd(userKey, now, `${now}-sent`);
      await this.redis.expire(userKey, userConfig.duration);
    }
    
    // Update global limit
    const globalConfig = this.configs.get(`${channel}:global`);
    if (globalConfig) {
      const globalKey = globalConfig.keyPrefix!;
      await this.redis.zadd(globalKey, now, `${now}-${userId}`);
      await this.redis.expire(globalKey, globalConfig.duration);
    }
  }
}

export const rateLimiter = new RateLimiter();
