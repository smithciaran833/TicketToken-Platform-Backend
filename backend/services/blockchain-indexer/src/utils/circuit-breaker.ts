/**
 * Circuit Breaker Utility
 * 
 * AUDIT FIX: S2S-9 - Circuit breaker not integrated
 * AUDIT FIX: ERR-13 - Circuit breaker metrics
 * 
 * Implements the circuit breaker pattern to prevent cascading failures
 * when external services are unavailable.
 */

import logger from './logger';

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject all calls
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Number of successes in half-open to close circuit */
  successThreshold?: number;
  /** Time in ms before attempting recovery (half-open) */
  resetTimeout?: number;
  /** Optional timeout for calls (ms) */
  callTimeout?: number;
  /** Name for logging/metrics */
  name?: string;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
  /** Function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
}

export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChange: number;
}

// =============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private totalCalls: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChange: number = Date.now();
  private nextAttempt: number = 0;
  
  private readonly options: Required<CircuitBreakerOptions>;
  
  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      resetTimeout: options.resetTimeout || 30000, // 30 seconds
      callTimeout: options.callTimeout || 10000, // 10 seconds
      name: options.name || 'default',
      onStateChange: options.onStateChange || this.defaultStateChangeHandler,
      isFailure: options.isFailure || (() => true)
    };
    
    logger.info({ 
      name: this.options.name,
      failureThreshold: this.options.failureThreshold,
      resetTimeout: this.options.resetTimeout
    }, 'Circuit breaker initialized');
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn({ name: this.options.name }, 'Circuit breaker OPEN - rejecting call');
        throw new CircuitBreakerOpenError(
          `Circuit breaker ${this.options.name} is OPEN`,
          this.nextAttempt - Date.now()
        );
      }
      
      // Time to try again - move to half-open
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      // Execute with optional timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.options.isFailure(error as Error)) {
        this.onFailure(error as Error);
      }
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.options.callTimeout) {
      return fn();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker call timeout after ${this.options.callTimeout}ms`));
      }, this.options.callTimeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle successful call
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
    
    logger.debug({ 
      name: this.options.name, 
      state: this.state,
      successes: this.successes 
    }, 'Circuit breaker call succeeded');
  }

  /**
   * Handle failed call
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failures++;
    
    logger.warn({ 
      name: this.options.name, 
      state: this.state,
      failures: this.failures,
      error: error.message
    }, 'Circuit breaker call failed');

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.options.failureThreshold) {
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
    this.lastStateChange = Date.now();
    
    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      this.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    this.options.onStateChange(oldState, newState, this.options.name);
  }

  /**
   * Default state change handler
   */
  private defaultStateChangeHandler(
    from: CircuitState, 
    to: CircuitState, 
    name: string
  ): void {
    logger.info({ from, to, name }, 'Circuit breaker state changed');
  }

  /**
   * Get current metrics
   * AUDIT FIX: ERR-13 - Circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing calls
   */
  isCallAllowed(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }
    // OPEN state - check if reset timeout has passed
    return Date.now() >= this.nextAttempt;
  }

  /**
   * Force circuit to specific state (for testing/admin)
   */
  forceState(state: CircuitState): void {
    logger.warn({ name: this.options.name, state }, 'Circuit breaker state forced');
    this.transitionTo(state);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.state = CircuitState.CLOSED;
    this.nextAttempt = 0;
    this.lastStateChange = Date.now();
    logger.info({ name: this.options.name }, 'Circuit breaker reset');
  }
}

// =============================================================================
// CIRCUIT BREAKER ERROR
// =============================================================================

export class CircuitBreakerOpenError extends Error {
  public readonly retryAfterMs: number;
  
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

// =============================================================================
// CIRCUIT BREAKER REGISTRY
// =============================================================================

const circuitBreakers: Map<string, CircuitBreaker> = new Map();

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(
  name: string,
  options?: Omit<CircuitBreakerOptions, 'name'>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ ...options, name }));
  }
  return circuitBreakers.get(name)!;
}

/**
 * Get all circuit breaker metrics
 */
export function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getMetrics());
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach(cb => cb.reset());
}

// =============================================================================
// PRE-CONFIGURED CIRCUIT BREAKERS
// =============================================================================

/** Circuit breaker for Solana RPC calls */
export const solanaRpcBreaker = getCircuitBreaker('solana-rpc', {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000,
  callTimeout: 30000
});

/** Circuit breaker for marketplace API calls */
export const marketplaceApiBreaker = getCircuitBreaker('marketplace-api', {
  failureThreshold: 3,
  successThreshold: 2,
  resetTimeout: 60000,
  callTimeout: 15000
});

/** Circuit breaker for MongoDB operations */
export const mongoBreaker = getCircuitBreaker('mongodb', {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 10000,
  callTimeout: 5000
});

/** Circuit breaker for PostgreSQL operations */
export const postgresBreaker = getCircuitBreaker('postgresql', {
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 10000,
  callTimeout: 5000
});
