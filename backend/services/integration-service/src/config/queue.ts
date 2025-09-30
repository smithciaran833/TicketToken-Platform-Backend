import Bull from 'bull';
import { logger } from '../utils/logger';

const redisConfig = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
};

export const queues = {
  critical: new Bull('integration-critical', { redis: redisConfig }),
  high: new Bull('integration-high', { redis: redisConfig }),
  normal: new Bull('integration-normal', { redis: redisConfig }),
  low: new Bull('integration-low', { redis: redisConfig })
};

export async function initializeQueues() {
  Object.entries(queues).forEach(([priority, queue]) => {
    queue.on('completed', (job) => {
      logger.info(`Job completed in ${priority} queue`, { jobId: job.id });
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job failed in ${priority} queue`, { jobId: job.id, error: err.message });
    });
  });

  logger.info('Queues initialized');
}
