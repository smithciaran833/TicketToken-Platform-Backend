import { FastifyRequest } from 'fastify';
import { config, timeoutConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('timeout-service');

export class TimeoutService {
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      }),
    ]);
  }

  calculateTimeout(request: FastifyRequest, service: string): number {
    const endpoint = `${request.method} ${request.routeOptions?.url || request.url}`;
    
    // Check service-specific endpoint timeouts
    const services = timeoutConfig.services as Record<string, any>;
    const serviceConfig = services[service];
    if (serviceConfig) {
      // Check exact endpoint match
      if (serviceConfig.endpoints[endpoint]) {
        logger.debug({
          service,
          endpoint,
          timeout: serviceConfig.endpoints[endpoint],
        }, 'Using endpoint-specific timeout');
        return serviceConfig.endpoints[endpoint];
      }

      // Return service default
      logger.debug({
        service,
        timeout: serviceConfig.default,
      }, 'Using service default timeout');
      return serviceConfig.default;
    }

    // Special handling for payment operations
    if (request.url.includes('/payment') || request.url.includes('/checkout')) {
      return config.timeouts.payment;
    }

    // Special handling for NFT operations
    if (request.url.includes('/nft') || request.url.includes('/mint')) {
      return config.timeouts.nftMinting;
    }

    // Default timeout
    return config.timeouts.default;
  }

  // Create a timeout controller for cascading timeouts
  createTimeoutController(totalTimeout: number): TimeoutController {
    return new TimeoutController(totalTimeout);
  }
}

export class TimeoutController {
  private startTime: number;
  private deadline: number;
  private consumed: number = 0;

  constructor(private totalTimeout: number) {
    this.startTime = Date.now();
    this.deadline = this.startTime + totalTimeout;
  }

  getRemaining(): number {
    const now = Date.now();
    return Math.max(0, this.deadline - now);
  }

  allocate(percentage: number): number {
    const remaining = this.getRemaining();
    const allocated = Math.floor(remaining * percentage);
    this.consumed += allocated;
    
    logger.debug({
      totalTimeout: this.totalTimeout,
      remaining,
      allocated,
      consumed: this.consumed,
    }, 'Timeout allocated');

    return allocated;
  }

  hasExpired(): boolean {
    return Date.now() >= this.deadline;
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  getStats() {
    return {
      totalTimeout: this.totalTimeout,
      elapsed: this.getElapsed(),
      remaining: this.getRemaining(),
      consumed: this.consumed,
      deadline: new Date(this.deadline).toISOString(),
    };
  }
}
