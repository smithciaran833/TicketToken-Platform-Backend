/**
 * Retry Strategies Configuration
 * 
 * Defines retry behavior for different job types
 * All strategies are configurable via environment variables
 */

// Backoff configuration (compatible with both Bull and pg-boss)
export interface BackoffOptions {
  type: 'exponential' | 'fixed';
  delay: number;
}

export interface RetryStrategy {
  attempts: number;
  backoff: BackoffOptions;
  description: string;
}

export const RETRY_STRATEGIES: Record<string, RetryStrategy> = {
  // Money queue jobs
  'payment-process': {
    attempts: parseInt(process.env.RETRY_PAYMENT || '10'),
    backoff: { type: 'exponential', delay: 2000 },
    description: 'Critical payment processing - aggressive retries'
  },
  
  'refund-process': {
    attempts: parseInt(process.env.RETRY_REFUND || '10'),
    backoff: { type: 'exponential', delay: 2000 },
    description: 'Refund processing - must succeed'
  },
  
  'payout-process': {
    attempts: parseInt(process.env.RETRY_PAYOUT || '8'),
    backoff: { type: 'exponential', delay: 3000 },
    description: 'Venue payouts - critical but less time-sensitive'
  },
  
  // Blockchain jobs
  'nft-mint': {
    attempts: parseInt(process.env.RETRY_NFT_MINT || '5'),
    backoff: { type: 'exponential', delay: 5000 },
    description: 'NFT minting - expensive operation, moderate retries'
  },
  
  'nft-transfer': {
    attempts: parseInt(process.env.RETRY_NFT_MINT || '5'),
    backoff: { type: 'exponential', delay: 5000 },
    description: 'NFT transfer - similar to minting'
  },
  
  // Communication jobs
  'send-email': {
    attempts: parseInt(process.env.RETRY_EMAIL || '5'),
    backoff: { type: 'fixed', delay: 5000 },
    description: 'Email delivery - moderate retries with fixed delay'
  },
  
  'send-sms': {
    attempts: parseInt(process.env.RETRY_SMS || '3'),
    backoff: { type: 'fixed', delay: 10000 },
    description: 'SMS delivery - fewer retries to avoid spam'
  },
  
  // Background jobs
  'analytics-event': {
    attempts: parseInt(process.env.RETRY_ANALYTICS || '2'),
    backoff: { type: 'fixed', delay: 10000 },
    description: 'Analytics tracking - best effort'
  },
  
  'report-generation': {
    attempts: parseInt(process.env.RETRY_ANALYTICS || '2'),
    backoff: { type: 'fixed', delay: 15000 },
    description: 'Report generation - can be delayed'
  },
  
  'cache-warming': {
    attempts: 1,
    backoff: { type: 'fixed', delay: 0 },
    description: 'Cache warming - no retries needed'
  }
};

/**
 * Get retry strategy for a job type
 */
export function getRetryStrategy(jobType: string): RetryStrategy {
  return RETRY_STRATEGIES[jobType] || {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    description: 'Default retry strategy'
  };
}

/**
 * Get all configured retry strategies
 */
export function getAllRetryStrategies(): Record<string, RetryStrategy> {
  return { ...RETRY_STRATEGIES };
}

/**
 * Validate retry strategies
 */
export function validateRetryStrategies(): void {
  for (const [jobType, strategy] of Object.entries(RETRY_STRATEGIES)) {
    if (strategy.attempts < 0 || strategy.attempts > 50) {
      console.warn(`Warning: Unusual retry attempt count for ${jobType}: ${strategy.attempts}`);
    }
    
    if (strategy.backoff.delay && (strategy.backoff.delay < 0 || strategy.backoff.delay > 300000)) {
      console.warn(`Warning: Unusual backoff delay for ${jobType}: ${strategy.backoff.delay}ms`);
    }
  }
}

// Validate on import
validateRetryStrategies();
