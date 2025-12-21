import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { RateLimitError } from '../errors';

export class LockoutService {
  private maxAttempts: number;
  private lockoutDuration: number;

  constructor() {
    this.maxAttempts = env.LOCKOUT_MAX_ATTEMPTS;
    this.lockoutDuration = env.LOCKOUT_DURATION_MINUTES * 60; // Convert to seconds
  }

  async recordFailedAttempt(userId: string, ipAddress: string): Promise<void> {
    const redis = getRedis();
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    // Increment attempts for both user and IP
    const [userAttempts, ipAttempts] = await Promise.all([
      redis.incr(userKey),
      redis.incr(ipKey)
    ]);

    // Set expiry on first attempt
    if (userAttempts === 1) {
      await redis.expire(userKey, this.lockoutDuration);
    }
    if (ipAttempts === 1) {
      await redis.expire(ipKey, this.lockoutDuration);
    }

    // Check if should lock
    if (userAttempts >= this.maxAttempts || ipAttempts >= this.maxAttempts * 2) {
      const lockKey = userAttempts >= this.maxAttempts ? userKey : ipKey;
      const ttl = await redis.ttl(lockKey);
      
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }
  }

  async checkLockout(userId: string, ipAddress: string): Promise<void> {
    const redis = getRedis();
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    const [userAttempts, ipAttempts] = await Promise.all([
      redis.get(userKey),
      redis.get(ipKey)
    ]);

    if (userAttempts && parseInt(userAttempts) >= this.maxAttempts) {
      const ttl = await redis.ttl(userKey);
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }

    if (ipAttempts && parseInt(ipAttempts) >= this.maxAttempts * 2) {
      const ttl = await redis.ttl(ipKey);
      throw new RateLimitError(
        `Too many failed attempts from this IP. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }
  }

  async clearFailedAttempts(userId: string, ipAddress: string): Promise<void> {
    const redis = getRedis();
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    await Promise.all([
      redis.del(userKey),
      redis.del(ipKey)
    ]);
  }
}
