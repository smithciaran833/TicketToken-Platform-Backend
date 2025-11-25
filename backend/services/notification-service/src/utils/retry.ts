import { logger } from '../config/logger';

export interface RetryOptions {
  maxAttempts: number;        // Maximum number of retry attempts
  initialDelay: number;       // Initial delay in ms
  maxDelay: number;           // Maximum delay in ms
  backoffMultiplier: number;  // Multiplier for exponential backoff
  jitter: boolean;            // Add random jitter to prevent thundering herd
  retryableErrors?: string[]; // List of retryable error types
  onRetry?: (attempt: number, error: Error) => void; // Callback on retry
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Retry Utility with Exponential Backoff
 * 
 * Implements retry logic with:
 * - Exponential backoff
 * - Jitter to prevent thundering herd
 * - Configurable retry attempts
 * - Selective retry based on error type
 */
export class RetryUtil {
  /**
   * Execute a function with retry logic
   */
  static async execute<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryableError(error, opts.retryableErrors)) {
          logger.warn('Non-retryable error encountered', {
            error: lastError.message,
            attempt,
          });
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === opts.maxAttempts) {
          logger.error('All retry attempts exhausted', {
            maxAttempts: opts.maxAttempts,
            error: lastError.message,
          });
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(
          attempt,
          opts.initialDelay,
          opts.maxDelay,
          opts.backoffMultiplier,
          opts.jitter
        );

        logger.info('Retrying after error', {
          attempt,
          maxAttempts: opts.maxAttempts,
          delay,
          error: lastError.message,
        });

        // Call retry callback if provided
        if (opts.onRetry) {
          opts.onRetry(attempt, lastError);
        }

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError!;
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private static calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number,
    jitter: boolean
  ): number {
    // Calculate exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    let delay = initialDelay * Math.pow(multiplier, attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, maxDelay);

    // Add jitter (random value between 0% and 25% of delay)
    if (jitter) {
      const jitterAmount = delay * 0.25 * Math.random();
      delay += jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: any, retryableErrors?: string[]): boolean {
    // If no specific retryable errors defined, retry all errors
    if (!retryableErrors || retryableErrors.length === 0) {
      return this.isTransientError(error);
    }

    // Check if error message contains any retryable error pattern
    const errorMessage = error?.message || error?.toString() || '';
    return retryableErrors.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if an error is transient (likely to succeed on retry)
   */
  private static isTransientError(error: any): boolean {
    const errorMessage = (error?.message || error?.toString() || '').toLowerCase();
    const errorCode = error?.code || '';
    const statusCode = error?.statusCode || error?.status;

    // Network errors
    const networkErrors = [
      'econnreset',
      'econnrefused',
      'etimedout',
      'enotfound',
      'enetunreach',
      'socket hang up',
      'network error',
      'fetch failed',
    ];

    if (networkErrors.some(pattern => errorMessage.includes(pattern) || errorCode === pattern.toUpperCase())) {
      return true;
    }

    // HTTP 5xx errors (server errors)
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // HTTP 429 (rate limiting)
    if (statusCode === 429) {
      return true;
    }

    // HTTP 408 (request timeout)
    if (statusCode === 408) {
      return true;
    }

    // Database errors
    const dbErrors = [
      'lock timeout',
      'deadlock detected',
      'connection reset',
      'connection lost',
      'connection terminated',
    ];

    if (dbErrors.some(pattern => errorMessage.includes(pattern))) {
      return true;
    }

    // Default: don't retry
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry with circuit breaker integration
   */
  static async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitBreaker: any,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    return this.execute(
      () => circuitBreaker.execute(fn),
      options
    );
  }
}

/**
 * Decorator for automatic retry
 */
export function Retry(options: Partial<RetryOptions> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return RetryUtil.execute(
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * Retry-specific error types
 */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(attempts: number, lastError: Error) {
    super(`Max retries (${attempts}) exceeded. Last error: ${lastError.message}`);
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Helper function for simple retry scenarios
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  return RetryUtil.execute(fn, {
    maxAttempts,
    initialDelay: delayMs,
  });
}

export { RetryUtil as default };
