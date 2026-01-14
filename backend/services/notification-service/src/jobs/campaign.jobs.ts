/**
 * Campaign Jobs Module
 * 
 * AUDIT FIX BG-H1: Added distributed locking to prevent duplicate execution
 * AUDIT FIX BG-H2: Added proper error handling with retry tracking
 */

import { campaignService } from '../services/campaign.service';
import { logger } from '../config/logger';
import { redisClient } from '../config/redis';

/**
 * AUDIT FIX BG-H1: Simple distributed lock implementation
 * Prevents multiple instances from running the same job concurrently
 */
const LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

async function acquireLock(lockName: string, ttlMs: number = LOCK_EXPIRY_MS): Promise<boolean> {
  try {
    const lockKey = `job_lock:${lockName}`;
    const lockValue = `${process.pid}:${Date.now()}`;
    
    // Use SET NX EX for atomic lock acquisition
    const result = await redisClient.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.error('Failed to acquire lock', { lockName, error });
    return false;
  }
}

async function releaseLock(lockName: string): Promise<void> {
  try {
    const lockKey = `job_lock:${lockName}`;
    await redisClient.del(lockKey);
  } catch (error) {
    logger.error('Failed to release lock', { lockName, error });
  }
}

/**
 * AUDIT FIX BG-H2: Track job execution metrics
 */
async function trackJobExecution(
  jobName: string,
  success: boolean,
  duration: number,
  error?: string
): Promise<void> {
  try {
    const historyKey = `job_history:${jobName}`;
    const entry = {
      timestamp: new Date().toISOString(),
      success,
      duration,
      error: error || null,
      pid: process.pid
    };
    
    // Keep last 100 executions
    await redisClient.lpush(historyKey, JSON.stringify(entry));
    await redisClient.ltrim(historyKey, 0, 99);
    
    // Track last execution time
    await redisClient.set(`job_last_run:${jobName}`, new Date().toISOString());
    
    // Track metrics counters
    if (success) {
      await redisClient.incr(`job_success:${jobName}`);
    } else {
      await redisClient.incr(`job_failure:${jobName}`);
    }
  } catch (trackError) {
    // Don't fail the job if tracking fails
    logger.warn('Failed to track job execution', { jobName, trackError });
  }
}

/**
 * Generic job executor with locking and error handling
 */
async function executeJob(
  jobName: string,
  jobFn: () => Promise<void>,
  lockTtl: number = LOCK_EXPIRY_MS
): Promise<void> {
  const startTime = Date.now();
  
  // AUDIT FIX BG-H1: Acquire distributed lock
  const acquired = await acquireLock(jobName, lockTtl);
  if (!acquired) {
    logger.info('Job already running on another instance, skipping', { jobName });
    return;
  }

  try {
    logger.info('Starting job', { jobName, pid: process.pid });
    await jobFn();
    
    const duration = Date.now() - startTime;
    logger.info('Job completed successfully', { jobName, duration });
    await trackJobExecution(jobName, true, duration);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // AUDIT FIX BG-H2: Log with proper error context
    logger.error('Job failed', {
      jobName,
      duration,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    await trackJobExecution(jobName, false, duration, errorMessage);
    
    // Re-throw to allow caller to handle if needed
    throw error;
  } finally {
    await releaseLock(jobName);
  }
}

/**
 * Process abandoned cart recovery emails
 * Runs every hour
 */
export async function processAbandonedCartsJob(): Promise<void> {
  await executeJob(
    'abandoned_carts',
    async () => {
      await campaignService.processAbandonedCarts();
    },
    10 * 60 * 1000 // 10 minute lock
  );
}

/**
 * Refresh dynamic audience segments
 * Runs every 6 hours
 */
export async function refreshSegmentsJob(): Promise<void> {
  await executeJob(
    'refresh_segments',
    async () => {
      const { db } = await import('../config/database');
      const segments = await db('audience_segments')
        .where('is_dynamic', true)
        .select('id');

      let successCount = 0;
      let failureCount = 0;

      for (const segment of segments) {
        try {
          await campaignService.refreshSegment(segment.id);
          successCount++;
        } catch (segmentError) {
          failureCount++;
          logger.error('Failed to refresh segment', {
            segmentId: segment.id,
            error: segmentError instanceof Error ? segmentError.message : 'Unknown error'
          });
        }
      }

      logger.info('Segment refresh completed', {
        total: segments.length,
        success: successCount,
        failures: failureCount
      });

      // If more than 50% failed, consider it a job failure
      if (failureCount > successCount && segments.length > 0) {
        throw new Error(`Segment refresh had ${failureCount}/${segments.length} failures`);
      }
    },
    30 * 60 * 1000 // 30 minute lock
  );
}

/**
 * Send scheduled campaigns
 * Runs every 5 minutes
 */
export async function sendScheduledCampaignsJob(): Promise<void> {
  await executeJob(
    'scheduled_campaigns',
    async () => {
      const { db } = await import('../config/database');
      
      // Find campaigns scheduled for now
      const campaigns = await db('notification_campaigns')
        .where('status', 'scheduled')
        .where('scheduled_for', '<=', new Date())
        .select('id', 'name');

      let successCount = 0;
      let failureCount = 0;

      for (const campaign of campaigns) {
        try {
          await campaignService.sendCampaign(campaign.id);
          successCount++;
          logger.info('Campaign sent successfully', { campaignId: campaign.id, name: campaign.name });
        } catch (campaignError) {
          failureCount++;
          logger.error('Failed to send campaign', {
            campaignId: campaign.id,
            name: campaign.name,
            error: campaignError instanceof Error ? campaignError.message : 'Unknown error'
          });
          
          // AUDIT FIX BG-H2: Update campaign status to failed
          try {
            await db('notification_campaigns')
              .where('id', campaign.id)
              .update({
                status: 'failed',
                error_message: campaignError instanceof Error ? campaignError.message : 'Unknown error',
                updated_at: new Date()
              });
          } catch (updateError) {
            logger.error('Failed to update campaign status', { campaignId: campaign.id, updateError });
          }
        }
      }

      logger.info('Scheduled campaigns job completed', {
        total: campaigns.length,
        success: successCount,
        failures: failureCount
      });
    },
    5 * 60 * 1000 // 5 minute lock
  );
}

/**
 * Get job status for monitoring
 */
export async function getJobStatus(jobName: string): Promise<{
  lastRun: string | null;
  successCount: number;
  failureCount: number;
  recentHistory: any[];
}> {
  try {
    const [lastRun, successCount, failureCount, history] = await Promise.all([
      redisClient.get(`job_last_run:${jobName}`),
      redisClient.get(`job_success:${jobName}`),
      redisClient.get(`job_failure:${jobName}`),
      redisClient.lrange(`job_history:${jobName}`, 0, 9) // Last 10 executions
    ]);

    return {
      lastRun,
      successCount: parseInt(successCount || '0', 10),
      failureCount: parseInt(failureCount || '0', 10),
      recentHistory: history.map((h: string) => JSON.parse(h))
    };
  } catch (error) {
    logger.error('Failed to get job status', { jobName, error });
    return {
      lastRun: null,
      successCount: 0,
      failureCount: 0,
      recentHistory: []
    };
  }
}

/**
 * Start all campaign jobs
 */
export function startCampaignJobs(): void {
  logger.info('Campaign jobs module initialized', {
    jobs: ['abandoned_carts', 'refresh_segments', 'scheduled_campaigns'],
    note: 'Jobs should be scheduled via external scheduler (cron, BullMQ, etc.)'
  });
}
