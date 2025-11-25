import Bull, { Queue, Job } from 'bull';
import logger from '../utils/logger';

let mintQueue: Queue | null = null;
let retryQueue: Queue | null = null;

interface TicketData {
  ticketId: string;
  orderId?: string;
  eventId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export async function initializeQueues(): Promise<{
  mintQueue: Queue;
  retryQueue: Queue;
}> {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
  };

  // Main minting queue
  mintQueue = new Bull('ticket-minting', { redis: redisConfig });

  // Retry queue for failed mints
  retryQueue = new Bull('ticket-minting-retry', { redis: redisConfig });

  // Queue event listeners
  mintQueue.on('completed', (job: Job) => {
    logger.info(`✅ Mint completed: ${job.id}`);
  });

  mintQueue.on('failed', (job: Job, err: Error) => {
    logger.error(`❌ Mint failed: ${job.id}`, err);
  });

  logger.info('✅ Queues initialized');

  return { mintQueue, retryQueue };
}

export async function addMintJob(ticketData: TicketData): Promise<Job> {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }

  const job = await mintQueue.add('mint-ticket', ticketData, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: false,
    removeOnFail: false
  });

  logger.info(`📝 Added mint job: ${job.id} for ticket ${ticketData.ticketId}`);
  return job;
}

export function getMintQueue(): Queue {
  if (!mintQueue) {
    throw new Error('Mint queue not initialized');
  }
  return mintQueue;
}

export function getRetryQueue(): Queue {
  if (!retryQueue) {
    throw new Error('Retry queue not initialized');
  }
  return retryQueue;
}
