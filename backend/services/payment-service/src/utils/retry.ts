/**
 * Retry Utility with Exponential Backoff
 * Handles transient failures in external service calls
 */

import { SafeLogger } from './pci-log-scrubber.util';

const logger = new SafeLogger('RetryUtil');

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[]; // Error messages that should trigger retry
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 1) {
        logger.info('Retry succeeded', { attempt });
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (opts.retryableErrors && opts.retryableErrors.length > 0) {
        const isRetryable = opts.retryableErrors.some((msg) =>
          lastError.message.includes(msg)
        );
        
        if (!isRetryable) {
          logger.warn('Non-retryable error encountered', {
            error: lastError.message,
            attempt,
          });
          throw lastError;
        }
      }

      // If this is the last attempt, throw the error
      if (attempt === opts.maxAttempts) {
        logger.error('All retry attempts exhausted', {
          maxAttempts: opts.maxAttempts,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      logger.warn('Retry attempt failed, waiting before retry', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: lastError.message,
      });

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry decorator for class methods
 */
export function Retry(options: Partial<RetryOptions> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

/**
 * Retry with jitter to prevent thundering herd
 */
export async function withRetryJitter<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 1) {
        logger.info('Retry with jitter succeeded', { attempt });
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) {
        logger.error('All retry attempts with jitter exhausted', {
          maxAttempts: opts.maxAttempts,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      
      // Add random jitter (±25%)
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(0, baseDelay + jitter);

      logger.warn('Retry with jitter attempt failed, waiting before retry', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: Math.round(delay),
        error: lastError.message,
      });

      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry only for specific error types
 */
export async function retryOnSpecificErrors<T>(
  fn: () => Promise<T>,
  errorTypes: (new (...args: any[]) => Error)[],
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error type is in the retryable list
      const isRetryable = errorTypes.some(
        (ErrorType) => lastError instanceof ErrorType
      );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw lastError;
      }

      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      logger.warn('Retrying on specific error type', {
        attempt,
        errorType: lastError.constructor.name,
        delayMs: delay,
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Batch retry - retry a batch of operations with intelligent error handling
 */
export async function retryBatch<T>(
  operations: (() => Promise<T>)[],
  options: Partial<RetryOptions> = {}
): Promise<{ successes: T[]; failures: Error[] }> {
  const results = await Promise.allSettled(
    operations.map((op) => withRetry(op, options))
  );

  const successes: T[] = [];
  const failures: Error[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      failures.push(result.reason);
      logger.error('Batch operation failed after retries', {
        index,
        error: result.reason.message,
      });
    }
  });

  logger.info('Batch retry completed', {
    total: operations.length,
    successes: successes.length,
    failures: failures.length,
  });

  return { successes, failures };
}
