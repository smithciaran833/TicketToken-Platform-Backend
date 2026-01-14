/**
 * Circuit Breaker for Blockchain Service
 * 
 * Issues Fixed:
 * - #18: No circuit breaker → Graceful degradation on Solana RPC failures
 * - #19: No retry with backoff → Exponential backoff strategy
 * 
 * Features:
 * - Circuit states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
 * - Configurable failure thresholds
 * - Exponential backoff for retries
 * - Per-resource circuit breakers
 */

import { logger } from './logger';
import { SolanaError, ErrorCode } from '../errors';

// Circuit breaker states
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before trying half-open
  resetTimeout?: number;         // Time to reset failure count (rolling window)
}

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,           // 30 seconds
  resetTimeout: 60000       // 1 minute rolling window
};

// Circuit breaker state
interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastStateChange: number;
}

// Registry of circuit breakers
const circuits = new Map<string, CircuitBreakerState>();
const configs = new Map<string, CircuitBreakerConfig>();

/**
 * Get or create a circuit breaker for a resource
 */
function getCircuit(name: string): CircuitBreakerState {
  if (!circuits.has(name)) {
    circuits.set(name, {
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now()
    });
  }
  return circuits.get(name)!;
}

/**
 * Configure a circuit breaker
 */
export function configureCircuit(name: string, config: Partial<CircuitBreakerConfig>): void {
  configs.set(name, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Get configuration for a circuit
 */
function getConfig(name: string): CircuitBreakerConfig {
  return configs.get(name) || DEFAULT_CONFIG;
}

/**
 * Execute a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const circuit = getCircuit(name);
  const cfg = config ? { ...getConfig(name), ...config } : getConfig(name);
  const now = Date.now();

  // Check if we should reset the rolling window
  if (cfg.resetTimeout && circuit.lastFailureTime > 0) {
    if (now - circuit.lastFailureTime > cfg.resetTimeout) {
      circuit.failures = 0;
    }
  }

  // Check circuit state
  switch (circuit.state) {
    case CircuitState.OPEN:
      // Check if timeout has passed to try half-open
      if (now - circuit.lastStateChange >= cfg.timeout) {
        circuit.state = CircuitState.HALF_OPEN;
        circuit.successes = 0;
        circuit.lastStateChange = now;
        logger.info('Circuit breaker entering HALF_OPEN state', { circuit: name });
      } else {
        const retryAfter = Math.ceil((cfg.timeout - (now - circuit.lastStateChange)) / 1000);
        throw new SolanaError(
          `Circuit breaker is OPEN for ${name}. Retry after ${retryAfter}s`,
          ErrorCode.CIRCUIT_OPEN,
          503,
          { circuit: name, retryAfter }
        );
      }
      break;

    case CircuitState.HALF_OPEN:
      // Allow limited requests through
      break;

    case CircuitState.CLOSED:
      // Normal operation
      break;
  }

  try {
    const result = await fn();
    
    // Success
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.successes++;
      if (circuit.successes >= cfg.successThreshold) {
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
        circuit.lastStateChange = now;
        logger.info('Circuit breaker recovered to CLOSED state', { circuit: name });
      }
    }
    
    return result;

  } catch (error) {
    // Failure
    circuit.failures++;
    circuit.lastFailureTime = now;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test, open circuit again
      circuit.state = CircuitState.OPEN;
      circuit.lastStateChange = now;
      logger.warn('Circuit breaker back to OPEN (failed during half-open)', { 
        circuit: name,
        failures: circuit.failures
      });
    } else if (circuit.state === CircuitState.CLOSED && circuit.failures >= cfg.failureThreshold) {
      // Too many failures, open circuit
      circuit.state = CircuitState.OPEN;
      circuit.lastStateChange = now;
      logger.error('Circuit breaker OPENED due to failures', { 
        circuit: name,
        failures: circuit.failures,
        threshold: cfg.failureThreshold
      });
    }

    throw error;
  }
}

/**
 * Get the current state of a circuit
 */
export function getCircuitState(name: string): {
  state: CircuitState;
  failures: number;
  lastStateChange: Date;
} {
  const circuit = getCircuit(name);
  return {
    state: circuit.state,
    failures: circuit.failures,
    lastStateChange: new Date(circuit.lastStateChange)
  };
}

/**
 * Force reset a circuit to closed state
 */
export function resetCircuit(name: string): void {
  const circuit = getCircuit(name);
  circuit.state = CircuitState.CLOSED;
  circuit.failures = 0;
  circuit.successes = 0;
  circuit.lastStateChange = Date.now();
  logger.info('Circuit breaker manually reset', { circuit: name });
}

/**
 * Get all circuit states (for monitoring)
 */
export function getAllCircuitStates(): Record<string, {
  state: CircuitState;
  failures: number;
  lastStateChange: string;
}> {
  const states: Record<string, any> = {};
  for (const [name, circuit] of circuits.entries()) {
    states[name] = {
      state: circuit.state,
      failures: circuit.failures,
      lastStateChange: new Date(circuit.lastStateChange).toISOString()
    };
  }
  return states;
}

// ============================================================================
// RETRY WITH BACKOFF
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = cfg.initialDelayMs;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (cfg.retryableErrors && cfg.retryableErrors.length > 0) {
        const errorCode = (error as any).code || '';
        if (!cfg.retryableErrors.includes(errorCode)) {
          throw error;
        }
      }

      if (attempt < cfg.maxRetries) {
        logger.warn('Retry attempt', {
          attempt: attempt + 1,
          maxRetries: cfg.maxRetries,
          delay,
          error: lastError.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Combine circuit breaker with retry
 */
export async function withCircuitBreakerAndRetry<T>(
  circuitName: string,
  fn: () => Promise<T>,
  circuitConfig?: Partial<CircuitBreakerConfig>,
  retryConfig?: Partial<RetryConfig>
): Promise<T> {
  return withCircuitBreaker(circuitName, () => withRetry(fn, retryConfig), circuitConfig);
}

// Pre-configured circuits for common resources
configureCircuit('solana-rpc', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
});

configureCircuit('treasury-wallet', {
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 60000
});

configureCircuit('database', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 10000
});

// Export the interface for external use
export { CircuitBreakerState };

/**
 * Class-based circuit breaker wrapper for use in service clients
 */
export class CircuitBreaker {
  private name: string;
  private config: Partial<CircuitBreakerConfig>;

  constructor(options: { name: string; threshold?: number; timeout?: number; resetTimeout?: number }) {
    this.name = options.name;
    this.config = {
      failureThreshold: options.threshold,
      timeout: options.timeout,
      resetTimeout: options.resetTimeout
    };
    configureCircuit(this.name, this.config);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return withCircuitBreaker(this.name, fn, this.config);
  }

  getState(): CircuitBreakerState {
    const circuit = getCircuitState(this.name);
    return {
      state: circuit.state,
      failures: circuit.failures,
      successes: 0,
      lastFailureTime: 0,
      lastStateChange: circuit.lastStateChange.getTime()
    };
  }

  reset(): void {
    resetCircuit(this.name);
  }
}
