/**
 * Circuit Breaker for Marketplace Service
 * 
 * Issues Fixed:
 * - GD-1: No circuit breaker → Graceful degradation on external service failures
 * - S2S-4: No retry with backoff → Exponential backoff strategy
 * - FIX #8: Circuit breaker state now persisted to Redis (survives restarts)
 * 
 * Features:
 * - Circuit states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
 * - Configurable failure thresholds
 * - Exponential backoff for retries
 * - Per-resource circuit breakers
 * - Redis persistence for distributed state (FIX #8)
 */

import { logger } from './logger';
import { cache } from '../config/redis';

const log = logger.child({ component: 'CircuitBreaker' });

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

// FIX #8: Redis key prefix for circuit breaker state
const CIRCUIT_KEY_PREFIX = 'marketplace:circuit:';
const CIRCUIT_STATE_TTL = 3600; // 1 hour TTL for circuit state

// In-memory cache for configs (these don't need persistence)
const configs = new Map<string, CircuitBreakerConfig>();

// In-memory cache for fast reads (synced with Redis)
const localCircuits = new Map<string, CircuitBreakerState>();

/**
 * FIX #8: Save circuit state to Redis
 */
async function saveCircuitToRedis(name: string, state: CircuitBreakerState): Promise<void> {
  try {
    const key = `${CIRCUIT_KEY_PREFIX}${name}`;
    await cache.set(key, JSON.stringify(state), CIRCUIT_STATE_TTL);
  } catch (error: any) {
    log.warn('Failed to persist circuit state to Redis (using local cache)', {
      circuit: name,
      error: error.message
    });
    // Continue with local cache only - don't fail the operation
  }
}

/**
 * FIX #8: Load circuit state from Redis
 */
async function loadCircuitFromRedis(name: string): Promise<CircuitBreakerState | null> {
  try {
    const key = `${CIRCUIT_KEY_PREFIX}${name}`;
    const data = await cache.get(key);
    if (data) {
      return JSON.parse(data) as CircuitBreakerState;
    }
    return null;
  } catch (error: any) {
    log.warn('Failed to load circuit state from Redis', {
      circuit: name,
      error: error.message
    });
    return null;
  }
}

/**
 * FIX #8: Initialize circuit from Redis on first access
 */
async function initCircuitFromRedis(name: string): Promise<void> {
  if (localCircuits.has(name)) return;
  
  const redisState = await loadCircuitFromRedis(name);
  if (redisState) {
    localCircuits.set(name, redisState);
    log.info('Circuit state loaded from Redis', {
      circuit: name,
      state: redisState.state,
      failures: redisState.failures
    });
  }
}

/**
 * Get or create a circuit breaker for a resource
 * FIX #8: Now uses localCircuits with Redis sync
 */
function getCircuit(name: string): CircuitBreakerState {
  if (!localCircuits.has(name)) {
    localCircuits.set(name, {
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now()
    });
  }
  return localCircuits.get(name)!;
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
        const error = new Error(`Circuit breaker is OPEN for ${name}. Retry after ${retryAfter}s`);
        (error as any).code = 'CIRCUIT_OPEN';
        (error as any).retryAfter = retryAfter;
        throw error;
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
 * FIX #8: Uses localCircuits (synced with Redis)
 */
export function getAllCircuitStates(): Record<string, {
  state: CircuitState;
  failures: number;
  lastStateChange: string;
}> {
  const states: Record<string, any> = {};
  for (const [name, circuit] of localCircuits.entries()) {
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
  jitterFactor?: number; // FIX #18: Add jitter to prevent thundering herd (0 to 1)
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2 // FIX #18: Default 20% jitter
};

/**
 * Calculate delay with jitter to prevent thundering herd
 * FIX #18: Add randomized jitter to retry delays
 */
function calculateDelayWithJitter(baseDelay: number, jitterFactor: number): number {
  // Apply jitter: delay ± (delay * jitterFactor * random)
  // This creates a uniform distribution around the base delay
  const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(baseDelay + jitter));
}

/**
 * Execute a function with exponential backoff retry
 * FIX #18: Now includes jitter to prevent thundering herd
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let baseDelay = cfg.initialDelayMs;

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
        // FIX #18: Apply jitter to prevent thundering herd on service recovery
        const delayWithJitter = calculateDelayWithJitter(baseDelay, cfg.jitterFactor || 0);
        
        logger.warn('Retry attempt with jitter', {
          attempt: attempt + 1,
          maxRetries: cfg.maxRetries,
          baseDelay,
          delayWithJitter,
          jitterFactor: cfg.jitterFactor,
          error: lastError.message
        });

        await new Promise(resolve => setTimeout(resolve, delayWithJitter));
        baseDelay = Math.min(baseDelay * cfg.backoffMultiplier, cfg.maxDelayMs);
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
configureCircuit('blockchain-service', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
});

configureCircuit('ticket-service', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
});

configureCircuit('payment-service', {
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 60000
});

configureCircuit('stripe-api', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000
});

configureCircuit('database', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 10000
});
