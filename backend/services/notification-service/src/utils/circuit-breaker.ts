import { logger } from '../config/logger';
import { metricsService } from '../services/metrics.service';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before attempting recovery
  monitoringPeriod: number;     // Time window for counting failures
  name: string;                  // Circuit breaker name for logging
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to failing services
 * and allowing time for recovery.
 */
export class CircuitBreaker {
  private options: CircuitBreakerOptions;
  private state: CircuitBreakerState;
  private failures: number[] = []; // Timestamps of recent failures

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 120000, // 2 minutes
      name: options.name || 'unnamed',
    };

    this.state = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };

    logger.info(`Circuit breaker '${this.options.name}' initialized`, {
      options: this.options,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state.state === CircuitState.OPEN) {
      if (Date.now() < this.state.nextAttemptTime) {
        const error = new Error(`Circuit breaker '${this.options.name}' is OPEN`);
        logger.warn('Circuit breaker rejecting request', {
          name: this.options.name,
          state: this.state.state,
          nextAttempt: new Date(this.state.nextAttemptTime).toISOString(),
        });
        
        // Track metric
        metricsService.incrementCounter('circuit_breaker_open_total', {
          circuit_name: this.options.name,
        });
        
        throw error;
      } else {
        // Timeout elapsed, transition to HALF_OPEN
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.cleanOldFailures();

    if (this.state.state === CircuitState.HALF_OPEN) {
      this.state.successCount++;
      
      logger.info('Circuit breaker success in HALF_OPEN', {
        name: this.options.name,
        successCount: this.state.successCount,
        threshold: this.options.successThreshold,
      });

      // Check if we can close the circuit
      if (this.state.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.state.failureCount = 0;
      this.failures = [];
    }

    // Track metric
    metricsService.incrementCounter('circuit_breaker_success_total', {
      circuit_name: this.options.name,
      state: this.state.state,
    });
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    this.failures.push(Date.now());
    
    this.cleanOldFailures();

    logger.warn('Circuit breaker failure recorded', {
      name: this.options.name,
      state: this.state.state,
      failureCount: this.state.failureCount,
      threshold: this.options.failureThreshold,
      error: error?.message || 'Unknown error',
    });

    // Track metric
    metricsService.incrementCounter('circuit_breaker_failure_total', {
      circuit_name: this.options.name,
      state: this.state.state,
    });

    // Check if we should open the circuit
    if (this.state.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN goes back to OPEN
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state.state;
    this.state.state = newState;

    logger.info('Circuit breaker state transition', {
      name: this.options.name,
      from: oldState,
      to: newState,
    });

    // Track metric
    metricsService.setGauge('circuit_breaker_state', this.getStateValue(), {
      circuit_name: this.options.name,
    });

    switch (newState) {
      case CircuitState.OPEN:
        this.state.nextAttemptTime = Date.now() + this.options.timeout;
        this.state.successCount = 0;
        logger.warn(`Circuit breaker '${this.options.name}' OPENED`, {
          failures: this.failures.length,
          nextAttempt: new Date(this.state.nextAttemptTime).toISOString(),
        });
        break;

      case CircuitState.HALF_OPEN:
        this.state.successCount = 0;
        logger.info(`Circuit breaker '${this.options.name}' entering HALF_OPEN`);
        break;

      case CircuitState.CLOSED:
        this.state.failureCount = 0;
        this.state.successCount = 0;
        this.failures = [];
        logger.info(`Circuit breaker '${this.options.name}' CLOSED`);
        break;
    }
  }

  /**
   * Remove failures outside the monitoring period
   */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.options.monitoringPeriod;
    this.failures = this.failures.filter(time => time > cutoff);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state.state;
  }

  /**
   * Get state as numeric value for metrics
   */
  private getStateValue(): number {
    switch (this.state.state) {
      case CircuitState.CLOSED:
        return 0;
      case CircuitState.HALF_OPEN:
        return 1;
      case CircuitState.OPEN:
        return 2;
      default:
        return -1;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    recentFailures: number;
    nextAttemptTime?: string;
  } {
    this.cleanOldFailures();
    
    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      recentFailures: this.failures.length,
      nextAttemptTime: this.state.state === CircuitState.OPEN
        ? new Date(this.state.nextAttemptTime).toISOString()
        : undefined,
    };
  }

  /**
   * Manually reset the circuit breaker (for testing/admin)
   */
  reset(): void {
    logger.info(`Circuit breaker '${this.options.name}' manually reset`);
    this.failures = [];
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Check if circuit breaker is allowing requests
   */
  isAvailable(): boolean {
    if (this.state.state === CircuitState.OPEN) {
      return Date.now() >= this.state.nextAttemptTime;
    }
    return true;
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({
        ...options,
        name,
      }));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get all breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get statistics for all breakers
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
