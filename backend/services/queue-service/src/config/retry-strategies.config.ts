export interface RetryStrategy {
  type: 'fixed' | 'exponential' | 'linear';
  attempts: number;
  delay: number;
  maxDelay?: number;
  factor?: number;
}

export const RETRY_STRATEGIES: Record<string, RetryStrategy> = {
  'payment': {
    type: 'exponential',
    attempts: 5,
    delay: 1000,
    maxDelay: 60000,
    factor: 2
  },
  'email': {
    type: 'exponential',
    attempts: 3,
    delay: 5000,
    maxDelay: 30000,
    factor: 2
  },
  'webhook': {
    type: 'exponential',
    attempts: 5,
    delay: 2000,
    maxDelay: 120000,
    factor: 3
  },
  'minting': {
    type: 'linear',
    attempts: 10,
    delay: 30000
  },
  'default': {
    type: 'exponential',
    attempts: 3,
    delay: 1000,
    maxDelay: 10000,
    factor: 2
  }
};

export function getRetryStrategy(jobType: string): RetryStrategy {
  const strategy = jobType.split('.')[0];
  return RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.default;
}

export function calculateBackoff(attempt: number, strategy: RetryStrategy): number {
  switch (strategy.type) {
    case 'fixed':
      return strategy.delay;
    case 'linear':
      return strategy.delay * attempt;
    case 'exponential':
      const delay = strategy.delay * Math.pow(strategy.factor || 2, attempt - 1);
      return Math.min(delay, strategy.maxDelay || delay);
  }
}
