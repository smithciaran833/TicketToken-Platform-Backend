import { createLogger } from '../utils/logger';
import { RetryOptions } from '../types';

const logger = createLogger('retry-service');

export class RetryService {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      multiplier = 2,
      jitter = true,
      retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({ attempt, maxRetries }, 'Executing function');
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error, attempt, maxRetries, retryableErrors)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, {
          baseDelay,
          maxDelay,
          multiplier,
          jitter,
        });

        logger.warn({
          attempt,
          maxRetries,
          delay,
          error: (error as any).message,
        }, `Retry attempt ${attempt}/${maxRetries} in ${delay}ms`);

        await this.sleep(delay);
      }
    }

    logger.error({
      attempts: maxRetries,
      error: lastError?.message,
    }, 'All retry attempts exhausted');

    throw lastError;
  }

  private shouldRetry(
    error: any,
    attempt: number,
    maxRetries: number,
    retryableErrors: string[]
  ): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= maxRetries) {
      return false;
    }

    // Don't retry on client errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      logger.debug({ statusCode: error.response.status }, 'Client error, not retrying');
      return false;
    }

    // Check if error code is retryable
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Retry on server errors (5xx)
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on timeout errors
    if ((error as any).message && (error as any).message.includes('timeout')) {
      return true;
    }

    return false;
  }

  private calculateDelay(
    attempt: number,
    config: {
      baseDelay: number;
      maxDelay: number;
      multiplier: number;
      jitter: boolean;
    }
  ): number {
    // Exponential backoff
    let delay = Math.min(
      config.baseDelay * Math.pow(config.multiplier, attempt - 1),
      config.maxDelay
    );

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      const randomJitter = (Math.random() * 2 - 1) * jitterAmount;
      delay = Math.round(delay + randomJitter);
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Service-specific retry configurations
  getServiceRetryConfig(service: string): RetryOptions {
    const configs: Record<string, RetryOptions> = {
      'nft-service': {
        maxRetries: 5,
        baseDelay: 5000,
        maxDelay: 600000, // 10 minutes
        multiplier: 2.5,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GAS_PRICE_HIGH'],
      },
      'payment-service': {
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 60000, // 1 minute
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GATEWAY_TIMEOUT'],
      },
      'ticket-service': {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
      },
    };

    return configs[service] || {};
  }
}
