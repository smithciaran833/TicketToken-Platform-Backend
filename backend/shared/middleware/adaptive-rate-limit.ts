import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  adaptiveRateLimit?: boolean;
  burstAllowance?: number;
}

/**
 * Adaptive rate limiter that adjusts based on system load
 */
export class AdaptiveRateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;
  private log = logger.child({ component: 'AdaptiveRateLimiter' });

  constructor(redisUrl: string, config: RateLimitConfig) {
    this.redis = new Redis(redisUrl);
    this.config = {
      windowMs: 60000, // 1 minute default
      maxRequests: 100,
      burstAllowance: 10,
      adaptiveRateLimit: true,
      ...config
    };
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      try {
        // Clean old entries
        await this.redis.zremrangebyscore(key, '-inf', windowStart);

        // Get current request count
        const currentCount = await this.redis.zcard(key);

        // Calculate adaptive limit based on error rate
        let limit = this.config.maxRequests;
        if (this.config.adaptiveRateLimit) {
          limit = await this.getAdaptiveLimit(key, limit);
        }

        // Check if burst allowance should apply
        const burst = await this.checkBurstAllowance(key, currentCount, limit);
        const effectiveLimit = burst ? limit + this.config.burstAllowance! : limit;

        if (currentCount >= effectiveLimit) {
          // Calculate retry-after with jitter
          const retryAfter = this.calculateRetryAfter(windowStart);
          
          res.setHeader('Retry-After', retryAfter.toString());
          res.setHeader('X-RateLimit-Limit', effectiveLimit.toString());
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader('X-RateLimit-Reset', new Date(windowStart + this.config.windowMs).toISOString());

          return res.status(429).json({
            error: 'Too Many Requests',
            retryAfter,
            message: 'Rate limit exceeded. Please retry with exponential backoff.'
          });
        }

        // Add current request
        await this.redis.zadd(key, now, `${now}-${Math.random()}`);
        await this.redis.expire(key, Math.ceil(this.config.windowMs / 1000));

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', effectiveLimit.toString());
        res.setHeader('X-RateLimit-Remaining', (effectiveLimit - currentCount - 1).toString());
        res.setHeader('X-RateLimit-Reset', new Date(windowStart + this.config.windowMs).toISOString());

        // Track response for adaptive limiting
        const originalSend = res.send;
        res.send = function(body: any) {
          const success = res.statusCode < 400;
          if (!success) {
            // Track errors for adaptive rate limiting
            this.trackError(key);
          }
          return originalSend.call(this, body);
        }.bind(this);

        next();
      } catch (error) {
        this.log.error('Rate limiter error:', error);
        // On error, allow request but log it
        next();
      }
    };
  }

  private getKey(req: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }

    // Default key based on IP and path
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const path = req.path;
    const userId = (req as any).user?.id || 'anonymous';
    
    return `ratelimit:${ip}:${userId}:${path}`;
  }

  private async getAdaptiveLimit(key: string, baseLimit: number): Promise<number> {
    const errorKey = `${key}:errors`;
    const errorCount = await this.redis.get(errorKey);
    
    if (!errorCount) {
      return baseLimit;
    }

    const errors = parseInt(errorCount);
    const errorRate = errors / baseLimit;

    // Reduce limit if error rate is high
    if (errorRate > 0.5) {
      return Math.max(10, Math.floor(baseLimit * 0.5)); // 50% reduction
    } else if (errorRate > 0.3) {
      return Math.max(20, Math.floor(baseLimit * 0.7)); // 30% reduction
    } else if (errorRate > 0.1) {
      return Math.max(50, Math.floor(baseLimit * 0.9)); // 10% reduction
    }

    return baseLimit;
  }

  private async checkBurstAllowance(
    key: string,
    currentCount: number,
    limit: number
  ): Promise<boolean> {
    if (!this.config.burstAllowance) return false;

    const burstKey = `${key}:burst`;
    const lastBurst = await this.redis.get(burstKey);

    if (!lastBurst) {
      // Allow burst if not used recently
      if (currentCount >= limit) {
        await this.redis.setex(burstKey, 300, Date.now().toString()); // 5 minute cooldown
        return true;
      }
    }

    return false;
  }

  private calculateRetryAfter(windowStart: number): number {
    const windowEnd = windowStart + this.config.windowMs;
    const baseDelay = Math.ceil((windowEnd - Date.now()) / 1000);
    
    // Add jitter (0-5 seconds)
    const jitter = Math.floor(Math.random() * 5);
    
    return Math.max(1, baseDelay + jitter);
  }

  private async trackError(key: string): Promise<void> {
    const errorKey = `${key}:errors`;
    try {
      await this.redis.incr(errorKey);
      await this.redis.expire(errorKey, Math.ceil(this.config.windowMs / 1000));
    } catch (error) {
      this.log.error('Failed to track error:', error);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Create rate limiter middleware with different configurations
 */
export function createRateLimiter(redisUrl: string, type: 'api' | 'auth' | 'webhook' | 'internal'): any {
  const configs: Record<string, RateLimitConfig> = {
    api: {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      burstAllowance: 20,
      adaptiveRateLimit: true
    },
    auth: {
      windowMs: 900000, // 15 minutes
      maxRequests: 5,
      burstAllowance: 2,
      skipSuccessfulRequests: true
    },
    webhook: {
      windowMs: 1000, // 1 second
      maxRequests: 10,
      burstAllowance: 5
    },
    internal: {
      windowMs: 1000,
      maxRequests: 50,
      adaptiveRateLimit: true
    }
  };

  const limiter = new AdaptiveRateLimiter(redisUrl, configs[type]);
  return limiter.middleware();
}
