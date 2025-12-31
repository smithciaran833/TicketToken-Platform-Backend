import { logger } from './logger';

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
  retryOn?: (error: any) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
  timeout: 30000,
  retryOn: (error) => {
    // Retry on network errors and 5xx responses
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response?.status >= 500) {
      return true;
    }
    return false;
  },
};

/**
 * Execute a function with exponential backoff retry
 * DS5/DS6: Retry with exponential backoff for external calls
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await withTimeout(fn(), opts.timeout);
      return result;
    } catch (error: any) {
      lastError = error;

      if (attempt === opts.maxRetries || !opts.retryOn(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelay
      );

      logger.warn('Retrying after error', {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delay,
        error: error.message,
        code: error.code,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
