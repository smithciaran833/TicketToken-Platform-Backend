import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface AnalyticsJobData {
  eventType: string;
  venueId?: string;
  userId?: string;
  eventId?: string;
  data: Record<string, any>;
  timestamp: string;
}

export class AnalyticsProcessor extends BaseWorker<AnalyticsJobData, JobResult> {
  protected name = 'analytics-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<AnalyticsJobData>): Promise<JobResult> {
    const { eventType, venueId, userId, eventId, data, timestamp } = job.data;

    // ISSUE #30 FIX: Generate idempotency key for analytics events
    const idempotencyKey = this.idempotencyService.generateKey(
      'analytics-event',
      {
        eventType,
        venueId,
        userId,
        eventId,
        timestamp: timestamp || new Date().toISOString()
      }
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Analytics event already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing analytics event:', {
      eventType,
      venueId,
      userId,
      eventId
    });

    try {
      // TODO: Send to actual analytics service (Mixpanel, Segment, etc)
      await this.simulateAnalyticsProcessing();

      const result: JobResult = {
        success: true,
        data: {
          eventType,
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (7 days for analytics)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        7 * 24 * 60 * 60
      );

      return result;
    } catch (error) {
      logger.error('Analytics processing failed:', error);
      throw error;
    }
  }

  private async simulateAnalyticsProcessing(): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
