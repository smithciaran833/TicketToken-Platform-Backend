/**
 * Rate Limit Service - Migrated to @tickettoken/shared
 *
 * Uses atomic Lua scripts from shared library to prevent race conditions.
 */
import { getRateLimiter, getKeyBuilder } from '@tickettoken/shared';
import { RateLimitError } from '../errors';

export class RateLimitService {
  private rateLimiter = getRateLimiter();
  private keyBuilder = getKeyBuilder();

  private limits: Map<string, { points: number; duration: number }> = new Map([
    ['login', { points: 10, duration: 60 }],  // 10 attempts per minute (allows lockout testing)
    ['register', { points: 3, duration: 300 }], // 3 per 5 minutes
    ['wallet', { points: 10, duration: 60 }], // 10 per minute
    ['forgot-password', { points: 3, duration: 300 }], // 3 per 5 minutes
    ['reset-password', { points: 5, duration: 300 }], // 5 per 5 minutes
    ['oauth-callback', { points: 10, duration: 60 }], // 10 per minute
    ['oauth-login', { points: 10, duration: 60 }], // 10 per minute
    ['wallet-nonce', { points: 20, duration: 60 }], // 20 per minute
    ['wallet-register', { points: 5, duration: 300 }], // 5 per 5 minutes
    ['wallet-login', { points: 10, duration: 60 }], // 10 per minute
    ['wallet-link', { points: 5, duration: 300 }], // 5 per 5 minutes
    ['wallet-unlink', { points: 5, duration: 300 }], // 5 per 5 minutes
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
      throw new RateLimitError(`Rate limit exceeded. Try again in ${retryAfter} seconds.`, retryAfter);
    }
  }
}
