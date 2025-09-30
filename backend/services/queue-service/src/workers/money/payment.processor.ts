import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { PaymentJobData, JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';

export class PaymentProcessor extends BaseWorker<PaymentJobData, JobResult> {
  protected name = 'payment-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }
  
  protected async execute(job: Job<PaymentJobData>): Promise<JobResult> {
    const { userId, venueId, eventId, amount, paymentMethod } = job.data;
    
    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'payment-process',
      job.data
    );
    
    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Payment already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }
    
    logger.info('Processing payment:', {
      userId,
      venueId,
      eventId,
      amount,
      idempotencyKey
    });
    
    try {
      // Acquire rate limit for Stripe
      await this.rateLimiter.acquire('stripe', job.opts.priority || 5);
      
      try {
        // TODO: Implement actual Stripe payment processing
        await this.simulatePaymentProcessing();
        
        const result: JobResult = {
          success: true,
          data: {
            transactionId: `txn_${Date.now()}`,
            chargeId: `ch_${Date.now()}`,
            amount,
            status: 'completed',
            processedAt: new Date().toISOString()
          }
        };
        
        // Store result for idempotency (90 days for payments)
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue.name,
          job.name,
          result,
          90 * 24 * 60 * 60 // 90 days in seconds
        );
        
        return result;
      } finally {
        // Always release rate limit
        this.rateLimiter.release('stripe');
      }
    } catch (error) {
      logger.error('Payment processing failed:', error);
      
      // Check if this is a rate limit error
      if (error instanceof Error && error.message.includes('Rate limit')) {
        // Retry with exponential backoff
        throw error;
      }
      
      // Check if this is a retryable error
      if (this.isRetryableError(error)) {
        throw error; // Bull will retry
      }
      
      // Non-retryable error (e.g., card declined)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed'
      };
    }
  }
  
  private async simulatePaymentProcessing(): Promise<void> {
    // Simulate Stripe API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate random failure for testing (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Simulated payment failure');
    }
  }
  
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'api_connection_error',
      'rate_limit_error',
      'Rate limit'
    ];
    
    const errorMessage = error.message || error.code || error.type || '';
    return retryableErrors.some(e => errorMessage.includes(e)) || 
           (error.statusCode && error.statusCode >= 500);
  }
}
