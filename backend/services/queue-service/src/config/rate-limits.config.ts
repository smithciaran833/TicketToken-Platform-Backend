export interface RateLimitConfig {
  maxPerSecond: number;
  maxConcurrent: number;
  burstSize?: number;
  cooldownMs?: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Payment providers
  stripe: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_STRIPE || '25'),
    maxConcurrent: 10,
    burstSize: 50,
    cooldownMs: 1000
  },
  square: {
    maxPerSecond: 8,
    maxConcurrent: 5,
    burstSize: 20,
    cooldownMs: 2000
  },
  
  // Communication providers
  sendgrid: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SENDGRID || '5'),
    maxConcurrent: 20,
    burstSize: 100,
    cooldownMs: 1000
  },
  twilio: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_TWILIO || '1'),
    maxConcurrent: 5,
    burstSize: 10,
    cooldownMs: 5000
  },
  
  // Blockchain
  solana: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SOLANA || '10'),
    maxConcurrent: 5,
    burstSize: 30,
    cooldownMs: 1000
  },
  
  // Accounting
  quickbooks: {
    maxPerSecond: 2,
    maxConcurrent: 3,
    burstSize: 10,
    cooldownMs: 3000
  },
  
  // Internal APIs (higher limits)
  internal: {
    maxPerSecond: 100,
    maxConcurrent: 50,
    burstSize: 200,
    cooldownMs: 100
  }
};

// Rate limit groups (providers that share limits)
export const RATE_LIMIT_GROUPS: Record<string, string[]> = {
  twilio: ['twilio-sms', 'twilio-voice', 'twilio-verify'],
  stripe: ['stripe-charges', 'stripe-refunds', 'stripe-payouts'],
  sendgrid: ['sendgrid-transactional', 'sendgrid-marketing']
};
