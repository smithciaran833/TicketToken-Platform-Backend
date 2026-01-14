import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  name: string;
  // HIGH: Fallback function to call when circuit is open
  fallback?: (...args: any[]) => any;
  // LOW: Enable metrics collection
  enableMetrics?: boolean;
}

// LOW: Circuit breaker metrics interface
export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  fallbackCount: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  lastStateChange?: Date;
  openCount: number; // Number of times circuit opened
  halfOpenCount: number; // Number of times entered half-open
}

// LOW: Global metrics registry
const metricsRegistry: Map<string, CircuitBreakerMetrics> = new Map();

/**
 * LOW: Get all circuit breaker metrics
 */
export function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
  return Array.from(metricsRegistry.values());
}

/**
 * LOW: Get metrics for a specific circuit breaker
 */
export function getCircuitBreakerMetrics(name: string): CircuitBreakerMetrics | undefined {
  return metricsRegistry.get(name);
}

/**
 * LOW: Reset metrics for a specific circuit breaker
 */
export function resetCircuitBreakerMetrics(name: string): void {
  const existing = metricsRegistry.get(name);
  if (existing) {
    metricsRegistry.set(name, {
      name,
      state: existing.state,
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      fallbackCount: 0,
      openCount: 0,
      halfOpenCount: 0,
    });
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt: number = Date.now();
  private readonly options: CircuitBreakerOptions;
  private metrics: CircuitBreakerMetrics;

  constructor(
    private readonly name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = {
      name: options.name || name,
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      resetTimeout: options.resetTimeout || 30000,
      fallback: options.fallback,
      enableMetrics: options.enableMetrics ?? true,
    };

    // LOW: Initialize metrics
    this.metrics = {
      name: this.name,
      state: CircuitState.CLOSED,
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      fallbackCount: 0,
      openCount: 0,
      halfOpenCount: 0,
    };

    if (this.options.enableMetrics) {
      metricsRegistry.set(this.name, this.metrics);
    }
  }

  /**
   * HIGH: Execute operation with circuit breaker and fallback support
   */
  async execute<T>(operation: () => Promise<T>, ...args: any[]): Promise<T> {
    // LOW: Track total requests
    this.metrics.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        // HIGH: Use fallback if provided when circuit is open
        if (this.options.fallback) {
          this.metrics.fallbackCount++;
          logger.warn(`Circuit breaker ${this.name} is OPEN - using fallback`, {
            name: this.name,
            nextAttempt: new Date(this.nextAttempt).toISOString(),
            metrics: this.getMetricsSummary(),
          });
          return this.options.fallback(...args);
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Try half-open
      this.transitionTo(CircuitState.HALF_OPEN);
      logger.info(`Circuit breaker ${this.name} entering HALF_OPEN state`);
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      // LOW: Track timeout vs other failures
      if ((error as Error).message === 'Operation timeout') {
        this.metrics.timeoutCount++;
      }
      this.onFailure();
      // HIGH: Use fallback on error if provided
      if (this.options.fallback) {
        this.metrics.fallbackCount++;
        logger.warn(`Circuit breaker ${this.name} operation failed - using fallback`, {
          name: this.name,
          error: (error as Error).message,
          metrics: this.getMetricsSummary(),
        });
        return this.options.fallback(...args);
      }
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), this.options.timeout)
      ),
    ]);
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.metrics.successCount++;
    this.metrics.lastSuccess = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.successCount = 0;
        this.transitionTo(CircuitState.CLOSED);
        logger.info(`Circuit breaker ${this.name} closed after successful attempts`, {
          metrics: this.getMetricsSummary(),
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;
    this.metrics.failureCount++;
    this.metrics.lastFailure = new Date();

    if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      logger.error(`Circuit breaker ${this.name} opened after ${this.failureCount} failures`, {
        metrics: this.getMetricsSummary(),
      });
    }
  }

  /**
   * LOW: Track state transitions for metrics
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.metrics.state = newState;
    this.metrics.lastStateChange = new Date();

    if (newState === CircuitState.OPEN) {
      this.metrics.openCount++;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.metrics.halfOpenCount++;
    }

    logger.info(`Circuit breaker ${this.name} state transition`, {
      from: oldState,
      to: newState,
      metrics: this.getMetricsSummary(),
    });
  }

  /**
   * LOW: Get summary metrics for logging
   */
  private getMetricsSummary(): Record<string, any> {
    return {
      state: this.state,
      totalRequests: this.metrics.totalRequests,
      successRate: this.metrics.totalRequests > 0 
        ? ((this.metrics.successCount / this.metrics.totalRequests) * 100).toFixed(1) + '%'
        : 'N/A',
      failureCount: this.metrics.failureCount,
      timeoutCount: this.metrics.timeoutCount,
      fallbackCount: this.metrics.fallbackCount,
      openCount: this.metrics.openCount,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < this.nextAttempt;
  }

  /**
   * LOW: Get full metrics for this circuit breaker
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.metrics.state = CircuitState.CLOSED;
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }
}

/**
 * HIGH: Factory function to create a circuit breaker wrapper around an async function
 * Now properly supports fallback functions that receive the original arguments
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<CircuitBreakerOptions> & { name: string }
): { 
  fire: T; 
  getState: () => CircuitState; 
  isOpen: () => boolean; 
  reset: () => void;
  getMetrics: () => CircuitBreakerMetrics;
} {
  const breaker = new CircuitBreaker(options.name, options);

  const fire = ((...args: Parameters<T>) => {
    return breaker.execute(() => fn(...args), ...args);
  }) as T;

  return {
    fire,
    getState: () => breaker.getState(),
    isOpen: () => breaker.isOpen(),
    reset: () => breaker.reset(),
    getMetrics: () => breaker.getMetrics(),
  };
}
