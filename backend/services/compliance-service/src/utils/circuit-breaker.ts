/**
 * Circuit Breaker for Compliance Service
 * 
 * AUDIT FIX GD-1: No circuit breaker → External service resilience
 * 
 * Implements the Circuit Breaker pattern for external service calls:
 * - OFAC screening service
 * - Plaid bank verification
 * - SendGrid email delivery
 * - Tax filing services
 */

import { logger } from './logger';
import { ExternalServiceError, ServiceUnavailableError } from '../errors';

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  /** Name of the service (for logging) */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before attempting recovery */
  resetTimeout?: number;
  /** Number of successful calls to close circuit */
  successThreshold?: number;
  /** Timeout for individual requests in ms */
  requestTimeout?: number;
  /** Monitor callback for state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
  /** Custom error filter - returns true if error should count as failure */
  isFailure?: (error: Error) => boolean;
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailureTime: null,
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0
  };
  
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly requestTimeout: number;
  private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
  private readonly isFailure: (error: Error) => boolean;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000; // 30 seconds
    this.successThreshold = options.successThreshold ?? 3;
    this.requestTimeout = options.requestTimeout ?? 10000; // 10 seconds
    this.onStateChange = options.onStateChange;
    this.isFailure = options.isFailure ?? (() => true); // All errors count by default
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, requestId?: string): Promise<T> {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        logger.warn({
          requestId,
          service: this.name,
          state: this.state,
          resetIn: this.getResetTimeRemaining()
        }, 'Circuit breaker is OPEN - rejecting request');
        
        throw new ServiceUnavailableError(this.name, requestId);
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error, requestId);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      fn()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.stats.totalSuccesses++;
    this.stats.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.stats.successes++;
      
      if (this.stats.successes >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.stats.successes = 0;
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: Error, requestId?: string): void {
    // Check if this error should count as a failure
    if (!this.isFailure(error)) {
      return;
    }

    this.stats.totalFailures++;
    this.stats.failures++;
    this.stats.lastFailureTime = Date.now();

    logger.warn({
      requestId,
      service: this.name,
      state: this.state,
      failures: this.stats.failures,
      threshold: this.failureThreshold,
      error: error.message
    }, 'Circuit breaker recorded failure');

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.transitionTo(CircuitState.OPEN);
      this.stats.successes = 0;
    } else if (this.stats.failures >= this.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.stats.lastFailureTime) return true;
    return Date.now() - this.stats.lastFailureTime >= this.resetTimeout;
  }

  /**
   * Get time remaining until reset attempt
   */
  private getResetTimeRemaining(): number {
    if (!this.stats.lastFailureTime) return 0;
    const remaining = this.resetTimeout - (Date.now() - this.stats.lastFailureTime);
    return Math.max(0, remaining);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info({
      service: this.name,
      from: oldState,
      to: newState,
      stats: this.getStats()
    }, 'Circuit breaker state changed');

    if (this.onStateChange) {
      this.onStateChange(this.name, oldState, newState);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): CircuitStats & { state: CircuitState } {
    return {
      ...this.stats,
      state: this.state
    };
  }

  /**
   * Manually reset the circuit (for admin/testing)
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.stats.failures = 0;
    this.stats.successes = 0;
    this.stats.lastFailureTime = null;
    
    logger.info({ service: this.name }, 'Circuit breaker manually reset');
  }

  /**
   * Manually open the circuit (for maintenance)
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN);
    this.stats.lastFailureTime = Date.now();
    
    logger.info({ service: this.name }, 'Circuit breaker manually tripped');
  }
}

// =============================================================================
// PRE-CONFIGURED CIRCUIT BREAKERS
// =============================================================================

/**
 * Circuit breaker for OFAC screening service
 */
export const ofacCircuitBreaker = new CircuitBreaker({
  name: 'OFAC',
  failureThreshold: 3,
  resetTimeout: 60000, // 1 minute
  successThreshold: 2,
  requestTimeout: 30000, // 30 seconds (OFAC can be slow)
  isFailure: (error) => {
    // Don't count client errors (4xx) as failures
    if (error instanceof ExternalServiceError) {
      return true;
    }
    return !error.message.includes('4');
  }
});

/**
 * Circuit breaker for Plaid bank verification
 */
export const plaidCircuitBreaker = new CircuitBreaker({
  name: 'Plaid',
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 3,
  requestTimeout: 15000
});

/**
 * Circuit breaker for SendGrid email service
 */
export const sendgridCircuitBreaker = new CircuitBreaker({
  name: 'SendGrid',
  failureThreshold: 5,
  resetTimeout: 60000,
  successThreshold: 3,
  requestTimeout: 10000
});

/**
 * Circuit breaker for tax filing service
 */
export const taxFilingCircuitBreaker = new CircuitBreaker({
  name: 'TaxFiling',
  failureThreshold: 3,
  resetTimeout: 120000, // 2 minutes
  successThreshold: 2,
  requestTimeout: 60000 // 1 minute (tax filing can be slow)
});

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new circuit breaker with custom options
 */
export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}

// =============================================================================
// HEALTH CHECK HELPER
// =============================================================================

/**
 * Get health status of all circuit breakers
 */
export function getCircuitBreakerHealth(): Record<string, { state: CircuitState; healthy: boolean; stats: any }> {
  const breakers = [
    { name: 'ofac', breaker: ofacCircuitBreaker },
    { name: 'plaid', breaker: plaidCircuitBreaker },
    { name: 'sendgrid', breaker: sendgridCircuitBreaker },
    { name: 'taxFiling', breaker: taxFilingCircuitBreaker }
  ];

  const health: Record<string, { state: CircuitState; healthy: boolean; stats: any }> = {};

  for (const { name, breaker } of breakers) {
    const state = breaker.getState();
    health[name] = {
      state,
      healthy: state !== CircuitState.OPEN,
      stats: breaker.getStats()
    };
  }

  return health;
}

export default {
  CircuitBreaker,
  CircuitState,
  ofacCircuitBreaker,
  plaidCircuitBreaker,
  sendgridCircuitBreaker,
  taxFilingCircuitBreaker,
  createCircuitBreaker,
  getCircuitBreakerHealth
};
