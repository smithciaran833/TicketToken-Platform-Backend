/**
 * Queue Configuration for Blockchain Service
 * 
 * AUDIT FIX #73: Uses centralized Redis config with TLS support
 */

import { getBullMQRedisOptions, isTlsEnabled } from './redis';
import { logger } from '../utils/logger';

interface BackoffConfig {
  type: string;
  delay: number;
}

interface DefaultJobOptions {
  removeOnComplete: number;
  removeOnFail: number;
  attempts: number;
  backoff: BackoffConfig;
}

interface RateLimit {
  max: number;
  duration: number;
}

interface QueueConfig {
  concurrency: number;
  rateLimit: RateLimit;
}

interface QueuesConfig {
  'nft-minting': QueueConfig;
  'nft-transfer': QueueConfig;
  'nft-burn': QueueConfig;
}

interface QueueConfiguration {
  redis: ReturnType<typeof getBullMQRedisOptions>;
  defaultJobOptions: DefaultJobOptions;
  queues: QueuesConfig;
}

// Build configuration
function buildQueueConfig(): QueueConfiguration {
  // Get Redis options from centralized config (includes TLS)
  const redisOptions = getBullMQRedisOptions();
  
  logger.info('Queue configuration initialized', {
    redisHost: redisOptions.host,
    redisPort: redisOptions.port,
    tlsEnabled: isTlsEnabled(),
    hasPassword: !!redisOptions.password
  });

  return {
    // AUDIT FIX #73: Use centralized Redis config with TLS
    redis: redisOptions,
    
    defaultJobOptions: {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500,     // Keep last 500 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    },
    
    queues: {
      'nft-minting': {
        concurrency: 5,
        rateLimit: {
          max: 10,
          duration: 1000 // 10 operations per second
        }
      },
      'nft-transfer': {
        concurrency: 10,
        rateLimit: {
          max: 20,
          duration: 1000
        }
      },
      'nft-burn': {
        concurrency: 3,
        rateLimit: {
          max: 5,
          duration: 1000
        }
      }
    }
  };
}

const queueConfig = buildQueueConfig();

export default queueConfig;
