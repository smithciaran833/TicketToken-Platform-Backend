import CircuitBreaker from 'opossum';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { CircuitBreakerState } from '../types';

const logger = createLogger('circuit-breaker-service');

export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeBreakers();
  }

  private initializeBreakers() {
    // Create circuit breakers for each service
    const services = Object.keys(config.services);
    
    for (const service of services) {
      const breaker = this.createBreaker(service);
      this.breakers.set(service, breaker);
    }
  }

  private createBreaker(name: string): CircuitBreaker {
    const options = {
      timeout: config.circuitBreaker.timeout,
      errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
      resetTimeout: config.circuitBreaker.resetTimeout,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name,
      volumeThreshold: config.circuitBreaker.volumeThreshold,
    };

    const breaker = new CircuitBreaker(async (fn: Function) => fn(), options);

    // Set up event handlers
    this.setupBreakerEvents(breaker, name);

    return breaker;
  }

  private setupBreakerEvents(breaker: CircuitBreaker, name: string) {
    breaker.on('open', () => {
      logger.error({ service: name }, `Circuit breaker OPENED for ${name}`);
    });

    breaker.on('halfOpen', () => {
      logger.info({ service: name }, `Circuit breaker HALF-OPEN for ${name}`);
    });

    breaker.on('close', () => {
      logger.info({ service: name }, `Circuit breaker CLOSED for ${name}`);
    });

    breaker.on('failure', (error) => {
      logger.warn({ service: name, error: (error as any).message }, `Circuit breaker failure for ${name}`);
    });

    breaker.on('timeout', () => {
      logger.warn({ service: name }, `Circuit breaker timeout for ${name}`);
    });

    breaker.on('reject', () => {
      logger.error({ service: name }, `Circuit breaker rejected request for ${name}`);
    });

    breaker.on('success', (elapsed) => {
      logger.debug({ service: name, elapsed }, `Circuit breaker success for ${name}`);
    });
  }

  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      logger.warn({ service: name }, "No circuit breaker found, executing directly");
      return fn();
    }
    
    if (fallback) {
      breaker.fallback(fallback);
    }
    
    return breaker.fire(fn) as Promise<T>;
  }

  getState(name: string): CircuitBreakerState {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      return 'CLOSED';
    }

    if (breaker.opened) {
      return 'OPEN';
    }

    if (breaker.pendingClose) {
      return 'HALF_OPEN';
    }

    return 'CLOSED';
  }

  getStats(name: string) {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      return null;
    }

    return breaker.stats;
  }

  getAllStats() {
    const stats: Record<string, any> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = {
        state: this.getState(name),
        stats: breaker.stats,
      };
    }

    return stats;
  }
}
