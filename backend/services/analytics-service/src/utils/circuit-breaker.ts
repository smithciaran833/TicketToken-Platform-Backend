/**
 * Circuit Breaker Pattern Implementation
 * AUDIT FIX: GD-2,4 - Graceful degradation and fault tolerance
 */

import { logger } from './logger';

// =============================================================================
// Types
// =============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number; // Time to wait before trying half-open (ms)
  volumeThreshold?: number; // Minimum calls before tripping
  errorFilter?: (error: Error) => boolean; // Filter which errors count
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

// =============================================================================
// Circuit Breaker Class
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };
  
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly volumeThreshold: number;
  private readonly errorFilter: (error: Error) => boolean;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.timeout = options.timeout ?? 30000; // 30 seconds
    this.volumeThreshold = options.volumeThreshold ?? 10;
    this.errorFilter = options.errorFilter ?? (() => true);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.stats.lastFailureTime >= this.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.name, this.timeout - (Date.now() - this.stats.lastFailureTime));
      }
    }

    this.stats.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.stats.totalSuccesses++;
    this.stats.successes++;
    this.stats.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.successes >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    // Check if this error should count against the circuit
    if (!this.errorFilter(error)) {
      return;
    }

    this.stats.totalFailures++;
    this.stats.failures++;
    this.stats.successes = 0;
    this.stats.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (
      this.state === CircuitState.CLOSED &&
      this.stats.totalRequests >= this.volumeThreshold &&
      this.stats.failures >= this.failureThreshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.stats.failures = 0;
      this.stats.successes = 0;
    }

    logger.warn({
      event: 'circuit_breaker_transition',
      circuit: this.name,
      from: oldState,
      to: newState,
      stats: {
        totalRequests: this.stats.totalRequests,
        totalFailures: this.stats.totalFailures,
        recentFailures: this.stats.failures,
      },
    }, `Circuit breaker ${this.name}: ${oldState} -> ${newState}`);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): Readonly<CircuitStats> {
    return { ...this.stats };
  }

  /**
   * Force the circuit to a specific state
   */
  forceState(state: CircuitState): void {
    logger.warn({
      event: 'circuit_breaker_forced',
      circuit: this.name,
      forcedState: state,
    }, `Circuit breaker ${this.name} forced to ${state}`);
    this.state = state;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    };
    logger.info({
      event: 'circuit_breaker_reset',
      circuit: this.name,
    }, `Circuit breaker ${this.name} reset`);
  }
}

// =============================================================================
// Custom Error
// =============================================================================

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(`Circuit breaker '${circuitName}' is open. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;
  }
}

// =============================================================================
// Circuit Breaker Registry
// =============================================================================

const circuits = new Map<string, CircuitBreaker>();

export function getOrCreateCircuit(options: CircuitBreakerOptions): CircuitBreaker {
  let circuit = circuits.get(options.name);
  if (!circuit) {
    circuit = new CircuitBreaker(options);
    circuits.set(options.name, circuit);
  }
  return circuit;
}

export function getCircuit(name: string): CircuitBreaker | undefined {
  return circuits.get(name);
}

export function getAllCircuits(): Map<string, CircuitBreaker> {
  return new Map(circuits);
}

// =============================================================================
// Pre-configured Circuits for Analytics Service
// =============================================================================

export const influxDBCircuit = getOrCreateCircuit({
  name: 'influxdb',
  failureThreshold: 3,
  timeout: 60000,
  errorFilter: (error) => {
    // Don't trip on client errors
    return !(error.message?.includes('400') || error.message?.includes('404'));
  },
});

export const postgresCircuit = getOrCreateCircuit({
  name: 'postgres',
  failureThreshold: 5,
  timeout: 30000,
});

export const redisCircuit = getOrCreateCircuit({
  name: 'redis',
  failureThreshold: 5,
  timeout: 15000,
});

export const externalServiceCircuit = getOrCreateCircuit({
  name: 'external_service',
  failureThreshold: 3,
  timeout: 45000,
});

export default {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getOrCreateCircuit,
  getCircuit,
  getAllCircuits,
  influxDBCircuit,
  postgresCircuit,
  redisCircuit,
  externalServiceCircuit,
};
