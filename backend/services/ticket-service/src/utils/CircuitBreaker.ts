interface CircuitBreakerOptions {
  name?: string;
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

interface CircuitBreakerStatistics {
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private name: string;
  private failureThreshold: number;
  private successThreshold: number;
  private timeout: number;
  private resetTimeout: number;
  private state: CircuitState;
  private failureCount: number;
  private successCount: number;
  private nextAttempt: number;
  private statistics: CircuitBreakerStatistics;

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 5000;
    this.resetTimeout = options.resetTimeout || 30000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.statistics = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastFailure: null,
      lastSuccess: null
    };
  }

  async call<T>(asyncFunction: (...args: unknown[]) => Promise<T>, ...args: unknown[]): Promise<T> {
    this.statistics.totalCalls++;

    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`) as Error & { code: string };
        error.code = 'CIRCUIT_OPEN';
        throw error;
      }
      this.state = 'HALF_OPEN';
      console.log(`Circuit ${this.name} attempting recovery (HALF_OPEN)`);
    }

    try {
      const result = await this.executeWithTimeout(asyncFunction, ...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(asyncFunction: (...args: unknown[]) => Promise<T>, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout for ${this.name}`));
      }, this.timeout);

      asyncFunction(...args)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.statistics.totalSuccesses++;
    this.statistics.lastSuccess = new Date();

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
        console.log(`✅ Circuit ${this.name} recovered (CLOSED)`);
      }
    }
  }

  private onFailure(): void {
    this.successCount = 0;
    this.failureCount++;
    this.statistics.totalFailures++;
    this.statistics.lastFailure = new Date();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`⚠️ Circuit ${this.name} opened due to failures`);
    }
  }

  getStatus(): { name: string; state: CircuitState; failureCount: number; statistics: CircuitBreakerStatistics } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      statistics: this.statistics
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    console.log(`Circuit ${this.name} manually reset`);
  }
}

export default CircuitBreaker;
