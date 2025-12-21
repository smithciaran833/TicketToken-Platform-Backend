import PgBoss from 'pg-boss';
import { QueueFactory } from '../factories/queue.factory';
import { PaymentProcessor } from '../../workers/money/payment.processor';
import { RefundProcessor } from '../../workers/money/refund.processor';
import { NFTMintProcessor } from '../../workers/money/nft-mint.processor';
import { JOB_TYPES } from '../../config/constants';
import { QUEUE_CONFIGS } from '../../config/queues.config';
import { logger } from '../../utils/logger';

export class MoneyQueue {
  private boss: PgBoss;
  private paymentProcessor: PaymentProcessor;
  private refundProcessor: RefundProcessor;
  private nftMintProcessor: NFTMintProcessor;
  private config = QUEUE_CONFIGS.MONEY_QUEUE;
  
  constructor() {
    this.boss = QueueFactory.getBoss();
    this.paymentProcessor = new PaymentProcessor();
    this.refundProcessor = new RefundProcessor();
    this.nftMintProcessor = new NFTMintProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    // Payment processing
    this.boss.work(JOB_TYPES.PAYMENT_PROCESS, async (job: any) => {
      try {
        const result = await this.paymentProcessor.process({ data: job.data } as any);
        return result;
      } catch (error) {
        logger.error('Payment job failed:', error);
        throw error;
      }
    });
    
    // Refund processing
    this.boss.work(JOB_TYPES.REFUND_PROCESS, async (job: any) => {
      try {
        const result = await this.refundProcessor.process({ data: job.data } as any);
        return result;
      } catch (error) {
        logger.error('Refund job failed:', error);
        throw error;
      }
    });
    
    // NFT minting
    this.boss.work(JOB_TYPES.NFT_MINT, async (job: any) => {
      try {
        const result = await this.nftMintProcessor.process({ data: job.data } as any);
        return result;
      } catch (error) {
        logger.error('NFT mint job failed:', error);
        throw error;
      }
    });
    
    logger.info('Money queue processors initialized (payment, refund, nft)');
  }
  
  async addJob(jobType: string, data: any, options: any = {}): Promise<string | null> {
    try {
      const jobId = await this.boss.send(
        jobType,
        data,
        {
          retryLimit: this.config.retryLimit,
          retryDelay: this.config.retryDelay,
          retryBackoff: this.config.retryBackoff,
          expireInSeconds: this.config.expireInSeconds,
          ...options
        }
      );
      
      logger.info(`Job added to money queue: ${jobType} (${jobId})`);
      return jobId;
    } catch (error) {
      logger.error(`Failed to add job to money queue: ${jobType}`, error);
      throw error;
    }
  }
  
  getBoss(): PgBoss {
    return this.boss;
  }
}
