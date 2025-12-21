import { QUEUE_NAMES, PERSISTENCE_TIERS } from './constants';

export interface QueueConfig {
  name: string;
  persistenceTier: string;
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  expireInSeconds: number;
}

export const QUEUE_CONFIGS: Record<string, QueueConfig> = {
  MONEY_QUEUE: {
    name: QUEUE_NAMES.MONEY,
    persistenceTier: PERSISTENCE_TIERS.TIER_1,
    retryLimit: parseInt(process.env.RETRY_PAYMENT || '10'),
    retryDelay: 2000, // 2 seconds initial delay
    retryBackoff: true, // Exponential backoff
    expireInSeconds: 3600 * 24 // 24 hours
  },
  
  COMMUNICATION_QUEUE: {
    name: QUEUE_NAMES.COMMUNICATION,
    persistenceTier: PERSISTENCE_TIERS.TIER_2,
    retryLimit: parseInt(process.env.RETRY_EMAIL || '5'),
    retryDelay: 5000, // 5 seconds initial delay
    retryBackoff: false, // Fixed delay
    expireInSeconds: 3600 * 12 // 12 hours
  },
  
  BACKGROUND_QUEUE: {
    name: QUEUE_NAMES.BACKGROUND,
    persistenceTier: PERSISTENCE_TIERS.TIER_3,
    retryLimit: parseInt(process.env.RETRY_ANALYTICS || '2'),
    retryDelay: 10000, // 10 seconds initial delay
    retryBackoff: false, // Fixed delay
    expireInSeconds: 3600 * 6 // 6 hours
  }
};

// pg-boss connection configuration
export const PG_BOSS_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  schema: 'pgboss', // Use separate schema for pg-boss tables
  noSupervisor: false,
  noScheduling: false,
  deleteAfterDays: 7, // Archive completed jobs after 7 days
  retentionDays: 30, // Keep archived jobs for 30 days
  monitorStateIntervalSeconds: 60,
  archiveCompletedAfterSeconds: 3600 * 24, // Archive after 24 hours
};
