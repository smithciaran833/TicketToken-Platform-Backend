/**
 * Data Retention Jobs
 * 
 * AUDIT FIX GDPR-M1: Automated data retention and cleanup
 * AUDIT FIX GDPR-M2: Configurable retention periods
 * AUDIT FIX GDPR-M3: Audit trail for deletions
 */

import { db } from '../config/database';
import { logger } from '../config/logger';
import { redisClient } from '../config/redis';
import { env } from '../config/env';

/**
 * Retention periods in days
 */
const RETENTION_PERIODS = {
  // Notification logs - 90 days default
  notificationLogs: parseInt(process.env.RETENTION_NOTIFICATION_LOGS_DAYS || '90', 10),
  // Webhook events - 30 days
  webhookEvents: parseInt(process.env.RETENTION_WEBHOOK_EVENTS_DAYS || '30', 10),
  // Delivery status - 90 days
  deliveryStatus: parseInt(process.env.RETENTION_DELIVERY_STATUS_DAYS || '90', 10),
  // Analytics data - 365 days
  analyticsData: parseInt(process.env.RETENTION_ANALYTICS_DAYS || '365', 10),
  // Failed notifications - 30 days
  failedNotifications: parseInt(process.env.RETENTION_FAILED_NOTIFICATIONS_DAYS || '30', 10),
  // Consent history - 7 years (legal requirement)
  consentHistory: parseInt(process.env.RETENTION_CONSENT_HISTORY_DAYS || '2555', 10),
  // Job execution history - 14 days
  jobHistory: parseInt(process.env.RETENTION_JOB_HISTORY_DAYS || '14', 10),
};

/**
 * Distributed lock for retention jobs
 */
async function acquireRetentionLock(jobName: string): Promise<boolean> {
  try {
    const lockKey = `retention_lock:${jobName}`;
    const result = await redisClient.set(
      lockKey,
      `${process.pid}:${Date.now()}`,
      'PX',
      3600000, // 1 hour lock
      'NX'
    );
    return result === 'OK';
  } catch (error) {
    logger.error('Failed to acquire retention lock', { jobName, error });
    return false;
  }
}

async function releaseRetentionLock(jobName: string): Promise<void> {
  try {
    const lockKey = `retention_lock:${jobName}`;
    await redisClient.del(lockKey);
  } catch (error) {
    logger.error('Failed to release retention lock', { jobName, error });
  }
}

/**
 * Log deletion for audit purposes
 */
async function logDeletion(
  tableName: string,
  recordCount: number,
  retentionDays: number,
  cutoffDate: Date
): Promise<void> {
  try {
    await db('audit_log').insert({
      event_type: 'data_retention_cleanup',
      table_name: tableName,
      record_count: recordCount,
      retention_days: retentionDays,
      cutoff_date: cutoffDate,
      deleted_at: new Date(),
      deleted_by: 'data_retention_job',
      metadata: JSON.stringify({
        environment: env.NODE_ENV,
        pid: process.pid,
      }),
    });
  } catch (error) {
    // Don't fail the job if audit logging fails
    logger.warn('Failed to log deletion audit', { tableName, error });
  }
}

/**
 * Clean old notification logs
 */
export async function cleanNotificationLogsJob(): Promise<void> {
  const jobName = 'clean_notification_logs';
  
  if (!await acquireRetentionLock(jobName)) {
    logger.info('Retention job already running, skipping', { jobName });
    return;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.notificationLogs);

    logger.info('Starting notification logs cleanup', {
      retentionDays: RETENTION_PERIODS.notificationLogs,
      cutoffDate,
    });

    // Delete in batches to avoid long-running transactions
    let totalDeleted = 0;
    const batchSize = 1000;

    while (true) {
      const deleted = await db('notification_logs')
        .where('created_at', '<', cutoffDate)
        .limit(batchSize)
        .del();

      totalDeleted += deleted;

      if (deleted < batchSize) break;

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await logDeletion('notification_logs', totalDeleted, RETENTION_PERIODS.notificationLogs, cutoffDate);

    logger.info('Notification logs cleanup completed', {
      totalDeleted,
      cutoffDate,
    });
  } catch (error) {
    logger.error('Notification logs cleanup failed', { error });
    throw error;
  } finally {
    await releaseRetentionLock(jobName);
  }
}

/**
 * Clean old webhook events
 */
export async function cleanWebhookEventsJob(): Promise<void> {
  const jobName = 'clean_notification_webhook_events';
  
  if (!await acquireRetentionLock(jobName)) {
    logger.info('Retention job already running, skipping', { jobName });
    return;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.webhookEvents);

    logger.info('Starting webhook events cleanup', {
      retentionDays: RETENTION_PERIODS.webhookEvents,
      cutoffDate,
    });

    let totalDeleted = 0;
    const batchSize = 1000;

    while (true) {
      const deleted = await db('notification_webhook_events')
        .where('received_at', '<', cutoffDate)
        .limit(batchSize)
        .del();

      totalDeleted += deleted;

      if (deleted < batchSize) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await logDeletion('notification_webhook_events', totalDeleted, RETENTION_PERIODS.webhookEvents, cutoffDate);

    logger.info('Webhook events cleanup completed', { totalDeleted, cutoffDate });
  } catch (error) {
    logger.error('Webhook events cleanup failed', { error });
    throw error;
  } finally {
    await releaseRetentionLock(jobName);
  }
}

/**
 * Clean old delivery status records
 */
export async function cleanDeliveryStatusJob(): Promise<void> {
  const jobName = 'clean_delivery_status';
  
  if (!await acquireRetentionLock(jobName)) {
    logger.info('Retention job already running, skipping', { jobName });
    return;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.deliveryStatus);

    logger.info('Starting delivery status cleanup', {
      retentionDays: RETENTION_PERIODS.deliveryStatus,
      cutoffDate,
    });

    let totalDeleted = 0;
    const batchSize = 1000;

    while (true) {
      const deleted = await db('notification_delivery_status')
        .where('updated_at', '<', cutoffDate)
        .limit(batchSize)
        .del();

      totalDeleted += deleted;

      if (deleted < batchSize) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await logDeletion('notification_delivery_status', totalDeleted, RETENTION_PERIODS.deliveryStatus, cutoffDate);

    logger.info('Delivery status cleanup completed', { totalDeleted, cutoffDate });
  } catch (error) {
    logger.error('Delivery status cleanup failed', { error });
    throw error;
  } finally {
    await releaseRetentionLock(jobName);
  }
}

/**
 * Anonymize old analytics data (keep aggregates, remove PII)
 */
export async function anonymizeAnalyticsJob(): Promise<void> {
  const jobName = 'anonymize_analytics';
  
  if (!await acquireRetentionLock(jobName)) {
    logger.info('Retention job already running, skipping', { jobName });
    return;
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.analyticsData);

    logger.info('Starting analytics anonymization', {
      retentionDays: RETENTION_PERIODS.analyticsData,
      cutoffDate,
    });

    // Update old records to anonymize PII
    const updated = await db('notification_analytics')
      .where('created_at', '<', cutoffDate)
      .where('is_anonymized', false)
      .update({
        user_id: db.raw("'anonymized_' || gen_random_uuid()"),
        recipient_email: null,
        recipient_phone: null,
        ip_address: null,
        user_agent: null,
        is_anonymized: true,
        anonymized_at: new Date(),
      });

    await logDeletion('notification_analytics', updated, RETENTION_PERIODS.analyticsData, cutoffDate);

    logger.info('Analytics anonymization completed', { recordsAnonymized: updated, cutoffDate });
  } catch (error) {
    logger.error('Analytics anonymization failed', { error });
    throw error;
  } finally {
    await releaseRetentionLock(jobName);
  }
}

/**
 * Clean Redis caches
 */
export async function cleanRedisCachesJob(): Promise<void> {
  const jobName = 'clean_redis_caches';
  
  if (!await acquireRetentionLock(jobName)) {
    logger.info('Retention job already running, skipping', { jobName });
    return;
  }

  try {
    logger.info('Starting Redis cache cleanup');

    // Clean old job history entries
    const jobHistoryKeys = await redisClient.keys('job_history:*');
    let cleaned = 0;

    for (const key of jobHistoryKeys) {
      // Keep only last 100 entries per job
      const trimmed = await redisClient.ltrim(key, 0, 99);
      if (trimmed === 'OK') cleaned++;
    }

    // Clean old rate limit entries (they auto-expire, but clean orphans)
    const rateLimitKeys = await redisClient.keys('rate_limit:*');
    const expiredRateLimitKeys: string[] = [];

    for (const key of rateLimitKeys) {
      const ttl = await redisClient.ttl(key);
      if (ttl === -1) {
        // No TTL set, this is orphaned
        expiredRateLimitKeys.push(key);
      }
    }

    if (expiredRateLimitKeys.length > 0) {
      await redisClient.del(...expiredRateLimitKeys);
      cleaned += expiredRateLimitKeys.length;
    }

    logger.info('Redis cache cleanup completed', {
      jobHistoryKeysCleaned: jobHistoryKeys.length,
      orphanedRateLimitKeys: expiredRateLimitKeys.length,
    });
  } catch (error) {
    logger.error('Redis cache cleanup failed', { error });
    throw error;
  } finally {
    await releaseRetentionLock(jobName);
  }
}

/**
 * Run all retention jobs
 */
export async function runAllRetentionJobs(): Promise<void> {
  logger.info('Starting all data retention jobs');

  const jobs = [
    { name: 'notification_logs', fn: cleanNotificationLogsJob },
    { name: 'notification_webhook_events', fn: cleanWebhookEventsJob },
    { name: 'delivery_status', fn: cleanDeliveryStatusJob },
    { name: 'analytics', fn: anonymizeAnalyticsJob },
    { name: 'redis_caches', fn: cleanRedisCachesJob },
  ];

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const job of jobs) {
    try {
      await job.fn();
      results.push({ name: job.name, success: true });
    } catch (error) {
      results.push({
        name: job.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info('Data retention jobs completed', {
    total: jobs.length,
    successful,
    failed,
    results,
  });

  if (failed > 0) {
    throw new Error(`${failed} retention jobs failed`);
  }
}

/**
 * Get retention status
 */
export async function getRetentionStatus(): Promise<{
  periods: typeof RETENTION_PERIODS;
  lastRuns: Record<string, string | null>;
}> {
  const lastRuns: Record<string, string | null> = {};
  
  const jobs = [
    'clean_notification_logs',
    'clean_notification_webhook_events',
    'clean_delivery_status',
    'anonymize_analytics',
    'clean_redis_caches',
  ];

  for (const job of jobs) {
    const lastRun = await redisClient.get(`job_last_run:${job}`);
    lastRuns[job] = lastRun;
  }

  return {
    periods: RETENTION_PERIODS,
    lastRuns,
  };
}
