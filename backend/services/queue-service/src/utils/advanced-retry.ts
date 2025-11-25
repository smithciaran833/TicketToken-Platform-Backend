import { Job } from 'bull';
import { logger } from './logger';

/**
 * Advanced Retry Strategies
 * Sophisticated retry logic with multiple backoff strategies
 */

export interface RetryConfig {
  maxAttempts: number;
  strategy: 'exponential' | 'linear' | 'fibonacci' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay?: number; // milliseconds
  jitter?: boolean; // Add randomness to prevent thundering herd
}

export interface RetryResult {
  shouldRetry: boolean;
  delay: number;
  reason?: string;
}

/**
 * Calculate retry delay based on strategy
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: RetryConfig
): number {
  let delay: number;

  switch (config.strategy) {
    case 'exponential':
      // 2^attempt * baseDelay
      delay = Math.pow(2, attemptNumber) * config.baseDelay;
      break;

    case 'linear':
      // attempt * baseDelay
      delay = attemptNumber * config.baseDelay;
      break;

    case 'fibonacci':
      // Fibonacci sequence * baseDelay
      delay = fibonacci(attemptNumber) * config.baseDelay;
      break;

    case 'fixed':
    default:
      // Fixed delay
      delay = config.baseDelay;
      break;
  }

  // Apply max delay cap if configured
  if (config.maxDelay) {
    delay = Math.min(delay, config.maxDelay);
  }

  // Add jitter if configured (±25% randomness)
  if (config.jitter) {
    const jitterAmount = delay * 0.25;
    const randomJitter = (Math.random() * 2 - 1) * jitterAmount;
    delay = Math.max(0, delay + randomJitter);
  }

  return Math.floor(delay);
}

/**
 * Fibonacci sequence calculator
 */
function fibonacci(n: number): number {
  if (n <= 1) return 1;
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

/**
 * Determine if job should be retried
 */
export function shouldRetryJob(
  job: Job,
  error: Error,
  config: RetryConfig
): RetryResult {
  const attemptNumber = job.attemptsMade + 1;

  // Check if max attempts reached
  if (attemptNumber >= config.maxAttempts) {
    return {
      shouldRetry: false,
      delay: 0,
      reason: `Max retry attempts (${config.maxAttempts}) reached`,
    };
  }

  // Check for non-retryable errors
  if (isNonRetryableError(error)) {
    return {
      shouldRetry: false,
      delay: 0,
      reason: `Non-retryable error: ${error.message}`,
    };
  }

  // Calculate delay for next retry
  const delay = calculateRetryDelay(attemptNumber, config);

  logger.info('Job will be retried', {
    jobId: job.id,
    attemptNumber,
    maxAttempts: config.maxAttempts,
    delay,
    strategy: config.strategy,
    error: error.message,
  });

  return {
    shouldRetry: true,
    delay,
  };
}

/**
 * Check if error is non-retryable
 * These errors indicate permanent failures that won't be fixed by retrying
 */
function isNonRetryableError(error: Error): boolean {
  const nonRetryablePatterns = [
    /invalid.*credentials/i,
    /authentication.*failed/i,
    /unauthorized/i,
    /forbidden/i,
    /not.*found/i,
    /invalid.*request/i,
    /bad.*request/i,
    /validation.*error/i,
    /invalid.*format/i,
    /malformed/i,
  ];

  const errorMessage = error.message.toLowerCase();
  return nonRetryablePatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Retry configuration presets for different job types
 */
export const RetryPresets = {
  // For payment processing - aggressive retries
  payment: {
    maxAttempts: 5,
    strategy: 'exponential' as const,
    baseDelay: 1000, // 1 second
    maxDelay: 60000, // 1 minute
    jitter: true,
  },

  // For NFT minting - moderate retries with longer delays
  nftMinting: {
    maxAttempts: 3,
    strategy: 'exponential' as const,
    baseDelay: 5000, // 5 seconds
    maxDelay: 300000, // 5 minutes
    jitter: true,
  },

  // For email notifications - linear retries
  notification: {
    maxAttempts: 3,
    strategy: 'linear' as const,
    baseDelay: 2000, // 2 seconds
    maxDelay: 10000, // 10 seconds
    jitter: false,
  },

  // For webhooks - fibonacci with jitter
  webhook: {
    maxAttempts: 4,
    strategy: 'fibonacci' as const,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    jitter: true,
  },

  // Default fallback
  default: {
    maxAttempts: 3,
    strategy: 'exponential' as const,
    baseDelay: 2000, // 2 seconds
    maxDelay: 60000, // 1 minute
    jitter: true,
  },
};

/**
 * Log retry metrics for monitoring
 */
export function logRetryMetrics(job: Job, retryResult: RetryResult): void {
  const metrics = {
    jobId: job.id,
    queueName: job.queue.name,
    attemptsMade: job.attemptsMade,
    shouldRetry: retryResult.shouldRetry,
    delay: retryResult.delay,
    reason: retryResult.reason,
    timestamp: new Date().toISOString(),
  };

  if (retryResult.shouldRetry) {
    logger.info('Job scheduled for retry', metrics);
  } else {
    logger.warn('Job will not be retried', metrics);
  }
}

/**
 * Get retry config for job type
 */
export function getRetryConfig(jobType: string): RetryConfig {
  switch (jobType) {
    case 'payment':
      return RetryPresets.payment;
    case 'refund':
      return RetryPresets.payment; // Same as payment
    case 'mint':
      return RetryPresets.nftMinting;
    case 'email':
      return RetryPresets.notification;
    case 'webhook':
      return RetryPresets.webhook;
    default:
      return RetryPresets.default;
  }
}
