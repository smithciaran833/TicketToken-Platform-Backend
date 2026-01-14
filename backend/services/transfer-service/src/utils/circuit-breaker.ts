/**
 * Circuit Breaker Implementation for Transfer Service
 * 
 * AUDIT FIXES:
 * - GD-H1: No fallback for blockchain failures → Circuit breaker pattern
 * - GD-H2: No circuit breaker on database → Reusable circuit breaker
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

import logger from './logger';

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;      // Failures before opening
  resetTimeout: number;          // ms before trying half-open
  halfOpenRequests: number;      // Requests to allow in half-open
  successThreshold?: number;     // Successes to close from half-open
  onStateChange?: (state: CircuitState, name: string) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
}

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private consecutiveFailures: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private halfOpenRequests: number = 0;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      successThreshold: 3,
      onStateChange: () => {},
      ...config
    };
    
    logger.debug(`Circuit breaker initialized: ${config.name}`);
  }

  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    this.totalRequests++;
    
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (this.lastFailureTime && 
          Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }
    
    // HALF_OPEN: Allow limited requests
    if (this.halfOpenRequests < this.config.halfOpenRequests) {
      this.halfOpenRequests++;
      return true;
    }
    
    return false;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Check if enough successes to close
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open returns to open
      this.transitionTo(CircuitState.OPEN);
      return;
    }
    
    if (this.state === CircuitState.CLOSED) {
      // Check if threshold exceeded
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
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
  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures
    };
  }

  /**
   * Force circuit to open state
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Force circuit to closed state
   */
  forceClosed(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Reset circuit breaker state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.halfOpenRequests = 0;
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;
    
    const oldState = this.state;
    this.state = newState;
    
    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.consecutiveFailures = 0;
      this.halfOpenRequests = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
      this.halfOpenRequests = 0;
    }
    
    logger.info({
      circuitBreaker: this.config.name,
      oldState,
      newState,
      consecutiveFailures: this.consecutiveFailures
    }, `Circuit breaker state changed: ${oldState} -> ${newState}`);
    
    this.config.onStateChange(newState, this.config.name);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.config.name);
    }
    
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Execute with fallback on circuit open
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    if (!this.canExecute()) {
      logger.warn({
        circuitBreaker: this.config.name
      }, 'Circuit open, using fallback');
      return fallback();
    }
    
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      
      // If circuit just opened, use fallback
      if (this.state === CircuitState.OPEN) {
        logger.warn({
          circuitBreaker: this.config.name,
          error: (error as Error).message
        }, 'Failure triggered circuit open, using fallback');
        return fallback();
      }
      
      throw error;
    }
  }
}

// =============================================================================
// CIRCUIT OPEN ERROR
// =============================================================================

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  
  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is open`);
    this.circuitName = circuitName;
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

// =============================================================================
// CIRCUIT BREAKER REGISTRY
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Omit<CircuitBreakerConfig, 'name'>
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  
  if (!breaker && config) {
    breaker = new CircuitBreaker({ name, ...config });
    circuitBreakers.set(name, breaker);
  } else if (!breaker) {
    // Default config
    breaker = new CircuitBreaker({
      name,
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenRequests: 3,
      successThreshold: 3
    });
    circuitBreakers.set(name, breaker);
  }
  
  return breaker;
}

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getStats());
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

// =============================================================================
// PRE-CONFIGURED CIRCUIT BREAKERS
// =============================================================================

// Database circuit breaker
export const databaseCircuitBreaker = getCircuitBreaker('database', {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
  successThreshold: 3,
  onStateChange: (state) => {
    if (state === CircuitState.OPEN) {
      logger.error('Database circuit breaker OPENED - database may be unavailable');
    }
  }
});

// Blockchain circuit breaker
export const blockchainCircuitBreaker = getCircuitBreaker('blockchain', {
  failureThreshold: 3,
  resetTimeout: 60000,
  halfOpenRequests: 2,
  successThreshold: 2,
  onStateChange: (state) => {
    if (state === CircuitState.OPEN) {
      logger.error('Blockchain circuit breaker OPENED - RPC may be unavailable');
    }
  }
});

// Webhook circuit breaker
export const webhookCircuitBreaker = getCircuitBreaker('webhook', {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
  successThreshold: 3,
  onStateChange: (state) => {
    if (state === CircuitState.OPEN) {
      logger.warn('Webhook circuit breaker OPENED - webhook endpoints may be unavailable');
    }
  }
});

// External services circuit breaker
export const externalServicesCircuitBreaker = getCircuitBreaker('external-services', {
  failureThreshold: 3,
  resetTimeout: 45000,
  halfOpenRequests: 2,
  successThreshold: 2
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
  resetAllCircuitBreakers,
  databaseCircuitBreaker,
  blockchainCircuitBreaker,
  webhookCircuitBreaker,
  externalServicesCircuitBreaker
};
