// WP-12 Phase 2: Circuit Breaker Implementation

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  name?: string;
  halfOpenRequests?: number;
}

interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttempt?: number;
  name?: string;
}

class CircuitBreaker {
  private name: string;
  private failureThreshold: number;
  private resetTimeout: number;
  private monitoringWindow: number;
  private halfOpenRequests: number;
  private state: CircuitState;
  private failures: number;
  private successes: number;
  private nextAttempt: number;
  private halfOpenAttempts: number;
  private recentFailures: number[];

  constructor(options: CircuitBreakerConfig) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 3;

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.halfOpenAttempts = 0;
    this.recentFailures = [];
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      this.state = CircuitState.HALF_OPEN;
      this.halfOpenAttempts = 0;
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

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        this.state = CircuitState.CLOSED;
        console.log(`Circuit breaker ${this.name} is now CLOSED`);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.recentFailures.push(Date.now());

    // Remove old failures outside monitoring window
    const cutoff = Date.now() - this.monitoringWindow;
    this.recentFailures = this.recentFailures.filter((time) => time > cutoff);

    if (this.recentFailures.length >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`Circuit breaker ${this.name} is now OPEN`);
    }
  }

  getState(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt,
    };
  }
}

export default CircuitBreaker;
export { CircuitState, CircuitBreakerConfig, CircuitBreakerStats };
