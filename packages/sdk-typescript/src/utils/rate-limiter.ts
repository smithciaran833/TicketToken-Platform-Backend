export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface RequestRecord {
  timestamp: number;
  count: number;
}

export class RateLimiter {
  private requests: Map<string, RequestRecord[]> = new Map();

  constructor(private options: RateLimiterOptions) {}

  /**
   * Check if a request should be allowed
   */
  async checkLimit(key: string = 'default'): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Get existing requests for this key
    let records = this.requests.get(key) || [];

    // Remove expired records
    records = records.filter(r => r.timestamp > windowStart);

    // Count requests in current window
    const requestCount = records.reduce((sum, r) => sum + r.count, 0);

    if (requestCount >= this.options.maxRequests) {
      // Calculate when the oldest request will expire
      const oldestRequest = records[0];
      const retryAfter = oldestRequest 
        ? Math.ceil((oldestRequest.timestamp + this.options.windowMs - now) / 1000)
        : Math.ceil(this.options.windowMs / 1000);

      throw new RateLimitError(
        `Rate limit exceeded. Retry after ${retryAfter} seconds`,
        retryAfter
      );
    }

    // Add new request
    records.push({ timestamp: now, count: 1 });
    this.requests.set(key, records);
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string = 'default'): number {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    const records = this.requests.get(key) || [];
    const validRecords = records.filter(r => r.timestamp > windowStart);
    const requestCount = validRecords.reduce((sum, r) => sum + r.count, 0);

    return Math.max(0, this.options.maxRequests - requestCount);
  }

  /**
   * Reset limits for a key
   */
  reset(key: string = 'default'): void {
    this.requests.delete(key);
  }

  /**
   * Reset all limits
   */
  resetAll(): void {
    this.requests.clear();
  }
}

/**
 * Create a rate-limited version of a function
 */
export function rateLimit<T extends (...args: any[]) => any>(
  fn: T,
  options: RateLimiterOptions,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const limiter = new RateLimiter(options);

  return (async (...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : 'default';
    await limiter.checkLimit(key);
    return fn(...args);
  }) as T;
}
