import { redis } from '../config/redis';

export class RateLimitService {
  private limits: Map<string, { points: number; duration: number }> = new Map([
    ['login', { points: 5, duration: 60 }],  // 5 attempts per minute
    ['register', { points: 3, duration: 300 }], // 3 per 5 minutes
    ['wallet', { points: 10, duration: 60 }], // 10 per minute
  ]);

  async consume(
    action: string,
    venueId: string | null,
    identifier: string
  ): Promise<void> {
    const limit = this.limits.get(action) || { points: 100, duration: 60 };
    const key = venueId 
      ? `rate:${action}:${venueId}:${identifier}`
      : `rate:${action}:${identifier}`;
    
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, limit.duration);
    }
    
    if (current > limit.points) {
      const ttl = await redis.ttl(key);
      throw new Error(`Rate limit exceeded. Try again in ${ttl} seconds.`);
    }
  }
}
