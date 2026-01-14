/**
 * Retry Utility with Exponential Backoff and Jitter
 * 
 * AUDIT FIX: EXT-3 - Missing retry on marketplace API
 * AUDIT FIX: EXT-4 - No rate limit handling for RPC
 * 
 * Provides robust retry logic with:
 * - Exponential backoff
 * - Jitter to prevent thundering herd
 * - Rate limit detection and handling
 * - Circuit breaker integration
 */

import logger from './logger';

// =============================================================================
// TYPES
// =============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds */
  maxDelayMs?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Add jitter to delay (±percentage) */
  jitterPercent?: number;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Function to determine if rate limited */
  isRateLimited?: (error: Error) => boolean;
  /** Extract retry-after header value */
  getRetryAfter?: (error: Error) => number | null;
  /** Callback on retry */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  /** Operation name for logging */
  operationName?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 20,
  shouldRetry: defaultShouldRetry,
  isRateLimited: defaultIsRateLimited,
  getRetryAfter: defaultGetRetryAfter,
  onRetry: defaultOnRetry,
  operationName: 'operation'
};

// =============================================================================
// RETRY FUNCTIONS
// =============================================================================

/**
 * Execute a function with retry logic
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry
      if (attempt >= opts.maxRetries || !opts.shouldRetry(lastError, attempt)) {
        throw lastError;
      }
      
      // Calculate delay
      let delayMs: number;
      
      // Check for rate limiting
      if (opts.isRateLimited(lastError)) {
        const retryAfter = opts.getRetryAfter(lastError);
        if (retryAfter !== null) {
          delayMs = retryAfter * 1000; // Convert to ms
        } else {
          delayMs = calculateBackoff(attempt, opts);
        }
      } else {
        delayMs = calculateBackoff(attempt, opts);
      }
      
      // Add jitter
      delayMs = addJitter(delayMs, opts.jitterPercent);
      
      // Cap at max delay
      delayMs = Math.min(delayMs, opts.maxDelayMs);
      
      // Call retry callback
      opts.onRetry(lastError, attempt + 1, delayMs);
      
      // Wait before retry
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

/**
 * Execute a function with retry logic and return detailed result
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;
  
  try {
    const result = await retry(async () => {
      attempts++;
      return fn();
    }, options);
    
    return {
      success: true,
      result,
      attempts,
      totalTimeMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
      attempts,
      totalTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Create a retryable version of a function
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retry(() => fn(...args), options);
  }) as T;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, opts: Required<RetryOptions>): number {
  return opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
}

/**
 * Add jitter to delay
 */
function addJitter(delayMs: number, jitterPercent: number): number {
  const jitterFactor = jitterPercent / 100;
  const jitter = delayMs * jitterFactor * (Math.random() * 2 - 1);
  return Math.round(delayMs + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Default shouldRetry implementation
 */
function defaultShouldRetry(error: Error, attempt: number): boolean {
  // Retry on network errors
  if (error.message.includes('ECONNREFUSED') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('socket hang up')) {
    return true;
  }
  
  // Retry on 5xx errors
  if ('status' in error || 'statusCode' in error) {
    const status = (error as any).status || (error as any).statusCode;
    if (status >= 500 && status < 600) {
      return true;
    }
    // Retry on rate limit
    if (status === 429) {
      return true;
    }
  }
  
  // Check for rate limit in message
  if (error.message.toLowerCase().includes('rate limit')) {
    return true;
  }
  
  // Don't retry other errors by default
  return false;
}

/**
 * Default isRateLimited implementation
 */
function defaultIsRateLimited(error: Error): boolean {
  if ('status' in error || 'statusCode' in error) {
    const status = (error as any).status || (error as any).statusCode;
    if (status === 429) {
      return true;
    }
  }
  return error.message.toLowerCase().includes('rate limit');
}

/**
 * Default getRetryAfter implementation
 */
function defaultGetRetryAfter(error: Error): number | null {
  if ('headers' in error) {
    const headers = (error as any).headers;
    if (headers && headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after'], 10);
      if (!isNaN(retryAfter)) {
        return retryAfter;
      }
    }
  }
  return null;
}

/**
 * Default onRetry callback
 */
function defaultOnRetry(error: Error, attempt: number, delayMs: number): void {
  logger.warn({
    error: error.message,
    attempt,
    delayMs
  }, 'Retrying operation');
}

// =============================================================================
// PRE-CONFIGURED RETRY FUNCTIONS
// =============================================================================

/**
 * Retry configuration for Solana RPC calls
 * AUDIT FIX: EXT-4 - Rate limit handling for RPC
 */
export const solanaRpcRetry = <T>(fn: () => Promise<T>) => retry(fn, {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterPercent: 20,
  operationName: 'solana-rpc',
  shouldRetry: (error) => {
    // Retry on RPC-specific errors
    if (error.message.includes('Too many requests') ||
        error.message.includes('429') ||
        error.message.includes('503') ||
        error.message.includes('timeout')) {
      return true;
    }
    return defaultShouldRetry(error, 0);
  }
});

/**
 * Retry configuration for marketplace API calls
 * AUDIT FIX: EXT-3 - Missing retry on marketplace API
 */
export const marketplaceApiRetry = <T>(fn: () => Promise<T>) => retry(fn, {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterPercent: 25,
  operationName: 'marketplace-api'
});

/**
 * Retry configuration for database operations
 */
export const databaseRetry = <T>(fn: () => Promise<T>) => retry(fn, {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterPercent: 10,
  operationName: 'database',
  shouldRetry: (error) => {
    // Retry on connection errors
    if (error.message.includes('connection') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('deadlock')) {
      return true;
    }
    return false;
  }
});

/**
 * Retry configuration for external HTTP calls
 */
export const httpRetry = <T>(fn: () => Promise<T>) => retry(fn, {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  backoffMultiplier: 2,
  jitterPercent: 20,
  operationName: 'http'
});
