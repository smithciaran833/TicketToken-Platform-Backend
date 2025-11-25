import logger from './logger';

/**
 * BLOCKCHAIN RETRY UTILITY
 * 
 * Handles retry logic for blockchain operations with exponential backoff
 */

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'timeout',
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    '429', // Rate limit
    '503', // Service unavailable
    '504', // Gateway timeout
  ]
};

function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  const errorMessage = error.message.toLowerCase();
  return retryableErrors.some(pattern => 
    errorMessage.includes(pattern.toLowerCase())
  );
}

function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a blockchain operation with retry logic
 */
export async function retryBlockchainOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      logger.debug(`Attempting ${operationName} (attempt ${attempt}/${cfg.maxAttempts})`);
      
      const result = await operation();
      
      if (attempt > 1) {
        logger.info(`${operationName} succeeded after ${attempt} attempts`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error as Error;
      
      const isLastAttempt = attempt === cfg.maxAttempts;
      const shouldRetry = isRetryableError(lastError, cfg.retryableErrors);
      
      if (isLastAttempt || !shouldRetry) {
        logger.error({
          operation: operationName,
          attempt,
          maxAttempts: cfg.maxAttempts,
          error: lastError.message,
          retryable: shouldRetry
        }, `${operationName} failed ${isLastAttempt ? 'after all retries' : '(non-retryable error)'}`);
        throw lastError;
      }
      
      const delayMs = calculateDelay(
        attempt,
        cfg.initialDelayMs,
        cfg.maxDelayMs,
        cfg.backoffMultiplier
      );
      
      logger.warn({
        operation: operationName,
        attempt,
        maxAttempts: cfg.maxAttempts,
        error: lastError.message,
        nextRetryInMs: delayMs
      }, `${operationName} failed, retrying...`);
      
      await sleep(delayMs);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Poll for blockchain transaction confirmation
 */
export async function pollForConfirmation(
  checkFn: () => Promise<boolean>,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<boolean> {
  const maxAttempts = options.maxAttempts || 30;
  const intervalMs = options.intervalMs || 2000;
  const timeoutMs = options.timeoutMs || 60000;
  
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      logger.warn('Transaction confirmation polling timed out');
      return false;
    }
    
    try {
      const confirmed = await checkFn();
      
      if (confirmed) {
        logger.info(`Transaction confirmed after ${attempt} attempts`);
        return true;
      }
      
      if (attempt < maxAttempts) {
        await sleep(intervalMs);
      }
      
    } catch (error) {
      logger.warn({
        attempt,
        error: (error as Error).message
      }, 'Error during confirmation polling');
      
      if (attempt < maxAttempts) {
        await sleep(intervalMs);
      }
    }
  }
  
  logger.warn('Transaction not confirmed after maximum attempts');
  return false;
}
