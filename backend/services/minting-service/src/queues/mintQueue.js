const Bull = require('bull');
const logger = require('../utils/logger');

let mintQueue;
let retryQueue;

async function initializeQueues() {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };

  // Main minting queue
  mintQueue = new Bull('ticket-minting', { redis: redisConfig });
  
  // Retry queue for failed mints
  retryQueue = new Bull('ticket-minting-retry', { redis: redisConfig });
  
  // Queue event listeners
  mintQueue.on('completed', (job) => {
    logger.info(`✅ Mint completed: ${job.id}`);
  });
  
  mintQueue.on('failed', (job, err) => {
    logger.error(`❌ Mint failed: ${job.id}`, err);
  });
  
  logger.info('✅ Queues initialized');
  
  return { mintQueue, retryQueue };
}

async function addMintJob(ticketData) {
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

module.exports = {
  initializeQueues,
  getMintQueue: () => mintQueue,
  getRetryQueue: () => retryQueue,
  addMintJob
};
