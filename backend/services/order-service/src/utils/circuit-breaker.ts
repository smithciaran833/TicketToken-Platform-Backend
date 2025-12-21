import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt: number = Date.now();
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      resetTimeout: options.resetTimeout || 30000,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      // Try half-open
      this.state = CircuitState.HALF_OPEN;
      logger.info(`Circuit breaker ${this.name} entering HALF_OPEN state`);
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), this.options.timeout)
      ),
    ]);
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.successCount = 0;
        this.state = CircuitState.CLOSED;
        logger.info(`Circuit breaker ${this.name} closed after successful attempts`);
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      logger.error(`Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < this.nextAttempt;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }
}

/**
 * Factory function to create a circuit breaker wrapper around an async function
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<CircuitBreakerOptions> & { name: string }
): T {
  const breaker = new CircuitBreaker(options.name, options);
  
  return ((...args: Parameters<T>) => {
    return breaker.execute(() => fn(...args));
  }) as T;
}
