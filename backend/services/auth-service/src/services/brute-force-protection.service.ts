import { Redis } from 'ioredis';

export class BruteForceProtectionService {
  private redis: Redis;
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60; // 15 minutes in seconds
  private readonly attemptWindow = 15 * 60; // 15 minutes in seconds
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  async recordFailedAttempt(identifier: string): Promise<{
    locked: boolean;
    remainingAttempts: number;
    lockoutUntil?: Date;
  }> {
    const key = `failed_auth:${identifier}`;
    const lockKey = `auth_lock:${identifier}`;
    
    // Check if already locked
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + (await this.redis.ttl(lockKey)) * 1000)
      };
    }
    
    // Increment failed attempts
    const attempts = await this.redis.incr(key);
    
    // Set expiry on first attempt
    if (attempts === 1) {
      await this.redis.expire(key, this.attemptWindow);
    }
    
    // Lock if max attempts reached
    if (attempts >= this.maxAttempts) {
      await this.redis.setex(lockKey, this.lockoutDuration, 'locked');
      await this.redis.del(key); // Clear attempts counter
      
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + this.lockoutDuration * 1000)
      };
    }
    
    return {
      locked: false,
      remainingAttempts: this.maxAttempts - attempts
    };
  }
  
  async clearFailedAttempts(identifier: string): Promise<void> {
    await this.redis.del(`failed_auth:${identifier}`);
  }
  
  async isLocked(identifier: string): Promise<boolean> {
    const lockKey = `auth_lock:${identifier}`;
    const isLocked = await this.redis.get(lockKey);
    return !!isLocked;
  }
  
  async getLockInfo(identifier: string): Promise<{
    locked: boolean;
    remainingTime?: number;
  }> {
    const lockKey = `auth_lock:${identifier}`;
    const ttl = await this.redis.ttl(lockKey);
    
    if (ttl > 0) {
      return {
        locked: true,
        remainingTime: ttl
      };
    }
    
    return { locked: false };
  }
}
