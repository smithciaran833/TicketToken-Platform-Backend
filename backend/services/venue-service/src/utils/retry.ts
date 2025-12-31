import { logger } from './logger';

const log = logger.child({ component: 'RetryUtil' });

/**
 * SECURITY FIX (RL1-RL3): Retry wrapper with exponential backoff and jitter
 * 
 * Provides:
 * - Configurable retry attempts
 * - Exponential backoff
 * - Jitter to prevent thundering herd
 * - Specific error type filtering
 * - Circuit breaker integration
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitterFactor?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: any) => boolean;
  /** Callback called before each retry */
  onRetry?: (error: any, attempt: number, delay: number) => void;
  /** Operation name for logging */
  operationName?: string;
}

/**
 * Default retryable error check
 * Retries on network errors, timeouts, and 5xx server errors
 */
function defaultIsRetryable(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    return true;
  }
  
  // Timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return true;
  }
  
  // HTTP 5xx errors
  const status = error.status || error.statusCode || error.response?.status;
  if (status && status >= 500 && status < 600) {
    return true;
  }
  
  // HTTP 429 Too Many Requests
  if (status === 429) {
    return true;
  }
  
  // PostgreSQL serialization/deadlock errors
  if (error.code === '40001' || error.code === '40P01') {
    return true;
  }
  
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitterFactor: number
): number {
  // Exponential backoff
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter (randomness to prevent thundering herd)
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
  
  return Math.round(cappedDelay + jitter);
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitterFactor = 0.1,
    isRetryable = defaultIsRetryable,
    onRetry,
    operationName = 'operation',
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt > maxRetries) {
        log.error({
          operationName,
          attempt,
          maxRetries,
          error: error.message,
        }, 'Max retries exceeded');
        throw error;
      }

      // Check if error is retryable
      if (!isRetryable(error)) {
        log.warn({
          operationName,
          attempt,
          error: error.message,
          retryable: false,
        }, 'Non-retryable error encountered');
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(
        attempt,
        initialDelay,
        maxDelay,
        backoffMultiplier,
        jitterFactor
      );

      log.warn({
        operationName,
        attempt,
        maxRetries,
        delay,
        error: error.message,
      }, 'Retrying after error');

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultOptions: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(() => fn(...args), defaultOptions);
  }) as T;
}

/**
 * Retry decorator for class methods
 */
export function Retry(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        { ...options, operationName: options.operationName || propertyKey }
      );
    };

    return descriptor;
  };
}

/**
 * HTTP-specific retry options
 */
export const httpRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  isRetryable: (error: any) => {
    // Retry on network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    // Retry on 5xx and 429
    const status = error.response?.status || error.status;
    return status === 429 || (status >= 500 && status < 600);
  },
};

/**
 * Database-specific retry options
 */
export const dbRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  isRetryable: (error: any) => {
    // PostgreSQL serialization errors
    return error.code === '40001' || error.code === '40P01' || 
           error.code === 'ECONNREFUSED';
  },
};

/**
 * External service retry options
 */
export const externalServiceRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};
