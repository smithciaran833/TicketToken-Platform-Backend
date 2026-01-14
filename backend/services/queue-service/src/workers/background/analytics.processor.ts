import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';
import axios from 'axios';

// Analytics provider configurations
const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY;
const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;
const INTERNAL_ANALYTICS_URL = process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3000';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

interface AnalyticsJobData {
  eventType: string;
  venueId?: string;
  userId?: string;
  eventId?: string;
  tenantId?: string;
  data: Record<string, any>;
  timestamp: string;
}

interface AnalyticsResult {
  segment?: { success: boolean; error?: string };
  mixpanel?: { success: boolean; error?: string };
  internal?: { success: boolean; error?: string };
}

export class AnalyticsProcessor extends BaseWorker<AnalyticsJobData, JobResult> {
  protected name = 'analytics-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }

  protected async execute(job: BullJobData<AnalyticsJobData>): Promise<JobResult> {
    const { eventType, venueId, userId, eventId, tenantId, data, timestamp } = job.data;

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
      eventId,
      tenantId
    });

    try {
      // Process analytics in parallel to multiple destinations
      const results = await this.sendToAnalyticsProviders({
        eventType,
        venueId,
        userId,
        eventId,
        tenantId,
        data,
        timestamp
      });

      const allSuccessful = Object.values(results).every(r => r?.success);

      const result: JobResult = {
        success: allSuccessful,
        data: {
          eventType,
          destinations: results,
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (7 days for analytics)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue?.name || 'background',
        job.name || 'analytics-event',
        result,
        7 * 24 * 60 * 60
      );

      logger.info('Analytics event processed', {
        eventType,
        results: Object.fromEntries(
          Object.entries(results).map(([k, v]) => [k, v?.success])
        )
      });

      return result;
    } catch (error) {
      logger.error('Analytics processing failed:', error);
      throw error;
    }
  }

  /**
   * Send event to all configured analytics providers
   */
  private async sendToAnalyticsProviders(event: AnalyticsJobData): Promise<AnalyticsResult> {
    const results: AnalyticsResult = {};

    // Send to all providers in parallel
    const promises: Promise<void>[] = [];

    // Segment
    if (SEGMENT_WRITE_KEY) {
      promises.push(
        this.sendToSegment(event)
          .then(success => { results.segment = { success }; })
          .catch(error => { results.segment = { success: false, error: error.message }; })
      );
    }

    // Mixpanel
    if (MIXPANEL_TOKEN) {
      promises.push(
        this.sendToMixpanel(event)
          .then(success => { results.mixpanel = { success }; })
          .catch(error => { results.mixpanel = { success: false, error: error.message }; })
      );
    }

    // Internal Analytics Service (always send)
    promises.push(
      this.sendToInternalAnalytics(event)
        .then(success => { results.internal = { success }; })
        .catch(error => { results.internal = { success: false, error: error.message }; })
    );

    await Promise.all(promises);

    return results;
  }

  /**
   * Send event to Segment
   */
  private async sendToSegment(event: AnalyticsJobData): Promise<boolean> {
    const { eventType, userId, venueId, eventId, tenantId, data, timestamp } = event;

    // Build Segment track payload
    const payload: any = {
      event: eventType,
      timestamp: timestamp || new Date().toISOString(),
      properties: {
        ...data,
        venueId,
        eventId,
        tenantId
      },
      context: {
        library: {
          name: 'tickettoken-queue',
          version: '1.0.0'
        }
      }
    };

    // Add userId or anonymousId
    if (userId) {
      payload.userId = userId;
    } else {
      payload.anonymousId = venueId || `anon_${Date.now()}`;
    }

    try {
      await this.rateLimiter.acquire('segment', 5);

      try {
        const response = await axios.post(
          'https://api.segment.io/v1/track',
          payload,
          {
            auth: {
              username: SEGMENT_WRITE_KEY!,
              password: ''
            },
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );

        return response.status === 200;
      } finally {
        this.rateLimiter.release('segment');
      }
    } catch (error: any) {
      logger.error('Segment tracking failed:', {
        eventType,
        status: error.response?.status,
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Send event to Mixpanel
   */
  private async sendToMixpanel(event: AnalyticsJobData): Promise<boolean> {
    const { eventType, userId, venueId, eventId, tenantId, data, timestamp } = event;

    // Build Mixpanel event payload
    const payload = {
      event: eventType,
      properties: {
        token: MIXPANEL_TOKEN,
        distinct_id: userId || venueId || `anon_${Date.now()}`,
        time: new Date(timestamp || Date.now()).getTime() / 1000,
        venue_id: venueId,
        event_id: eventId,
        tenant_id: tenantId,
        ...data
      }
    };

    try {
      await this.rateLimiter.acquire('mixpanel', 5);

      try {
        // Base64 encode the payload
        const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64');

        const response = await axios.get(
          `https://api.mixpanel.com/track`,
          {
            params: { data: encodedData },
            timeout: 5000
          }
        );

        return response.data === 1;
      } finally {
        this.rateLimiter.release('mixpanel');
      }
    } catch (error: any) {
      logger.error('Mixpanel tracking failed:', {
        eventType,
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Send event to internal analytics service
   */
  private async sendToInternalAnalytics(event: AnalyticsJobData): Promise<boolean> {
    const { eventType, userId, venueId, eventId, tenantId, data, timestamp } = event;

    // Build internal analytics payload
    const payload = {
      eventType,
      timestamp: timestamp || new Date().toISOString(),
      userId,
      venueId,
      eventId,
      tenantId,
      properties: data,
      source: 'queue-service'
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Add internal service authentication if configured
      if (INTERNAL_SERVICE_KEY) {
        headers['X-Internal-Service-Key'] = INTERNAL_SERVICE_KEY;
      }
      if (tenantId) {
        headers['X-Tenant-ID'] = tenantId;
      }

      const response = await axios.post(
        `${INTERNAL_ANALYTICS_URL}/api/v1/events/track`,
        payload,
        {
          headers,
          timeout: 10000
        }
      );

      return response.status === 200 || response.status === 201;
    } catch (error: any) {
      // If internal analytics service is unavailable, log but don't fail
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        logger.warn('Internal analytics service unavailable, skipping', {
          eventType,
          error: error.code
        });
        return true; // Treat as success to not block processing
      }

      logger.error('Internal analytics tracking failed:', {
        eventType,
        status: error.response?.status,
        message: error.message
      });

      // For 4xx errors, don't retry (bad data)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        return false;
      }

      throw error;
    }
  }
}

// Event type constants for consistency
export const AnalyticsEventTypes = {
  // User events
  USER_SIGNUP: 'user_signup',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  
  // Ticket events
  TICKET_PURCHASED: 'ticket_purchased',
  TICKET_TRANSFERRED: 'ticket_transferred',
  TICKET_LISTED: 'ticket_listed',
  TICKET_SOLD: 'ticket_sold',
  TICKET_SCANNED: 'ticket_scanned',
  
  // Event events
  EVENT_CREATED: 'event_created',
  EVENT_UPDATED: 'event_updated',
  EVENT_PUBLISHED: 'event_published',
  EVENT_CANCELLED: 'event_cancelled',
  
  // Venue events
  VENUE_REGISTERED: 'venue_registered',
  VENUE_VERIFIED: 'venue_verified',
  
  // Payment events
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  REFUND_PROCESSED: 'refund_processed',
  
  // NFT events
  NFT_MINTED: 'nft_minted',
  NFT_TRANSFERRED: 'nft_transferred',
  
  // Search events
  SEARCH_PERFORMED: 'search_performed',
  
  // Page views
  PAGE_VIEW: 'page_view'
} as const;
