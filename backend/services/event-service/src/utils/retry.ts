/**
 * Retry Utility with Exponential Backoff and Jitter
 * 
 * Provides resilient retry logic for network calls and operations
 * that may fail transiently.
 */

import { logger } from './logger';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Jitter factor 0-1 (default: 0.3) */
  jitterFactor?: number;
  /** Retry on specific error types only */
  retryOn?: (error: Error) => boolean;
  /** Function name for logging */
  operationName?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryOn' | 'operationName' | 'signal'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.3,
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
  jitter: boolean,
  jitterFactor: number
): number {
  // Exponential backoff: initialDelay * multiplier^attempt
  let delay = initialDelay * Math.pow(multiplier, attempt);
  
  // Apply max cap
  delay = Math.min(delay, maxDelay);
  
  // Add jitter to prevent thundering herd
  if (jitter) {
    const jitterRange = delay * jitterFactor;
    const jitterValue = Math.random() * jitterRange * 2 - jitterRange;
    delay = Math.max(0, delay + jitterValue);
  }
  
  return Math.round(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }
    
    const timeout = setTimeout(resolve, ms);
    
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Operation aborted'));
      }, { once: true });
    }
  });
}

/**
 * Default retry condition - retry on network errors and 5xx responses
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.name === 'AbortError' ||
      error.message?.includes('fetch failed')) {
    return true;
  }
  
  // HTTP 5xx errors (server errors)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // HTTP 429 Too Many Requests
  if (error.status === 429) {
    return true;
  }
  
  // Circuit breaker open
  if (error.message?.includes('circuit')) {
    return true;
  }
  
  return false;
}

/**
 * Execute a function with retry logic
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitter,
    jitterFactor,
  } = { ...DEFAULT_OPTIONS, ...options };
  
  const retryOn = options.retryOn || isRetryableError;
  const operationName = options.operationName || 'operation';
  const signal = options.signal;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check for abort before attempting
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }
      
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (attempt >= maxRetries) {
        logger.error({
          operationName,
          attempt,
          maxRetries,
          error: error.message,
        }, `${operationName} failed after ${maxRetries + 1} attempts`);
        throw error;
      }
      
      // Check if error is retryable
      if (!retryOn(error)) {
        logger.warn({
          operationName,
          attempt,
          error: error.message,
        }, `${operationName} failed with non-retryable error`);
        throw error;
      }
      
      // Calculate delay for next attempt
      const delay = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        jitter,
        jitterFactor
      );
      
      logger.warn({
        operationName,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delayMs: delay,
        error: error.message,
      }, `${operationName} failed, retrying in ${delay}ms`);
      
      // Wait before retry
      await sleep(delay, signal);
    }
  }
  
  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Retry failed');
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), options);
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
