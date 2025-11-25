/**
 * Retry Utility
 * 
 * Provides flexible retry logic with exponential backoff, jitter,
 * and configurable retry conditions for transient failures
 */

import { logger } from './logger';

export interface RetryConfig {
  maxAttempts: number;           // Maximum number of retry attempts
  initialDelay: number;          // Initial delay in ms (default: 1000)
  maxDelay: number;              // Maximum delay in ms (default: 30000)
  backoffFactor: number;         // Multiplier for exponential backoff (default: 2)
  jitter: boolean;               // Add randomness to prevent thundering herd (default: true)
  retryableErrors?: (error: any) => boolean; // Function to determine if error is retryable
  onRetry?: (error: any, attempt: number) => void; // Callback on retry
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Default retryable error checker
 * Returns true for common transient errors
 */
export function defaultRetryableErrors(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET') {
    return true;
  }

  // HTTP status codes that are retryable
  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
  if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  // Check if error message indicates transient failure
  const transientMessages = [
    'timeout',
    'timed out',
    'connection refused',
    'network error',
    'temporary failure',
    'service unavailable',
  ];

  const errorMessage = (error.message || '').toLowerCase();
  return transientMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffFactor, attempt - 1);
  let delay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter to prevent thundering herd
  if (config.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig: RetryConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    retryableErrors: config.retryableErrors || defaultRetryableErrors,
  };

  let lastError: any;
  
  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = finalConfig.retryableErrors!(error);
      
      // Don't retry if this is the last attempt or error is not retryable
      if (attempt >= finalConfig.maxAttempts || !isRetryable) {
        logger.error('Retry failed permanently', {
          attempt,
          maxAttempts: finalConfig.maxAttempts,
          isRetryable,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }

      // Calculate delay before next retry
      const delay = calculateDelay(attempt, finalConfig);

      logger.warn('Retrying after failure', {
        attempt,
        maxAttempts: finalConfig.maxAttempts,
        delay,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Call onRetry callback if provided
      if (finalConfig.onRetry) {
        try {
          finalConfig.onRetry(error, attempt);
        } catch (callbackError) {
          logger.error('Error in retry callback', { callbackError });
        }
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never happen, but TypeScript needs it
  throw lastError;
}

/**
 * Retry decorator for async functions
 * Usage: const result = await retryable(myFunction, config)();
 */
export function retryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: any[]) => {
    return retry(() => fn(...args), config);
  }) as T;
}

/**
 * Create a retry wrapper for a specific operation
 */
export class RetryWrapper {
  constructor(private config: Partial<RetryConfig> = {}) {}

  /**
   * Execute function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return retry(fn, this.config);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Specific retry configurations for common scenarios
 */
export const RetryPresets = {
  /**
   * Quick retry for fast operations
   */
  QUICK: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffFactor: 2,
    jitter: true,
  } as Partial<RetryConfig>,

  /**
   * Standard retry for most operations
   */
  STANDARD: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    jitter: true,
  } as Partial<RetryConfig>,

  /**
   * Aggressive retry for critical operations
   */
  AGGRESSIVE: {
    maxAttempts: 10,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffFactor: 2,
    jitter: true,
  } as Partial<RetryConfig>,

  /**
   * Gentle retry for rate-limited APIs
   */
  RATE_LIMITED: {
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 120000,
    backoffFactor: 2,
    jitter: true,
  } as Partial<RetryConfig>,
};
