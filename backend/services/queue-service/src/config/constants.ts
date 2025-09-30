export const QUEUE_NAMES = {
  MONEY: 'money-queue',
  COMMUNICATION: 'communication-queue',
  BACKGROUND: 'background-queue'
} as const;

export const QUEUE_PRIORITIES = {
  CRITICAL: 10,
  HIGH: 7,
  NORMAL: 5,
  LOW: 3,
  BACKGROUND: 1
} as const;

export const JOB_TYPES = {
  // Money queue jobs
  PAYMENT_PROCESS: 'payment-process',
  REFUND_PROCESS: 'refund-process',
  PAYOUT_PROCESS: 'payout-process',
  NFT_MINT: 'nft-mint',
  
  // Communication queue jobs
  SEND_EMAIL: 'send-email',
  SEND_SMS: 'send-sms',
  SEND_PUSH: 'send-push',
  
  // Background queue jobs
  ANALYTICS_TRACK: 'analytics-track',
  CLEANUP_OLD_DATA: 'cleanup-old-data',
  GENERATE_REPORT: 'generate-report'
} as const;

export const PERSISTENCE_TIERS = {
  TIER_1: 'TIER_1', // PostgreSQL + Redis AOF
  TIER_2: 'TIER_2', // Redis RDB
  TIER_3: 'TIER_3'  // Memory only
} as const;
