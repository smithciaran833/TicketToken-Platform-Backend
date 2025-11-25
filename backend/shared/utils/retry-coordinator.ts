import { logger } from './logger';
import Redis from 'ioredis';

/**
 * Coordinates retries across multiple service instances to prevent retry storms
 */
export class RetryCoordinator {
  private redis: Redis;
  private serviceName: string;
  private log: any;

  constructor(redisUrl: string, serviceName: string) {
    this.redis = new Redis(redisUrl);
    this.serviceName = serviceName;
    this.log = logger.child({ component: 'RetryCoordinator', service: serviceName });
  }

  /**
   * Calculate exponential backoff with jitter
   */
  calculateBackoff(
    attempt: number,
    baseDelay: number = 1000,
    maxDelay: number = 60000,
    jitterFactor: number = 0.3
  ): number {
    // Exponential backoff: delay = min(baseDelay * 2^attempt, maxDelay)
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * jitterFactor * exponentialDelay;
    const finalDelay = exponentialDelay + jitter;

    // Add additional randomization to spread retries
    const spread = Math.random() * 1000; // 0-1 second additional spread

    return Math.floor(finalDelay + spread);
  }

  /**
   * Check if we should retry based on global rate limiting
   */
  async shouldRetry(
    operation: string,
    resourceId: string,
    maxRetriesPerWindow: number = 10,
    windowSizeMs: number = 60000
  ): Promise<boolean> {
    const key = `retry:${this.serviceName}:${operation}:${resourceId}`;
    const now = Date.now();
    const windowStart = now - windowSizeMs;

    try {
      // Use Redis sorted set to track retry attempts
      // Remove old entries outside the window
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Count retries in current window
      const count = await this.redis.zcard(key);

      if (count >= maxRetriesPerWindow) {
        this.log.warn('Retry limit reached', {
          operation,
          resourceId,
          count,
          maxRetriesPerWindow,
        });
        return false;
      }

      // Add this retry attempt
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiry on the key
      await this.redis.expire(key, Math.ceil(windowSizeMs / 1000));

      return true;
    } catch (error) {
      this.log.error('Failed to check retry limit', { error });
      // On Redis error, allow retry but log it
      return true;
    }
  }

  /**
   * Implement circuit breaker for a resource
   */
  async checkCircuitBreaker(
    resourceId: string,
    failureThreshold: number = 5,
    resetTimeMs: number = 60000
  ): Promise<'CLOSED' | 'OPEN' | 'HALF_OPEN'> {
    const failureKey = `circuit:${this.serviceName}:${resourceId}:failures`;
    const stateKey = `circuit:${this.serviceName}:${resourceId}:state`;
    const lastFailureKey = `circuit:${this.serviceName}:${resourceId}:last_failure`;

    try {
      const state = (await this.redis.get(stateKey)) as 'CLOSED' | 'OPEN' | 'HALF_OPEN' | null;

      if (state === 'OPEN') {
        const lastFailure = await this.redis.get(lastFailureKey);
        if (lastFailure && Date.now() - parseInt(lastFailure) > resetTimeMs) {
          // Move to HALF_OPEN state
          await this.redis.set(stateKey, 'HALF_OPEN', 'PX', resetTimeMs);
          return 'HALF_OPEN';
        }
        return 'OPEN';
      }

      return state || 'CLOSED';
    } catch (error) {
      this.log.error('Failed to check circuit breaker', { error });
      return 'CLOSED';
    }
  }

  async recordSuccess(resourceId: string): Promise<void> {
    const failureKey = `circuit:${this.serviceName}:${resourceId}:failures`;
    const stateKey = `circuit:${this.serviceName}:${resourceId}:state`;

    try {
      await this.redis.del(failureKey);
      await this.redis.del(stateKey);
    } catch (error) {
      this.log.error('Failed to record success', { error });
    }
  }

  async recordFailure(resourceId: string, failureThreshold: number = 5): Promise<void> {
    const failureKey = `circuit:${this.serviceName}:${resourceId}:failures`;
    const stateKey = `circuit:${this.serviceName}:${resourceId}:state`;
    const lastFailureKey = `circuit:${this.serviceName}:${resourceId}:last_failure`;

    try {
      const failures = await this.redis.incr(failureKey);
      await this.redis.expire(failureKey, 300); // Reset after 5 minutes
      await this.redis.set(lastFailureKey, Date.now());

      if (failures >= failureThreshold) {
        await this.redis.set(stateKey, 'OPEN', 'PX', 60000);
        this.log.warn('Circuit breaker opened', { resourceId, failures });
      }
    } catch (error) {
      this.log.error('Failed to record failure', { error });
    }
  }

  /**
   * Coordinate bulk retries to prevent storms
   */
  async coordinateBulkRetry(
    items: any[],
    processor: (item: any) => Promise<void>,
    options: {
      maxConcurrency?: number;
      batchSize?: number;
      delayBetweenBatches?: number;
      maxRetries?: number;
    } = {}
  ): Promise<{ successful: number; failed: any[] }> {
    const {
      maxConcurrency = 5,
      batchSize = 10,
      delayBetweenBatches = 1000,
      maxRetries = 3,
    } = options;

    const successful: number[] = [];
    const failed: any[] = [];

    // Process in batches with delays
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // Add jitter to batch start time
      const batchJitter = Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, batchJitter));

      // Process batch with limited concurrency
      const promises = batch.map(async (item, index) => {
        // Add individual item jitter
        const itemDelay = this.calculateBackoff(0, 100, 1000, 0.5);
        await new Promise((resolve) => setTimeout(resolve, itemDelay));

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            await processor(item);
            successful.push(i + index);
            return;
          } catch (error) {
            if (attempt === maxRetries - 1) {
              failed.push({ item, error });
            } else {
              const retryDelay = this.calculateBackoff(attempt);
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          }
        }
      });

      // Wait for batch to complete
      await Promise.allSettled(promises);

      // Delay before next batch
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return { successful: successful.length, failed };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Retry configuration with jitter
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitterFactor: 0.3,
  backoffMultiplier: 2,
};

/**
 * Execute function with coordinated retry
 */
export async function retryWithCoordination<T>(
  coordinator: RetryCoordinator,
  operation: string,
  resourceId: string,
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;

  for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
    // Check circuit breaker
    const circuitState = await coordinator.checkCircuitBreaker(resourceId);
    if (circuitState === 'OPEN') {
      throw new Error(`Circuit breaker open for ${resourceId}`);
    }

    // Check if we should retry
    if (attempt > 0) {
      const shouldRetry = await coordinator.shouldRetry(operation, resourceId);
      if (!shouldRetry) {
        throw new Error(`Retry limit exceeded for ${operation}:${resourceId}`);
      }

      // Calculate delay with jitter
      const delay = coordinator.calculateBackoff(
        attempt - 1,
        finalConfig.baseDelay,
        finalConfig.maxDelay,
        finalConfig.jitterFactor
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const result = await fn();

      // Record success
      if (circuitState === 'HALF_OPEN') {
        await coordinator.recordSuccess(resourceId);
      }

      return result;
    } catch (error) {
      lastError = error;
      await coordinator.recordFailure(resourceId);

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function isNonRetryableError(error: any): boolean {
  // Don't retry on validation errors, auth errors, etc.
  const nonRetryableStatuses = [400, 401, 403, 404, 422];
  if (error.response?.status && nonRetryableStatuses.includes(error.response.status)) {
    return true;
  }

  // Don't retry on specific error messages
  const nonRetryableMessages = [
    'Invalid credentials',
    'Unauthorized',
    'Forbidden',
    'Not found',
    'Validation error',
  ];

  if (error.message && nonRetryableMessages.some((msg) => error.message.includes(msg))) {
    return true;
  }

  return false;
}
