/**
 * Circuit Breaker Pattern Implementation
 * 
 * HIGH FIX: Implements circuit breaker for external service calls
 * - Prevents cascade failures when external services are down
 * - Automatic recovery with half-open state
 * - Configurable thresholds
 */

import { logger } from './logger';

const log = logger.child({ component: 'CircuitBreaker' });

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject all requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;     // Number of failures before opening
  successThreshold: number;     // Successes in half-open to close
  timeout: number;              // Time in ms before trying again
  resetTimeout?: number;        // Time to reset failure count when closed
  volumeThreshold?: number;     // Min requests before calculating failure rate
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastStateChange: Date = new Date();
  private nextAttempt: Date = new Date();
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private halfOpenPromise?: Promise<void>;

  constructor(private config: CircuitBreakerConfig) {
    log.info({
      name: config.name,
      failureThreshold: config.failureThreshold,
      timeout: config.timeout,
    }, 'Circuit breaker initialized');
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (new Date() >= this.nextAttempt) {
        // Transition to half-open
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        // Circuit is open, fail fast
        log.warn({
          name: this.config.name,
          retryAfter: this.nextAttempt,
        }, 'Circuit is open, rejecting request');
        
        throw new CircuitBreakerError(
          `Circuit breaker ${this.config.name} is open`,
          this.nextAttempt
        );
      }
    }

    // If half-open, only allow one request at a time
    if (this.state === CircuitState.HALF_OPEN && this.halfOpenPromise) {
      await this.halfOpenPromise;
    }

    try {
      let resolveHalfOpen: (() => void) | undefined;
      
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenPromise = new Promise(resolve => {
          resolveHalfOpen = resolve;
        });
      }

      const result = await fn();
      this.onSuccess();
      
      if (resolveHalfOpen) resolveHalfOpen();
      this.halfOpenPromise = undefined;
      
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a success
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record a failure
   */
  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // Single failure in half-open goes back to open
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded threshold
      const volumeOk = !this.config.volumeThreshold || 
        this.totalRequests >= this.config.volumeThreshold;
      
      if (volumeOk && this.failures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = new Date(Date.now() + this.config.timeout);
      this.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    log.info({
      name: this.config.name,
      from: oldState,
      to: newState,
      failures: this.failures,
      totalFailures: this.totalFailures,
    }, 'Circuit breaker state changed');
  }

  /**
   * Get current circuit stats
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Force the circuit to open
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force the circuit to close
   */
  forceClose(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Reset all stats
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.lastFailure = undefined;
    this.lastStateChange = new Date();
    
    log.info({ name: this.config.name }, 'Circuit breaker reset');
  }
}

// =============================================================================
// CIRCUIT BREAKER ERROR
// =============================================================================

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public retryAfter: Date
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// =============================================================================
// CIRCUIT BREAKER REGISTRY
// =============================================================================

class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  get(config: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(config.name);
    
    if (!breaker) {
      breaker = new CircuitBreaker(config);
      this.breakers.set(config.name, breaker);
    }
    
    return breaker;
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get stats for all breakers
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  /**
   * Reset all breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Alias for compatibility with graceful-degradation.ts
export const circuitBreakerManager = {
  getBreaker: (name: string) => circuitBreakerRegistry.get({
    name,
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    volumeThreshold: 10,
  }),
  getAllStates: () => {
    const states: Record<string, CircuitState> = {};
    for (const [name, breaker] of circuitBreakerRegistry.getAll()) {
      states[name] = breaker.getStats().state;
    }
    return states;
  },
};

// =============================================================================
// PRE-CONFIGURED BREAKERS
// =============================================================================

export const stripeCircuitBreaker = circuitBreakerRegistry.get({
  name: 'stripe',
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  volumeThreshold: 10,
});

export const databaseCircuitBreaker = circuitBreakerRegistry.get({
  name: 'database',
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 10000, // 10 seconds
});

export const redisCircuitBreaker = circuitBreakerRegistry.get({
  name: 'redis',
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 5000, // 5 seconds
});

// =============================================================================
// HELPER FUNCTION
// =============================================================================

/**
 * Wrap a function with circuit breaker protection
 */
export function withCircuitBreaker<T>(
  breakerName: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const breaker = circuitBreakerRegistry.get({
    name: breakerName,
    failureThreshold: config?.failureThreshold || 5,
    successThreshold: config?.successThreshold || 2,
    timeout: config?.timeout || 30000,
    volumeThreshold: config?.volumeThreshold || 10,
  });
  
  return breaker.execute(fn);
}
