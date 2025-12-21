import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { EmailJobData, JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';

export class EmailProcessor extends BaseWorker<EmailJobData, JobResult> {
  protected name = 'email-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }
  
  protected async execute(job: BullJobData<EmailJobData>): Promise<JobResult> {
    const { to, template, data } = job.data;
    
    // Generate idempotency key (daily uniqueness for emails)
    const idempotencyKey = this.idempotencyService.generateKey(
      'send-email',
      job.data
    );

    // Check if already sent today
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Email already sent today (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Sending email:', {
      to,
      template
    });
    
    try {
      // Acquire rate limit for SendGrid
      await this.rateLimiter.acquire('sendgrid', (job.opts?.priority as number) || 5);
      
      try {
        // TODO: Implement actual SendGrid email sending
        await this.simulateEmailSend();
        
        const result: JobResult = {
          success: true,
          data: {
            messageId: `msg_${Date.now()}`,
            to,
            template,
            sentAt: new Date().toISOString()
          }
        };

        // Store for 24 hours (daily uniqueness)
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue?.name || 'communication',
          job.name || 'send-email',
          result,
          24 * 60 * 60
        );

        return result;
      } finally {
        this.rateLimiter.release('sendgrid');
      }
    } catch (error) {
      logger.error('Email sending failed:', error);
      
      if (error instanceof Error && error.message.includes('Rate limit')) {
        throw error; // Retry with backoff
      }
      
      throw error;
    }
  }
  
  private async simulateEmailSend(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
