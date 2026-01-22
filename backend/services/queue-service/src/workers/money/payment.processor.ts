import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { PaymentJobData, JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';
import { getPaymentServiceClient } from '../../clients';
import { createRequestContext } from '@tickettoken/shared';

export class PaymentProcessor extends BaseWorker<PaymentJobData, JobResult> {
  protected name = 'payment-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }
  
  protected async execute(job: BullJobData<PaymentJobData>): Promise<JobResult> {
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
      await this.rateLimiter.acquire('stripe', (job.opts?.priority as number) || 5);
      
      try {
        // Call payment-service to process actual payment via Stripe
        const paymentResponse = await this.processPaymentViaService(job.data, idempotencyKey);
        
        const result: JobResult = {
          success: true,
          data: paymentResponse
        };
        
        // Store result for idempotency (90 days for payments)
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue?.name || 'money',
          job.name || 'payment-process',
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
  
  private async processPaymentViaService(data: PaymentJobData, idempotencyKey: string): Promise<any> {
    try {
      // Use HMAC-authenticated client from shared library
      const paymentClient = getPaymentServiceClient();
      const ctx = createRequestContext({
        tenantId: data.venueId, // Use venueId as tenant context
        serviceName: 'queue-service',
      });

      const response = await paymentClient.processPayment({
        userId: data.userId,
        venueId: data.venueId,
        eventId: data.eventId,
        amount: data.amount,
        currency: data.currency || 'USD',
        paymentMethod: data.paymentMethod,
        idempotencyKey
      }, ctx);

      return response;
    } catch (error: any) {
      logger.error('Payment service call failed:', {
        error: error.message,
        statusCode: error.statusCode,
      });

      throw error;
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
