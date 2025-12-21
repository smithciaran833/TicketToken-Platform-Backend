/**
 * Brute Force Protection Service - Migrated to @tickettoken/shared
 * 
 * Uses atomic rate limiting from shared library with proper lockout handling.
 */

import { getRateLimiter, getKeyBuilder } from '@tickettoken/shared';
import { getRedis } from '../config/redis';

export class BruteForceProtectionService {
  private rateLimiter = getRateLimiter();
  private keyBuilder = getKeyBuilder();
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60; // 15 minutes in seconds
  private readonly attemptWindow = 15 * 60; // 15 minutes in seconds
  
  async recordFailedAttempt(identifier: string): Promise<{
    locked: boolean;
    remainingAttempts: number;
    lockoutUntil?: Date;
  }> {
    const key = this.keyBuilder.failedAuth(identifier);
    const lockKey = this.keyBuilder.authLock(identifier);
    
    // Check if already locked using shared client
    const redis = getRedis();
    const isLocked = await redis.get(lockKey);
    if (isLocked) {
      const ttl = await redis.ttl(lockKey);
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + ttl * 1000)
      };
    }
    
    // Use fixed window rate limiting for counting failed attempts
    const result = await this.rateLimiter.fixedWindow(
      key,
      this.maxAttempts,
      this.attemptWindow * 1000
    );
    
    // If limit exceeded, lock the account
    if (!result.allowed) {
      await redis.setex(lockKey, this.lockoutDuration, 'locked');
      await redis.del(key); // Clear attempts counter
      
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + this.lockoutDuration * 1000)
      };
    }
    
    return {
      locked: false,
      remainingAttempts: result.remaining
    };
  }
  
  async clearFailedAttempts(identifier: string): Promise<void> {
    const key = this.keyBuilder.failedAuth(identifier);
    const redis = getRedis();
    await redis.del(key);
  }
  
  async isLocked(identifier: string): Promise<boolean> {
    const lockKey = this.keyBuilder.authLock(identifier);
    const redis = getRedis();
    const isLocked = await redis.get(lockKey);
    return !!isLocked;
  }
  
  async getLockInfo(identifier: string): Promise<{
    locked: boolean;
    remainingTime?: number;
  }> {
    const lockKey = this.keyBuilder.authLock(identifier);
    const redis = getRedis();
    const ttl = await redis.ttl(lockKey);
    
    if (ttl > 0) {
      return {
        locked: true,
        remainingTime: ttl
      };
    }
    
    return { locked: false };
  }
}
