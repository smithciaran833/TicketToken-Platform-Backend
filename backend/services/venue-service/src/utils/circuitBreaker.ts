import CircuitBreaker from 'opossum';
import { logger } from './logger';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 3000, // 3 seconds
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 10000, // Count errors over 10 seconds
  rollingCountBuckets: 10, // Number of buckets in rolling window
};

export function createCircuitBreaker<T extends (...args: any[]) => any>(
  fn: T,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const opts = { ...defaultOptions, ...options };
  
  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    rollingCountTimeout: opts.rollingCountTimeout,
    rollingCountBuckets: opts.rollingCountBuckets,
    name: opts.name,
  });

  // Log circuit breaker events
  breaker.on('open', () => {
    logger.warn(`Circuit breaker opened: ${opts.name || 'unnamed'}`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker half-open: ${opts.name || 'unnamed'}`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker closed: ${opts.name || 'unnamed'}`);
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker timeout: ${opts.name || 'unnamed'}`);
  });

  return breaker;
}

// Helper function to wrap async functions with circuit breaker
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): T {
  const breaker = createCircuitBreaker(fn, options);
  return ((...args: Parameters<T>) => breaker.fire(...args)) as T;
}
