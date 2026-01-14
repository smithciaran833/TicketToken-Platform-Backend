/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides configurable retry logic for handling transient failures
 * in service-to-service communication.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in ms between retries */
  initialDelay?: number;
  /** Maximum delay in ms between retries */
  maxDelay?: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd */
  jitter?: boolean;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: any, attempt: number) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: RetryOptions['onRetry'] } = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: defaultIsRetryable,
  onRetry: undefined,
};

/**
 * Default function to determine if an error is retryable
 */
function defaultIsRetryable(error: any): boolean {
  // Network errors are retryable
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'EAI_AGAIN') {
    return true;
  }

  // Timeout errors are retryable
  if (error.name === 'TimeoutError' || error.code === 'TIMEOUT') {
    return true;
  }

  // HTTP status codes
  const status = error.response?.status || error.status;
  if (status) {
    // Retry on server errors (5xx) except 501 (Not Implemented)
    if (status >= 500 && status !== 501) {
      return true;
    }
    // Retry on rate limiting
    if (status === 429) {
      return true;
    }
    // Don't retry client errors (4xx)
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  return false;
}

/**
 * Calculate delay for a given retry attempt with exponential backoff
 */
export function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Exponential backoff
  let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  
  // Cap at max delay
  delay = Math.min(delay, maxDelay);
  
  // Add jitter (±25% of delay)
  if (jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }
  
  return Math.floor(delay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * 
 * @param fn - Function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we have retries left
      if (attempt > opts.maxRetries) {
        break;
      }
      
      // Check if error is retryable
      if (!opts.isRetryable(error, attempt)) {
        break;
      }
      
      // Calculate delay
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitter
      );
      
      // Notify about retry
      if (opts.onRetry) {
        opts.onRetry(error, attempt, delay);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Retry decorator for class methods (TypeScript experimental decorators)
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };
    
    return descriptor;
  };
}

/**
 * Pre-configured retry options for different scenarios
 */
export const RetryPresets = {
  /** Fast retries for low-latency operations */
  fast: {
    maxRetries: 2,
    initialDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,

  /** Standard retries for most operations */
  standard: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,

  /** Aggressive retries for critical operations */
  aggressive: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,

  /** Patient retries for external services */
  patient: {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
    jitter: true,
  } as RetryOptions,

  /** No retries - just execute once */
  none: {
    maxRetries: 0,
  } as RetryOptions,
};

/**
 * Retry context for tracking retry state
 */
export class RetryContext {
  private attempts: Array<{
    timestamp: number;
    error?: any;
    success: boolean;
    duration: number;
  }> = [];

  constructor(private readonly maxRetries: number = 3) {}

  recordAttempt(success: boolean, duration: number, error?: any): void {
    this.attempts.push({
      timestamp: Date.now(),
      error,
      success,
      duration,
    });
  }

  getAttemptCount(): number {
    return this.attempts.length;
  }

  hasRetriesRemaining(): boolean {
    return this.attempts.length <= this.maxRetries;
  }

  getLastError(): any | undefined {
    const failedAttempts = this.attempts.filter(a => !a.success);
    return failedAttempts[failedAttempts.length - 1]?.error;
  }

  getTotalDuration(): number {
    return this.attempts.reduce((sum, a) => sum + a.duration, 0);
  }

  toJSON() {
    return {
      attempts: this.attempts.length,
      maxRetries: this.maxRetries,
      successful: this.attempts.some(a => a.success),
      totalDuration: this.getTotalDuration(),
    };
  }
}
