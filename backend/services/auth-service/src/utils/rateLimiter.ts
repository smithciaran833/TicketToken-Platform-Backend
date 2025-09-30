import { redis } from '../config/redis';
import { RateLimitError } from '../errors';

interface RateLimitOptions {
  points: number;      // Number of requests
  duration: number;    // Per duration in seconds
  blockDuration?: number; // Block duration in seconds after limit exceeded
}

export class RateLimiter {
  private keyPrefix: string;
  private options: RateLimitOptions;

  constructor(keyPrefix: string, options: RateLimitOptions) {
    this.keyPrefix = keyPrefix;
    this.options = {
      blockDuration: options.duration * 2,
      ...options
    };
  }

  async consume(key: string, _points = 1): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;

    // Check if blocked
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const ttl = await redis.ttl(blockKey);
      throw new RateLimitError('Too many requests', ttl);
    }

    // Get current points
    const currentPoints = await redis.incr(fullKey);
    
    // Set expiry on first request
    if (currentPoints === 1) {
      await redis.expire(fullKey, this.options.duration);
    }

    // Check if limit exceeded
    if (currentPoints > this.options.points) {
      // Block the key
      await redis.setex(blockKey, this.options.blockDuration!, '1');
      
      throw new RateLimitError(
        'Rate limit exceeded',
        this.options.blockDuration!
      );
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;
    
    await redis.del(fullKey);
    await redis.del(blockKey);
  }
}

// Pre-configured rate limiters
export const loginRateLimiter = new RateLimiter('login', {
  points: 5,        // 5 attempts
  duration: 900,    // per 15 minutes
  blockDuration: 900 // block for 15 minutes
});

export const registrationRateLimiter = new RateLimiter('register', {
  points: 3,        // 3 registrations
  duration: 3600,   // per hour
  blockDuration: 3600
});

export const passwordResetRateLimiter = new RateLimiter('password-reset', {
  points: 3,        // 3 attempts
  duration: 3600,   // per hour
  blockDuration: 3600
});
