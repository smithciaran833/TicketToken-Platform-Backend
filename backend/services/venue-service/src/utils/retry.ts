import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 5000,
  factor: 2,
  shouldRetry: (error) => {
    // Handle null/undefined errors
    if (!error) {
      return false;
    }
    // Retry on network errors or 5xx status codes
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response?.status >= 500 && error.response?.status < 600) {
      return true;
    }
    // Don't retry on 4xx errors (client errors)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }
    return true;
  },
  onRetry: (error, attempt) => {
    logger.debug({ error: error?.message || error, attempt }, 'Retrying operation');
  }
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;
  
  for (let attempt = 1; attempt <= opts.maxAttempts!; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (!opts.shouldRetry!(error)) {
        throw error;
      }
      
      // Check if we've exhausted attempts
      if (attempt === opts.maxAttempts) {
        logger.error({
          error: error?.message || error,
          attempts: opts.maxAttempts
        }, 'Max retry attempts reached');
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay! * Math.pow(opts.factor!, attempt - 1),
        opts.maxDelay!
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * delay * 0.1;
      const totalDelay = delay + jitter;
      
      // Call retry callback
      if (opts.onRetry) {
        opts.onRetry(error, attempt);
      }
      
      logger.debug({
        attempt,
        nextAttempt: attempt + 1,
        delay: totalDelay,
        error: error?.message || String(error)
      }, 'Retrying after delay');
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
  
  throw lastError;
}

// Decorator for methods
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
        options
      );
    };
    
    return descriptor;
  };
}
