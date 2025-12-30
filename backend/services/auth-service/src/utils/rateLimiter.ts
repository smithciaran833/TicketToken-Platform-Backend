import { getRedis } from '../config/redis';
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

  /**
   * Consume rate limit points
   * @param key - Identifier (IP, userId, etc.)
   * @param points - Points to consume (default 1)
   * @param tenantId - Optional tenant ID for multi-tenant isolation
   */
  async consume(key: string, points = 1, tenantId?: string): Promise<void> {
    const redis = getRedis();
    
    // Build key with tenant prefix for multi-tenant isolation
    const fullKey = tenantId
      ? `tenant:${tenantId}:${this.keyPrefix}:${key}`
      : `${this.keyPrefix}:${key}`;
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

  async reset(key: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
    const fullKey = tenantId
      ? `tenant:${tenantId}:${this.keyPrefix}:${key}`
      : `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;
    
    await redis.del(fullKey);
    await redis.del(blockKey);
  }
}

// Pre-configured rate limiters

// Login - 5 attempts per 15 minutes
export const loginRateLimiter = new RateLimiter('login', {
  points: 5,
  duration: 900,
  blockDuration: 900
});

// Registration - 3 per hour
export const registrationRateLimiter = new RateLimiter('register', {
  points: 3,
  duration: 3600,
  blockDuration: 3600
});

// Password reset - 3 per hour
export const passwordResetRateLimiter = new RateLimiter('password-reset', {
  points: 3,
  duration: 3600,
  blockDuration: 3600
});

// OTP/MFA verification - strict: 5 attempts per 5 minutes
export const otpRateLimiter = new RateLimiter('otp-verify', {
  points: 5,
  duration: 300,
  blockDuration: 900
});

// MFA setup - 3 attempts per hour
export const mfaSetupRateLimiter = new RateLimiter('mfa-setup', {
  points: 3,
  duration: 3600,
  blockDuration: 3600
});

// Backup code - very strict: 3 attempts per hour, 2 hour block
export const backupCodeRateLimiter = new RateLimiter('backup-code', {
  points: 3,
  duration: 3600,
  blockDuration: 7200
});
