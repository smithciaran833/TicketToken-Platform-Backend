import logger from './logger';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: string
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const isRetryable = opts.retryableErrors?.some(errCode => 
        lastError?.message.includes(errCode) || 
        (lastError as any)?.code === errCode
      );

      if (attempt > opts.maxRetries || !isRetryable) {
        logger.error({
          error: lastError,
          attempt,
          context,
          retryable: isRetryable
        }, 'Max retries reached or non-retryable error');
        throw lastError;
      }

      // Wait before retrying
      logger.warn({
        attempt,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        context,
        error: lastError.message
      }, 'Retrying after error');

      await sleep(delay);
      
      // Exponential backoff
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeoutMs: options.resetTimeoutMs || 60000,
      halfOpenRequests: options.halfOpenRequests || 3
    };
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker OPEN${context ? ` for ${context}` : ''}`);
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info({ context }, 'Circuit breaker entering HALF_OPEN state');
    }

    try {
      const result = await fn();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(context);
      throw error;
    }
  }

  private onSuccess(context?: string): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenRequests) {
        this.state = CircuitState.CLOSED;
        logger.info({ context }, 'Circuit breaker CLOSED after successful requests');
      }
    }
  }

  private onFailure(context?: string): void {
    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
      logger.warn({ context, resetTimeoutMs: this.options.resetTimeoutMs }, 'Circuit breaker re-opened in HALF_OPEN state');
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
      logger.error({
        context,
        failureCount: this.failureCount,
        resetTimeoutMs: this.options.resetTimeoutMs
      }, 'Circuit breaker OPENED due to failures');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}
