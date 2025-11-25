import { logger } from './logger';
import { circuitBreakerState, circuitBreakerTrips } from './metrics';

export enum CircuitState {
  CLOSED = 0,    // Normal operation
  OPEN = 1,      // Failing, reject requests
  HALF_OPEN = 2  // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker implementation to prevent cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number = 0;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {}
  ) {
    const {
      failureThreshold = 5,
      successThreshold = 2,
      timeout = 60000, // 1 minute
      resetTimeout = 30000, // 30 seconds
      monitoringPeriod = 10000 // 10 seconds
    } = options;

    this.options = {
      failureThreshold,
      successThreshold,
      timeout,
      resetTimeout,
      monitoringPeriod
    };

    // Update metrics
    this.updateMetrics();

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if we should attempt to close
      if (Date.now() >= this.nextAttemptTime) {
        logger.info(`Circuit breaker ${this.name}: transitioning to HALF_OPEN`);
        this.state = CircuitState.HALF_OPEN;
        this.updateMetrics();
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker ${this.name} is OPEN`,
          CircuitState.OPEN
        );
      }
    }

    try {
      // Execute operation with timeout
      const result = await this.executeWithTimeout(operation);
      
      // Record success
      this.onSuccess();
      
      return result;
    } catch (error) {
      // Record failure
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const { timeout } = this.options;
    
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Circuit breaker timeout after ${timeout}ms`)),
          timeout
        )
      )
    ]);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold!) {
        logger.info(`Circuit breaker ${this.name}: transitioning to CLOSED`);
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.updateMetrics();
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed while testing, go back to OPEN
      logger.warn(`Circuit breaker ${this.name}: transitioning back to OPEN`);
      this.openCircuit();
    } else if (this.failureCount >= this.options.failureThreshold!) {
      // Too many failures, open circuit
      logger.error(`Circuit breaker ${this.name}: transitioning to OPEN`);
      this.openCircuit();
      
      // Record circuit trip
      circuitBreakerTrips.inc({ operation: this.name });
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.successCount = 0;
    this.nextAttemptTime = Date.now() + this.options.resetTimeout!;
    this.updateMetrics();
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
      state: CircuitState[this.state],
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = 0;
    this.updateMetrics();
    
    logger.info(`Circuit breaker ${this.name}: manually reset`);
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(): void {
    circuitBreakerState.set({ operation: this.name }, this.state);
  }

  /**
   * Start monitoring and auto-reset
   */
  private startMonitoring(): void {
    setInterval(() => {
      // Check if we should automatically close after monitoring period
      if (
        this.state === CircuitState.OPEN &&
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime > this.options.monitoringPeriod!
      ) {
        // Check if enough time has passed to attempt recovery
        if (Date.now() >= this.nextAttemptTime) {
          logger.info(`Circuit breaker ${this.name}: auto-transitioning to HALF_OPEN`);
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          this.updateMetrics();
        }
      }
    }, this.options.monitoringPeriod);
  }
}

/**
 * Circuit Breaker Manager - manages multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(
    name: string,
    operation: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(operation);
  }

  /**
   * Get all breaker statistics
   */
  getAllStats() {
    const stats: Record<string, any> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  /**
   * Reset specific breaker
   */
  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
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

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();

// Pre-configured circuit breakers for common operations
export const CIRCUIT_BREAKER_CONFIGS = {
  rpcCall: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
    monitoringPeriod: 10000
  },
  
  transactionSubmission: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
    resetTimeout: 120000,
    monitoringPeriod: 15000
  },
  
  mintOperation: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 120000,
    resetTimeout: 180000,
    monitoringPeriod: 30000
  },
  
  externalService: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 10000,
    resetTimeout: 30000,
    monitoringPeriod: 5000
  }
};

export default {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  CircuitState,
  CIRCUIT_BREAKER_CONFIGS
};
