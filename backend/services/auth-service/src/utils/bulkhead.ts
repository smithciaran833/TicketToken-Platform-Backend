/**
 * Bulkhead Pattern Implementation
 * 
 * Limits concurrent executions to prevent cascade failures.
 * If too many requests are in-flight, new requests are rejected fast.
 */

import { logger } from './logger';

interface BulkheadOptions {
  maxConcurrent: number;
  maxQueue: number;
  timeout?: number;
}

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  fn: () => Promise<any>;
  timeout?: NodeJS.Timeout;
}

export class Bulkhead {
  private name: string;
  private maxConcurrent: number;
  private maxQueue: number;
  private timeout: number;
  private currentConcurrent: number = 0;
  private queue: QueuedRequest[] = [];

  constructor(name: string, options: BulkheadOptions) {
    this.name = name;
    this.maxConcurrent = options.maxConcurrent;
    this.maxQueue = options.maxQueue;
    this.timeout = options.timeout || 30000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.currentConcurrent < this.maxConcurrent) {
      return this.run(fn);
    }

    // Check if queue is full
    if (this.queue.length >= this.maxQueue) {
      logger.warn('Bulkhead queue full, rejecting request', {
        bulkhead: this.name,
        concurrent: this.currentConcurrent,
        queued: this.queue.length,
      });
      throw new BulkheadRejectError(`${this.name} bulkhead queue full`);
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        resolve,
        reject,
        fn,
      };

      // Set timeout for queued request
      queuedRequest.timeout = setTimeout(() => {
        const index = this.queue.indexOf(queuedRequest);
        if (index > -1) {
          this.queue.splice(index, 1);
          reject(new BulkheadTimeoutError(`${this.name} bulkhead queue timeout`));
        }
      }, this.timeout);

      this.queue.push(queuedRequest);

      logger.debug('Request queued in bulkhead', {
        bulkhead: this.name,
        queueLength: this.queue.length,
      });
    });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.currentConcurrent++;

    try {
      return await fn();
    } finally {
      this.currentConcurrent--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.currentConcurrent >= this.maxConcurrent) {
      return;
    }

    const next = this.queue.shift();
    if (next) {
      if (next.timeout) {
        clearTimeout(next.timeout);
      }

      this.run(next.fn)
        .then(next.resolve)
        .catch(next.reject);
    }
  }

  getStats() {
    return {
      name: this.name,
      concurrent: this.currentConcurrent,
      maxConcurrent: this.maxConcurrent,
      queued: this.queue.length,
      maxQueue: this.maxQueue,
    };
  }
}

export class BulkheadRejectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadRejectError';
  }
}

export class BulkheadTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadTimeoutError';
  }
}

// Pre-configured bulkheads for different operation types
export const bulkheads = {
  // Database operations - allow more concurrency
  database: new Bulkhead('database', {
    maxConcurrent: 20,
    maxQueue: 50,
    timeout: 30000,
  }),

  // External API calls - more restricted
  externalApi: new Bulkhead('external-api', {
    maxConcurrent: 10,
    maxQueue: 20,
    timeout: 10000,
  }),

  // Auth operations - critical path, higher limits
  auth: new Bulkhead('auth', {
    maxConcurrent: 50,
    maxQueue: 100,
    timeout: 5000,
  }),

  // Email sending - can be slower
  email: new Bulkhead('email', {
    maxConcurrent: 5,
    maxQueue: 100,
    timeout: 60000,
  }),
};

/**
 * Decorator-style wrapper for bulkhead protection
 */
export function withBulkhead<T>(
  bulkhead: Bulkhead,
  fn: () => Promise<T>
): Promise<T> {
  return bulkhead.execute(fn);
}
