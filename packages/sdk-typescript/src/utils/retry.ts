export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
    onRetry,
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error, retryableStatusCodes);
      
      if (!isRetryable || attempt === maxRetries) {
        throw new RetryError(
          `Failed after ${attempt + 1} attempts`,
          attempt + 1,
          lastError
        );
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );
      
      // Add jitter (±25%)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      const delayWithJitter = Math.max(0, delay + jitter);
     
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }
      
      await sleep(delayWithJitter);
    }
  }
  
  throw new RetryError(
    `Failed after ${maxRetries + 1} attempts`,
    maxRetries + 1,
    lastError!
  );
}

function isRetryableError(error: any, retryableStatusCodes: number[]): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  
  // HTTP status codes
  if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }
  
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
