/**
 * Circuit Breaker Implementation
 * Prevents cascading failures from external service outages
 */

import { SafeLogger } from './pci-log-scrubber.util';

const logger = new SafeLogger('CircuitBreaker');

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;  // Number of failures before opening
  successThreshold: number;  // Number of successes before closing
  timeout: number;           // Time in ms before attempting recovery
  name: string;              // Circuit breaker identifier
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    logger.info('Circuit breaker initialized', {
      name: options.name,
      failureThreshold: options.failureThreshold,
      timeout: options.timeout,
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker is OPEN for ${this.options.name}`);
        logger.warn('Circuit breaker blocking request', {
          name: this.options.name,
          state: this.state,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });
        throw error;
      }

      // Time to attempt recovery
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info('Circuit breaker entering HALF_OPEN state', {
        name: this.options.name,
      });
    }

    try {
      // Execute the function
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker closed', {
          name: this.options.name,
          successCount: this.successCount,
        });
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;

    logger.warn('Circuit breaker recorded failure', {
      name: this.options.name,
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold,
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Go back to OPEN if we fail during recovery
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      logger.warn('Circuit breaker re-opened during recovery', {
        name: this.options.name,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    } else if (this.failureCount >= this.options.failureThreshold) {
      // Open the circuit
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      logger.error('Circuit breaker opened', {
        name: this.options.name,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit metrics
   */
  getMetrics() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === CircuitState.OPEN 
        ? new Date(this.nextAttempt).toISOString()
        : null,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    logger.info('Circuit breaker manually reset', {
      name: this.options.name,
    });
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
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000, // 1 minute
        name,
        ...options,
      };
      
      this.breakers.set(name, new CircuitBreaker(defaultOptions));
    }
    
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates() {
    const states: Record<string, any> = {};
    
    this.breakers.forEach((breaker, name) => {
      states[name] = breaker.getMetrics();
    });
    
    return states;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.reset();
    });
    logger.info('All circuit breakers reset');
  }
}

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
