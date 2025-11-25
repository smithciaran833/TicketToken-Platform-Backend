import MintQueue from './mintQueue';
import { BaseQueue } from './baseQueue';
import { logger } from '../utils/logger';

interface Queues {
  [key: string]: BaseQueue;
  minting?: MintQueue;
}

class QueueManager {
  private queues: Queues;
  private initialized: boolean;

  constructor() {
    this.queues = {};
    this.initialized = false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing queue system...');

    // Initialize NFT minting queue
    this.queues.minting = new MintQueue();

    // Future queues can be added here:
    // this.queues.transfer = new TransferQueue();
    // this.queues.burn = new BurnQueue();

    this.initialized = true;
    logger.info('Queue system initialized', { 
      queues: Object.keys(this.queues) 
    });
  }

  getMintQueue(): MintQueue {
    if (!this.initialized) {
      throw new Error('Queue system not initialized. Call initialize() first.');
    }
    return this.queues.minting as MintQueue;
  }

  async getStats(): Promise<any> {
    const stats: any = {};
    for (const [name, queue] of Object.entries(this.queues)) {
      stats[name] = await queue.getQueueStats();
    }
    return stats;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down queue system...');
    for (const queue of Object.values(this.queues)) {
      await queue.close();
    }
    this.initialized = false;
    logger.info('Queue system shut down');
  }
}

// Export singleton instance
export default new QueueManager();
