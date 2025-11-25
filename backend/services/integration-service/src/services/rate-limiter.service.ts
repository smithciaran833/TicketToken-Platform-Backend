/**
 * Rate Limiter Service
 * 
 * Manages rate limiting for external API calls to respect provider limits
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
  provider: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiterService {
  private limits: Map<string, RateLimitEntry> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default rate limit configurations for each provider
   */
  private initializeDefaultConfigs(): void {
    // Mailchimp: 10 requests per second
    this.registerConfig({
      provider: 'mailchimp',
      maxRequests: 10,
      windowMs: 1000,
    });

    // QuickBooks: 500 requests per minute (minor version), 100/min (major APIs)
    this.registerConfig({
      provider: 'quickbooks',
      maxRequests: 100,
      windowMs: 60000,
    });

    // Square: 100 requests per 10 seconds per endpoint
    this.registerConfig({
      provider: 'square',
      maxRequests: 100,
      windowMs: 10000,
    });

    // Stripe: 100 requests per second in test mode, 100/sec in live mode
    this.registerConfig({
      provider: 'stripe',
      maxRequests: 100,
      windowMs: 1000,
    });
  }

  /**
   * Register rate limit configuration
   */
  registerConfig(config: RateLimitConfig): void {
    this.configs.set(config.provider, config);
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(
    provider: string,
    venueId: string,
    operation?: string
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const key = this.getLimitKey(provider, venueId, operation);
    const config = this.configs.get(provider);

    if (!config) {
      // No rate limit configured, allow request
      return { allowed: true };
    }

    const now = Date.now();
    const limitEntry = this.limits.get(key);

    // If no entry exists or window has expired, create new entry
    if (!limitEntry || now >= limitEntry.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return { allowed: true };
    }

    // Check if limit is exceeded
    if (limitEntry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((limitEntry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment count
    limitEntry.count++;
    this.limits.set(key, limitEntry);

    return { allowed: true };
  }

  /**
   * Wait if rate limit is exceeded
   */
  async waitIfNeeded(
    provider: string,
    venueId: string,
    operation?: string
  ): Promise<void> {
    const result = await this.checkLimit(provider, venueId, operation);

    if (!result.allowed && result.retryAfter) {
      console.log(
        `Rate limit exceeded for ${provider}. Waiting ${result.retryAfter}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, result.retryAfter! * 1000));
      // Recursively check again after waiting
      return this.waitIfNeeded(provider, venueId, operation);
    }
  }

  /**
   * Execute with rate limiting
   */
  async executeWithRateLimit<T>(
    provider: string,
    venueId: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    await this.waitIfNeeded(provider, venueId, operation);
    return fn();
  }

  /**
   * Get current usage stats
   */
  getUsageStats(provider: string, venueId: string): {
    current: number;
    max: number;
    resetsIn: number;
  } | null {
    const key = this.getLimitKey(provider, venueId);
    const config = this.configs.get(provider);
    const limitEntry = this.limits.get(key);

    if (!config || !limitEntry) {
      return null;
    }

    const now = Date.now();
    const resetsIn = Math.max(0, limitEntry.resetTime - now);

    return {
      current: limitEntry.count,
      max: config.maxRequests,
      resetsIn: Math.ceil(resetsIn / 1000),
    };
  }

  /**
   * Reset rate limit for specific provider/venue
   */
  reset(provider: string, venueId: string, operation?: string): void {
    const key = this.getLimitKey(provider, venueId, operation);
    this.limits.delete(key);
  }

  /**
   * Clear all limits (useful for testing)
   */
  clearAll(): void {
    this.limits.clear();
  }

  /**
   * Generate limit key
   */
  private getLimitKey(provider: string, venueId: string, operation?: string): string {
    return operation
      ? `${provider}:${venueId}:${operation}`
      : `${provider}:${venueId}`;
  }

  /**
   * Clean up expired entries (should be called periodically)
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.limits.delete(key);
    }
  }
}

// Export singleton instance
export const rateLimiterService = new RateLimiterService();

// Clean up expired entries every minute
setInterval(() => {
  rateLimiterService.cleanup();
}, 60000);
