import { QueueConfig } from '../types/queue.types';
import { QUEUE_NAMES, PERSISTENCE_TIERS } from './constants';

export const QUEUE_CONFIGS: Record<string, QueueConfig> = {
  MONEY_QUEUE: {
    name: QUEUE_NAMES.MONEY,
    persistenceTier: PERSISTENCE_TIERS.TIER_1,
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 1 // Separate DB for critical jobs
    },
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: false, // Keep for audit
      removeOnFail: false
    }
  },
  
  COMMUNICATION_QUEUE: {
    name: QUEUE_NAMES.COMMUNICATION,
    persistenceTier: PERSISTENCE_TIERS.TIER_2,
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 2
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'fixed',
        delay: 5000
      },
      removeOnComplete: 100, // Keep last 100
      removeOnFail: false
    }
  },
  
  BACKGROUND_QUEUE: {
    name: QUEUE_NAMES.BACKGROUND,
    persistenceTier: PERSISTENCE_TIERS.TIER_3,
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 3
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 10000
      },
      removeOnComplete: true,
      removeOnFail: true
    }
  }
};
