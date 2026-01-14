/**
 * Circuit Breaker Pattern Implementation
 * 
 * AUDIT FIXES:
 * - GD-1: No circuit breaker → Services S3, ClamAV now protected
 * - GD-2: No S3 timeout → Operations wrapped with timeout
 * - GD-3: No HTTP client timeout → External calls protected
 * - ERR-H3: No circuit breaker for ClamAV → ClamAV circuit added
 * - ERR-H4: No circuit breaker for S3 → S3 circuit added
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
  requestTimeout?: number; // Timeout for individual requests (ms)
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
  consecutiveFailures: number;
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
    consecutiveFailures: 0,
  };

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly requestTimeout: number;
  private readonly volumeThreshold: number;
  private readonly errorFilter: (error: Error) => boolean;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.timeout = options.timeout ?? 30000; // 30 seconds
    this.requestTimeout = options.requestTimeout ?? 30000; // 30 seconds
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
        throw new CircuitOpenError(
          this.name,
          this.timeout - (Date.now() - this.stats.lastFailureTime)
        );
      }
    }

    this.stats.totalRequests++;

    try {
      // AUDIT FIX GD-2: Add timeout to operations
      const result = await this.executeWithTimeout(fn, this.requestTimeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(this.name, timeoutMs));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.stats.totalSuccesses++;
    this.stats.successes++;
    this.stats.failures = 0;
    this.stats.consecutiveFailures = 0;

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
    this.stats.consecutiveFailures++;
    this.stats.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    if (
      this.state === CircuitState.CLOSED &&
      this.stats.totalRequests >= this.volumeThreshold &&
      this.stats.consecutiveFailures >= this.failureThreshold
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
      this.stats.consecutiveFailures = 0;
    }

    logger.warn({
      event: 'circuit_breaker_transition',
      circuit: this.name,
      from: oldState,
      to: newState,
      stats: {
        totalRequests: this.stats.totalRequests,
        totalFailures: this.stats.totalFailures,
        consecutiveFailures: this.stats.consecutiveFailures,
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
  getStats(): Readonly<CircuitStats & { state: CircuitState }> {
    return { ...this.stats, state: this.state };
  }

  /**
   * Force the circuit to a specific state (for testing/admin)
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
      consecutiveFailures: 0,
    };
    logger.info({
      event: 'circuit_breaker_reset',
      circuit: this.name,
    }, `Circuit breaker ${this.name} reset`);
  }

  /**
   * Check if the circuit is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

// =============================================================================
// Custom Errors
// =============================================================================

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(
      `Circuit breaker '${circuitName}' is open. Retry after ${Math.ceil(retryAfterMs / 1000)}s`
    );
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Error {
  public readonly circuitName: string;
  public readonly timeoutMs: number;

  constructor(circuitName: string, timeoutMs: number) {
    super(
      `Operation in circuit '${circuitName}' timed out after ${timeoutMs}ms`
    );
    this.name = 'TimeoutError';
    this.circuitName = circuitName;
    this.timeoutMs = timeoutMs;
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
    logger.info({
      event: 'circuit_breaker_created',
      circuit: options.name,
      config: {
        failureThreshold: options.failureThreshold ?? 5,
        successThreshold: options.successThreshold ?? 3,
        timeout: options.timeout ?? 30000,
        requestTimeout: options.requestTimeout ?? 30000,
      }
    }, `Circuit breaker ${options.name} created`);
  }
  return circuit;
}

export function getCircuit(name: string): CircuitBreaker | undefined {
  return circuits.get(name);
}

export function getAllCircuits(): Map<string, CircuitBreaker> {
  return new Map(circuits);
}

export function getCircuitStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
  const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
  circuits.forEach((circuit, name) => {
    stats[name] = circuit.getStats();
  });
  return stats;
}

// =============================================================================
// Pre-configured Circuits for File Service
// =============================================================================

/**
 * AUDIT FIX GD-1, ERR-H4: S3 Circuit Breaker
 * Protects against S3 outages
 */
export const s3Circuit = getOrCreateCircuit({
  name: 's3',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // Wait 1 minute before retrying
  requestTimeout: 30000, // 30 second timeout per request
  volumeThreshold: 5,
  errorFilter: (error) => {
    // Don't trip on client errors (4xx)
    const message = error.message?.toLowerCase() || '';
    return !(
      message.includes('nosuchkey') ||
      message.includes('notfound') ||
      message.includes('accessdenied') ||
      message.includes('invalidargument')
    );
  },
});

/**
 * AUDIT FIX GD-1, ERR-H3: ClamAV Circuit Breaker
 * Protects against antivirus service failures
 */
export const clamavCircuit = getOrCreateCircuit({
  name: 'clamav',
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000, // Wait 30 seconds before retrying
  requestTimeout: 60000, // 60 second timeout (virus scans can be slow)
  volumeThreshold: 3,
  errorFilter: (error) => {
    // Trip on all ClamAV errors except clean file responses
    return !error.message?.includes('CLEAN');
  },
});

/**
 * PostgreSQL Circuit Breaker
 */
export const postgresCircuit = getOrCreateCircuit({
  name: 'postgres',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  requestTimeout: 10000,
  volumeThreshold: 5,
});

/**
 * Redis Circuit Breaker
 */
export const redisCircuit = getOrCreateCircuit({
  name: 'redis',
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 15000,
  requestTimeout: 5000,
  volumeThreshold: 5,
});

/**
 * External HTTP service circuit breaker
 */
export const externalServiceCircuit = getOrCreateCircuit({
  name: 'external_service',
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 45000,
  requestTimeout: 30000,
  volumeThreshold: 3,
});

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Wrapper to execute a function with a specific circuit
 */
export async function withCircuit<T>(
  circuitName: string,
  fn: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): Promise<T> {
  const circuit = getOrCreateCircuit({ name: circuitName, ...options });
  return circuit.execute(fn);
}

/**
 * Check if all circuits are healthy
 */
export function areAllCircuitsHealthy(): boolean {
  for (const circuit of circuits.values()) {
    if (!circuit.isHealthy()) {
      return false;
    }
  }
  return true;
}

/**
 * Get list of unhealthy circuits
 */
export function getUnhealthyCircuits(): string[] {
  const unhealthy: string[] = [];
  circuits.forEach((circuit, name) => {
    if (!circuit.isHealthy()) {
      unhealthy.push(name);
    }
  });
  return unhealthy;
}

export default {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  TimeoutError,
  getOrCreateCircuit,
  getCircuit,
  getAllCircuits,
  getCircuitStats,
  withCircuit,
  areAllCircuitsHealthy,
  getUnhealthyCircuits,
  s3Circuit,
  clamavCircuit,
  postgresCircuit,
  redisCircuit,
  externalServiceCircuit,
};
