/**
 * Circuit Breaker for Integration Service
 * 
 * AUDIT FIX CB-1: No circuit breaker for external provider calls
 * 
 * Protects against cascading failures when external services
 * (Stripe, Square, etc.) are unavailable or slow.
 */

import { logger } from './logger';
import { ServiceUnavailableError } from '../errors/index';

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, rejecting requests
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;      // Failures before opening (default: 5)
  successThreshold?: number;      // Successes to close from half-open (default: 2)
  timeout?: number;               // Request timeout in ms (default: 30000)
  resetTimeout?: number;          // Time in open state before half-open (default: 30000)
  monitorInterval?: number;       // Interval to check for reset (default: 5000)
  volumeThreshold?: number;       // Min requests before tripping (default: 10)
  errorFilter?: (error: Error) => boolean; // Filter which errors count
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  lastStateChange: Date;
}

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private lastStateChange = new Date();
  private resetTimer?: NodeJS.Timeout;
  
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;
  private readonly volumeThreshold: number;
  private readonly errorFilter: (error: Error) => boolean;
  
  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 30000;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.volumeThreshold = options.volumeThreshold ?? 10;
    this.errorFilter = options.errorFilter ?? (() => true);
    
    logger.info('Circuit breaker created', {
      name: this.name,
      failureThreshold: this.failureThreshold,
      timeout: this.timeout,
      resetTimeout: this.resetTimeout
    });
  }
  
  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      logger.warn('Circuit breaker open, rejecting request', {
        name: this.name,
        failures: this.failures,
        lastFailure: this.lastFailure
      });
      
      throw new ServiceUnavailableError(this.name);
    }
    
    this.totalRequests++;
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
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
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      }, this.timeout);
      
      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
  
  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccess = new Date();
    this.successes++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }
  
  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    // Check if this error should count
    if (!this.errorFilter(error)) {
      return;
    }
    
    this.lastFailure = new Date();
    this.failures++;
    
    logger.warn('Circuit breaker recorded failure', {
      name: this.name,
      failures: this.failures,
      threshold: this.failureThreshold,
      error: error.message
    });
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open on failure in half-open state
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open
      if (this.totalRequests >= this.volumeThreshold && 
          this.failures >= this.failureThreshold) {
        this.open();
      }
    }
  }
  
  /**
   * Open the circuit (start rejecting requests)
   */
  private open(): void {
    if (this.state === CircuitState.OPEN) return;
    
    this.state = CircuitState.OPEN;
    this.lastStateChange = new Date();
    this.successes = 0;
    
    logger.error('Circuit breaker opened', {
      name: this.name,
      failures: this.failures,
      resetTimeout: this.resetTimeout
    });
    
    // Schedule transition to half-open
    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.resetTimeout);
  }
  
  /**
   * Transition to half-open (test if service recovered)
   */
  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.lastStateChange = new Date();
    this.successes = 0;
    
    logger.info('Circuit breaker half-open, testing service', {
      name: this.name
    });
  }
  
  /**
   * Close the circuit (resume normal operation)
   */
  private close(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    
    this.state = CircuitState.CLOSED;
    this.lastStateChange = new Date();
    this.failures = 0;
    this.successes = 0;
    
    logger.info('Circuit breaker closed', {
      name: this.name
    });
  }
  
  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      lastStateChange: this.lastStateChange
    };
  }
  
  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastStateChange = new Date();
    
    logger.info('Circuit breaker manually reset', { name: this.name });
  }
  
  /**
   * Check if circuit is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

// =============================================================================
// PROVIDER-SPECIFIC CIRCUIT BREAKERS
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a provider
 */
export function getCircuitBreaker(provider: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  const key = provider.toLowerCase();
  
  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, new CircuitBreaker({
      name: key,
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 30000,
      volumeThreshold: 10,
      // Don't count client errors (4xx) as failures
      errorFilter: (error: any) => {
        const status = error.status || error.statusCode;
        return !status || status >= 500;
      },
      ...options
    }));
  }
  
  return circuitBreakers.get(key)!;
}

/**
 * Pre-configured circuit breakers for known providers
 */
export const stripeCircuitBreaker = getCircuitBreaker('stripe', {
  timeout: 15000, // Stripe is usually fast
  failureThreshold: 3
});

export const squareCircuitBreaker = getCircuitBreaker('square', {
  timeout: 20000
});

export const ticketmasterCircuitBreaker = getCircuitBreaker('ticketmaster', {
  timeout: 30000,
  failureThreshold: 5
});

export const eventbriteCircuitBreaker = getCircuitBreaker('eventbrite', {
  timeout: 25000
});

export const mailchimpCircuitBreaker = getCircuitBreaker('mailchimp', {
  timeout: 20000
});

export const quickbooksCircuitBreaker = getCircuitBreaker('quickbooks', {
  timeout: 25000
});

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getStats());
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  CircuitBreaker,
  CircuitState,
  getCircuitBreaker,
  getAllCircuitBreakerStats,
  stripeCircuitBreaker,
  squareCircuitBreaker,
  ticketmasterCircuitBreaker,
  eventbriteCircuitBreaker,
  mailchimpCircuitBreaker,
  quickbooksCircuitBreaker
};
