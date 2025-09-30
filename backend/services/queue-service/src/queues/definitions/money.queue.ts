import { Queue } from 'bull';
import { QueueFactory } from '../factories/queue.factory';
import { PaymentProcessor } from '../../workers/money/payment.processor';
import { RefundProcessor } from '../../workers/money/refund.processor';
import { NFTMintProcessor } from '../../workers/money/nft-mint.processor';
import { JOB_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';

export class MoneyQueue {
  private queue: Queue;
  private paymentProcessor: PaymentProcessor;
  private refundProcessor: RefundProcessor;
  private nftMintProcessor: NFTMintProcessor;
  
  constructor() {
    this.queue = QueueFactory.getQueue('money');
    this.paymentProcessor = new PaymentProcessor();
    this.refundProcessor = new RefundProcessor();
    this.nftMintProcessor = new NFTMintProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    // Payment processing
    this.queue.process(JOB_TYPES.PAYMENT_PROCESS, async (job) => {
      return await this.paymentProcessor.process(job);
    });
    
    // Refund processing
    this.queue.process(JOB_TYPES.REFUND_PROCESS, async (job) => {
      return await this.refundProcessor.process(job);
    });
    
    // NFT minting
    this.queue.process(JOB_TYPES.NFT_MINT, async (job) => {
      return await this.nftMintProcessor.process(job);
    });
    
    logger.info('Money queue processors initialized (payment, refund, nft)');
  }
  
  getQueue(): Queue {
    return this.queue;
  }
}
