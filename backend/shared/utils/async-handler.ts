import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger';

/**
 * Wraps async route handlers to catch promise rejections
 */
export function asyncHandler(fn: Function) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await fn(request, reply);
    } catch (error) {
      throw error; // Fastify handles errors automatically
    }
  };
}

/**
 * Wraps async functions with error handling and retry logic
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    onError?: (error: any, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2, onError } = options;

  return new Promise(async (resolve, reject) => {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        return resolve(result);
      } catch (error) {
        lastError = error;

        if (onError) {
          onError(error, attempt);
        }

        if (attempt < maxAttempts) {
          const waitTime = delay * Math.pow(backoff, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    reject(lastError);
  });
}

/**
 * Creates a timeout promise that rejects after specified time
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Safely executes an async function and returns result or default value
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  logError = true
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (logError) {
      logger.error('Safe async operation failed', { error });
    }
    return defaultValue;
  }
}

/**
 * Process items in batches with proper error handling
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    continueOnError?: boolean;
    onError?: (error: any, item: T) => void;
  } = {}
): Promise<{ results: R[]; errors: Array<{ item: T; error: any }> }> {
  const { batchSize = 10, continueOnError = false, onError } = options;

  const results: R[] = [];
  const errors: Array<{ item: T; error: any }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchPromises = batch.map(async (item) => {
      try {
        const result = await processor(item);
        results.push(result);
        return { success: true, result };
      } catch (error) {
        errors.push({ item, error });

        if (onError) {
          onError(error, item);
        }

        if (!continueOnError) {
          throw error;
        }

        return { success: false, error };
      }
    });

    await Promise.allSettled(batchPromises);
  }

  return { results, errors };
}

/**
 * Circuit breaker pattern for external service calls
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000, // 1 minute
    private readonly resetTimeout = 30000 // 30 seconds
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await withTimeout(fn(), this.timeout);

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Handles uncaught promise rejections globally
 */
export function setupGlobalErrorHandlers() {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
    });

    // In production, you might want to exit after logging
    if (process.env.NODE_ENV === 'production') {
      // Give time to flush logs
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
    });

    // Exit immediately for uncaught exceptions
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}
