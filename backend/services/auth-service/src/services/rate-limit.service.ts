/**
 * Rate Limit Service - Migrated to @tickettoken/shared
 * 
 * Uses atomic Lua scripts from shared library to prevent race conditions.
 */

import { getRateLimiter, getKeyBuilder } from '@tickettoken/shared';

export class RateLimitService {
  private rateLimiter = getRateLimiter();
  private keyBuilder = getKeyBuilder();
  
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
    
    // Use proper 2-argument rateLimit(type, identifier) signature
    const key = venueId 
      ? this.keyBuilder.rateLimit(`${action}:${venueId}`, identifier)
      : this.keyBuilder.rateLimit(action, identifier);
    
    // Use fixed window rate limiting from shared library
    // This uses atomic operations to prevent race conditions
    const result = await this.rateLimiter.fixedWindow(
      key,
      limit.points,
      limit.duration * 1000 // Convert to milliseconds
    );
    
    if (!result.allowed) {
      const retryAfter = result.retryAfter || limit.duration;
      throw new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    }
  }
}
