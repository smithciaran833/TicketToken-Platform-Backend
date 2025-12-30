import CircuitBreaker from 'opossum';
import { logger } from './logger';

interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const breakers: Map<string, CircuitBreaker<any[], any>> = new Map();

export function getCircuitBreaker<T>(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => Promise<T>,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<any[], T> {
  if (breakers.has(name)) {
    return breakers.get(name)!;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    volumeThreshold: opts.volumeThreshold,
    name,
  });

  breaker.on('open', () => {
    logger.warn(`Circuit breaker ${name} opened`, { circuitBreaker: name, state: 'open' });
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker ${name} half-open`, { circuitBreaker: name, state: 'halfOpen' });
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker ${name} closed`, { circuitBreaker: name, state: 'closed' });
  });

  breaker.on('fallback', (result) => {
    logger.info(`Circuit breaker ${name} fallback executed`, { circuitBreaker: name, result });
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker ${name} timeout`, { circuitBreaker: name });
  });

  breaker.on('reject', () => {
    logger.warn(`Circuit breaker ${name} rejected request`, { circuitBreaker: name });
  });

  breaker.on('failure', (error) => {
    logger.error(`Circuit breaker ${name} recorded failure`, { circuitBreaker: name, error });
  });

  breakers.set(name, breaker);
  return breaker;
}

export function withCircuitBreaker<T>(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallback?: (...args: any[]) => T,
  options: CircuitBreakerOptions = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (...args: any[]) => Promise<T> {
  const breaker = getCircuitBreaker(name, fn, options);

  if (fallback) {
    breaker.fallback(fallback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (...args: any[]): Promise<T> => breaker.fire(...args);
}

export function getCircuitBreakerStats(name: string): object | null {
  const breaker = breakers.get(name);
  if (!breaker) return null;

  return {
    name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'halfOpen' : 'closed',
    stats: breaker.stats,
  };
}

export function getAllCircuitBreakerStats(): object[] {
  return Array.from(breakers.entries()).map(([name, breaker]) => ({
    name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'halfOpen' : 'closed',
    stats: breaker.stats,
  }));
}

export function resetCircuitBreaker(name: string): boolean {
  const breaker = breakers.get(name);
  if (!breaker) return false;

  breaker.close();
  return true;
}
