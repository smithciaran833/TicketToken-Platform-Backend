/**
 * CIRCUIT BREAKER
 * 
 * Prevents cascading failures by stopping requests to failing services
 * Phase 7: Production Readiness & Reliability
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening
  successThreshold: number;     // Number of successes to close from half-open
  timeout: number;              // Time to wait before trying again (ms)
  monitoringPeriod: number;     // Time window for counting failures (ms)
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private lastFailureTime: number = Date.now();

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerError(
          `Circuit breaker "${this.name}" is OPEN. Service temporarily unavailable.`
        );
      }
      // Move to half-open to test service
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
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
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        console.log(`Circuit breaker "${this.name}" is now CLOSED`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during testing, go back to open
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      console.log(`Circuit breaker "${this.name}" is now OPEN (failed during testing)`);
      return;
    }

    // Check if we should open the circuit
    if (this.shouldOpen()) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      console.log(
        `Circuit breaker "${this.name}" is now OPEN (${this.failureCount} failures)`
      );
    }
  }

  private shouldOpen(): boolean {
    // Check if failure threshold is reached within monitoring period
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    
    if (timeSinceLastFailure > this.config.monitoringPeriod) {
      // Reset if outside monitoring window
      this.failureCount = 1;
      return false;
    }

    return this.failureCount >= this.config.failureThreshold;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    console.log(`Circuit breaker "${this.name}" has been manually reset`);
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,          // 1 minute
        monitoringPeriod: 120000 // 2 minutes
      };

      this.breakers.set(
        name,
        new CircuitBreaker(name, { ...defaultConfig, ...config })
      );
    }

    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllStats() {
    return Array.from(this.breakers.values()).map(breaker => breaker.getStats());
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
    } else {
      // Reset all breakers
      this.breakers.forEach(breaker => breaker.reset());
    }
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
