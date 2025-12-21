/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascade failures when external services are down
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery)
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;  // Failures before opening circuit
  timeout?: number;           // Time to wait before half-open (ms)
  successThreshold?: number;  // Successes in half-open before closing
}

export class CircuitBreaker {
  private failures: number = 0;
  private successes: number = 0;
  private state: CircuitState = CircuitState.CLOSED;
  private nextAttempt: number = 0;
  private readonly failureThreshold: number;
  private readonly timeout: number;
  private readonly successThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute default
    this.successThreshold = options.successThreshold || 2;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN. Service unavailable. Retry after ${new Date(this.nextAttempt).toISOString()}`);
      }
      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
    }

    try {
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
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        // Enough successes, close the circuit
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery, back to open
      this.trip();
    } else if (this.failures >= this.failureThreshold) {
      // Too many failures, trip the circuit
      this.trip();
    }
  }

  /**
   * Trip the circuit breaker (open it)
   */
  private trip(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.timeout;
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Force reset (manual override)
   */
  forceReset(): void {
    this.reset();
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt).toISOString() : null
    };
  }
}

/**
 * Create circuit breaker for common services
 */
export const circuitBreakers = {
  payment: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 }),
  notification: new CircuitBreaker({ failureThreshold: 3, timeout: 30000 }),
  blockchain: new CircuitBreaker({ failureThreshold: 10, timeout: 120000 }),
  analytics: new CircuitBreaker({ failureThreshold: 2, timeout: 15000 })
};
