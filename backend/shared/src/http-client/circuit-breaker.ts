/**
 * Circuit Breaker Implementation
 * 
 * Prevents cascading failures by monitoring failure rates and temporarily
 * blocking requests when a service is unhealthy.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests are blocked
 * - HALF_OPEN: Testing if service has recovered
 */

import { EventEmitter } from 'events';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms to wait before testing if service recovered */
  resetTimeout?: number;
  /** Time window in ms to count failures */
  failureWindow?: number;
  /** Number of successes in half-open state to close circuit */
  successThreshold?: number;
  /** Timeout in ms for each request */
  timeout?: number;
  /** Custom function to determine if response is a failure */
  isFailure?: (error: any) => boolean;
  /** Name for logging/metrics */
  name?: string;
}

interface FailureRecord {
  timestamp: number;
  error: any;
}

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    super();
    
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000, // 30 seconds
      failureWindow: options.failureWindow ?? 60000, // 1 minute
      successThreshold: options.successThreshold ?? 3,
      timeout: options.timeout ?? 10000, // 10 seconds
      isFailure: options.isFailure ?? (() => true),
      name: options.name ?? 'circuit-breaker',
    };
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if the circuit is allowing requests
   */
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      // Check if we should transition to half-open
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }
    
    // HALF_OPEN state - allow limited requests
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      const error = new CircuitOpenError(
        `Circuit breaker ${this.options.name} is OPEN. Retry after ${this.nextAttemptTime - Date.now()}ms`
      );
      this.emit('rejected', { state: this.state, error });
      throw error;
    }

    const startTime = Date.now();
    
    try {
      // Apply timeout
      const result = await this.withTimeout(fn(), this.options.timeout);
      
      this.recordSuccess();
      this.emit('success', { 
        state: this.state, 
        duration: Date.now() - startTime 
      });
      
      return result;
    } catch (error) {
      // Check if this should be counted as a failure
      if (this.options.isFailure(error)) {
        this.recordFailure(error);
        this.emit('failure', { 
          state: this.state, 
          error, 
          duration: Date.now() - startTime 
        });
      }
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
    
    // Clear old failures in closed state
    if (this.state === CircuitState.CLOSED) {
      this.clearOldFailures();
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(error: any): void {
    const now = Date.now();
    this.failures.push({ timestamp: now, error });
    this.lastFailureTime = now;
    
    // Clear old failures
    this.clearOldFailures();
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we exceeded the threshold
      if (this.failures.length >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Clear failures older than the failure window
   */
  private clearOldFailures(): void {
    const cutoff = Date.now() - this.options.failureWindow;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    
    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttemptTime = Date.now() + this.options.resetTimeout;
        this.successCount = 0;
        break;
        
      case CircuitState.HALF_OPEN:
        this.successCount = 0;
        break;
        
      case CircuitState.CLOSED:
        this.failures = [];
        this.successCount = 0;
        break;
    }
    
    this.emit('stateChange', { from: previousState, to: newState });
  }

  /**
   * Wrap a promise with a timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`Operation timed out after ${timeout}ms`));
        }, timeout);
      }),
    ]);
  }

  /**
   * Force the circuit to open (for manual intervention)
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force the circuit to close (for manual intervention)
   */
  forceClose(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.emit('reset', {});
  }

  /**
   * Get statistics about the circuit breaker
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null,
    };
  }
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextAttemptTime: number | null;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN';
  
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends Error {
  readonly code = 'TIMEOUT';
  
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Create a default circuit breaker configuration for service clients
 */
export function createDefaultCircuitBreaker(serviceName: string): CircuitBreaker {
  return new CircuitBreaker({
    name: `${serviceName}-circuit`,
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    failureWindow: 60000, // 1 minute
    successThreshold: 3,
    timeout: 10000, // 10 seconds
    isFailure: (error) => {
      // Don't count 4xx errors (client errors) as failures
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        return false;
      }
      return true;
    },
  });
}
