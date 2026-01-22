import { Knex } from 'knex';
import type Redis from 'ioredis';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookService' });

/**
 * SECURITY FIX (WH4-WH10): Comprehensive webhook processing service
 * - WH4: Processing status tracking
 * - WH5: Async handling support
 * - WH6: Payload storage
 * - WH7: Cleanup job for old records
 * - WH8: Metadata storage
 * - WH10: Distributed locking for concurrent processing
 */

export type WebhookStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  status: WebhookStatus;
  tenant_id?: string;
  source?: string;
  payload?: any;
  error_message?: string;
  retry_count: number;
  source_ip?: string;
  processed_at: Date;
  processing_started_at?: Date;
  processing_completed_at?: Date;
  last_retry_at?: Date;
}

export interface ProcessWebhookOptions {
  eventId: string;
  eventType: string;
  payload: any;
  tenantId?: string;
  source?: string;
  sourceIp?: string;
  headers?: Record<string, string>;
  processor: (payload: any) => Promise<void>;
  maxRetries?: number;
  lockTtlMs?: number;
}

export class WebhookService {
  private readonly lockPrefix = 'webhook:lock:';
  private readonly defaultLockTtl = 30000; // 30 seconds
  private readonly maxRetries = 3;
  private readonly cleanupRetentionDays = 30;

  constructor(
    private readonly db: Knex,
    private readonly redis: Redis
  ) {}

  /**
   * SECURITY FIX (WH10): Acquire distributed lock for webhook processing
   */
  private async acquireLock(eventId: string, ttlMs: number): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${eventId}`;
    const lockValue = `${process.pid}:${Date.now()}`;

    try {
      // SET NX with expiry - atomic operation
      const result = await this.redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        log.debug({ eventId, lockKey, ttlMs }, 'Acquired webhook processing lock');
        return true;
      }

      log.debug({ eventId, lockKey }, 'Failed to acquire lock - already held');
      return false;
    } catch (error: any) {
      log.error({ eventId, lockKey, error: error.message }, 'Error acquiring webhook lock');
      // Fail open - allow processing if Redis is unavailable
      return true;
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(eventId: string): Promise<void> {
    const lockKey = `${this.lockPrefix}${eventId}`;

    try {
      await this.redis.del(lockKey);
      log.debug({ eventId, lockKey }, 'Released webhook processing lock');
    } catch (error: any) {
      log.warn({ eventId, lockKey, error: error.message }, 'Error releasing webhook lock');
    }
  }

  /**
   * SECURITY FIX (WH4): Check if webhook is already being processed or completed
   */
  async isProcessedOrProcessing(eventId: string): Promise<{ processed: boolean; processing: boolean }> {
    try {
      const event = await this.db('venue_webhook_events')
        .where('event_id', eventId)
        .first();

      if (!event) {
        return { processed: false, processing: false };
      }

      return {
        processed: event.status === 'completed',
        processing: event.status === 'processing',
      };
    } catch (error: any) {
      log.warn({ eventId, error: error.message }, 'Error checking webhook status');
      return { processed: false, processing: false };
    }
  }

  /**
   * Hash headers for deduplication check
   */
  private hashHeaders(headers: Record<string, string>): string {
    const relevantHeaders = ['stripe-signature', 'x-stripe-event-id', 'x-request-id'];
    const headerString = relevantHeaders
      .map(h => `${h}:${headers[h] || ''}`)
      .join('|');
    return createHash('sha256').update(headerString).digest('hex');
  }

  /**
   * SECURITY FIX (WH4-WH10): Process webhook with full lifecycle management
   */
  async processWebhook(options: ProcessWebhookOptions): Promise<{ success: boolean; duplicate: boolean; error?: string }> {
    const {
      eventId,
      eventType,
      payload,
      tenantId,
      source = 'stripe',
      sourceIp,
      headers,
      processor,
      maxRetries = this.maxRetries,
      lockTtlMs = this.defaultLockTtl,
    } = options;

    // WH10: Check for duplicates and acquire lock
    const status = await this.isProcessedOrProcessing(eventId);

    if (status.processed) {
      log.info({ eventId, eventType }, 'Webhook already processed - skipping');
      return { success: true, duplicate: true };
    }

    if (status.processing) {
      log.info({ eventId, eventType }, 'Webhook currently being processed - skipping');
      return { success: true, duplicate: true };
    }

    // WH10: Acquire distributed lock
    const lockAcquired = await this.acquireLock(eventId, lockTtlMs);
    if (!lockAcquired) {
      log.info({ eventId, eventType }, 'Could not acquire lock - another instance processing');
      return { success: true, duplicate: true };
    }

    const headersHash = headers ? this.hashHeaders(headers) : null;

    try {
      // WH4/WH6/WH8: Create or update event record with pending status
      // IMPORTANT: Don't stringify payload - Knex does it automatically for JSONB columns
      await this.db('venue_webhook_events')
        .insert({
          event_id: eventId,
          event_type: eventType,
          status: 'processing' as WebhookStatus,
          tenant_id: tenantId || null,
          source,
          payload: payload,  // Let Knex handle JSONB stringification
          source_ip: sourceIp || null,
          headers_hash: headersHash,
          processing_started_at: new Date(),
          processed_at: new Date(),
        })
        .onConflict('event_id')
        .merge({
          status: 'processing',
          processing_started_at: new Date(),
        });

      log.info({ eventId, eventType, tenantId }, 'Started webhook processing');

      // WH5: Execute the processor
      await processor(payload);

      // WH4: Mark as completed
      await this.db('venue_webhook_events')
        .where('event_id', eventId)
        .update({
          status: 'completed' as WebhookStatus,
          processing_completed_at: new Date(),
          error_message: null,
        });

      log.info({ eventId, eventType, tenantId }, 'Webhook processing completed successfully');
      return { success: true, duplicate: false };

    } catch (error: any) {
      log.error({ eventId, eventType, error: error.message }, 'Webhook processing failed');

      // WH4/WH7: Update status and retry count
      const retryCount = await this.getRetryCount(eventId);
      const newStatus: WebhookStatus = retryCount >= maxRetries ? 'failed' : 'retrying';

      await this.db('venue_webhook_events')
        .where('event_id', eventId)
        .update({
          status: newStatus,
          error_message: error.message,
          retry_count: retryCount + 1,
          last_retry_at: new Date(),
        });

      return { success: false, duplicate: false, error: error.message };

    } finally {
      // WH10: Always release the lock
      await this.releaseLock(eventId);
    }
  }

  /**
   * Get current retry count for an event
   */
  private async getRetryCount(eventId: string): Promise<number> {
    try {
      const event = await this.db('venue_webhook_events')
        .where('event_id', eventId)
        .first('retry_count');
      return event?.retry_count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * SECURITY FIX (WH7): Cleanup old webhook events
   * Should be run periodically (e.g., daily cron job)
   */
  async cleanupOldEvents(retentionDays: number = this.cleanupRetentionDays): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const deletedCount = await this.db('venue_webhook_events')
        .where('processed_at', '<', cutoffDate)
        .whereIn('status', ['completed', 'failed'])
        .delete();

      log.info({ deletedCount, cutoffDate, retentionDays }, 'Cleaned up old webhook events');
      return deletedCount;
    } catch (error: any) {
      log.error({ error: error.message, retentionDays }, 'Error cleaning up webhook events');
      throw error;
    }
  }

  /**
   * Get events that need retry
   */
  async getEventsForRetry(limit: number = 100): Promise<WebhookEvent[]> {
    const cooldownMinutes = 5; // Wait at least 5 minutes between retries
    const cooldownDate = new Date();
    cooldownDate.setMinutes(cooldownDate.getMinutes() - cooldownMinutes);

    try {
      const events = await this.db('venue_webhook_events')
        .where('status', 'retrying')
        .where('retry_count', '<', this.maxRetries)
        .where(function() {
          this.whereNull('last_retry_at')
            .orWhere('last_retry_at', '<', cooldownDate);
        })
        .orderBy('processed_at', 'asc')
        .limit(limit);

      return events;
    } catch (error: any) {
      log.error({ error: error.message }, 'Error getting events for retry');
      return [];
    }
  }

  /**
   * Get webhook processing statistics
   */
  async getStatistics(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  }> {
    try {
      const stats = await this.db('venue_webhook_events')
        .select('status')
        .count('* as count')
        .groupBy('status');

      const result = {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retrying: 0,
      };

      for (const row of stats) {
        const count = parseInt(row.count as string, 10);
        result[row.status as keyof typeof result] = count;
        result.total += count;
      }

      return result;
    } catch (error: any) {
      log.error({ error: error.message }, 'Error getting webhook statistics');
      throw error;
    }
  }
}

/**
 * Factory function to create WebhookService instance
 */
export function createWebhookService(db: Knex, redis: Redis): WebhookService {
  return new WebhookService(db, redis);
}
