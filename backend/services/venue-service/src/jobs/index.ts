import { logger } from '../utils/logger';
import { WebhookCleanupJob } from './webhook-cleanup.job';
import { CacheWarmingJob } from './cache-warming.job';
import { ComplianceReviewJob } from './compliance-review.job';
import { ContentCleanupJob } from './content-cleanup.job';
import { SSLRenewalJob } from './ssl-renewal.job';
import { CacheService } from '../services/cache.service';
import { getRedis, initRedis } from '../config/redis';

const log = logger.child({ component: 'JobScheduler' });

/**
 * All scheduled jobs
 */
let jobs: {
  webhookCleanup: WebhookCleanupJob;
  cacheWarming: CacheWarmingJob;
  complianceReview: ComplianceReviewJob;
  contentCleanup: ContentCleanupJob;
  sslRenewal: SSLRenewalJob;
} | null = null;

/**
 * Start all scheduled jobs
 */
export async function startScheduledJobs(): Promise<void> {
  log.info('Starting scheduled jobs...');

  try {
    // Initialize Redis first
    await initRedis();
    
    // Get Redis instance
    const redis = getRedis();

    // Verify Redis is ready
    if (!redis || redis.status !== 'ready') {
      throw new Error('Redis not initialized. Call initRedis() first.');
    }

    const cacheService = new CacheService(redis);

    // Create all job instances
    const webhookCleanupJob = new WebhookCleanupJob(redis);
    const cacheWarmingJob = new CacheWarmingJob(cacheService);
    const complianceReviewJob = new ComplianceReviewJob();
    const contentCleanupJob = new ContentCleanupJob();
    const sslRenewalJob = new SSLRenewalJob();

    // Store job instances
    jobs = {
      webhookCleanup: webhookCleanupJob,
      cacheWarming: cacheWarmingJob,
      complianceReview: complianceReviewJob,
      contentCleanup: contentCleanupJob,
      sslRenewal: sslRenewalJob,
    };

    // Start all jobs
    webhookCleanupJob.start();      // Daily at 3 AM
    cacheWarmingJob.start();        // Hourly at :05
    complianceReviewJob.start();    // Daily at 2 AM
    contentCleanupJob.start();      // Daily at 4 AM
    sslRenewalJob.start();          // Daily at 5 AM

    // Verify MongoDB TTL index for content cleanup
    await contentCleanupJob.verifyTTLIndex();

    log.info({
      webhookCleanup: 'Daily at 3 AM',
      cacheWarming: 'Hourly at :05',
      complianceReview: 'Daily at 2 AM',
      contentCleanup: 'Daily at 4 AM',
      sslRenewal: 'Daily at 5 AM',
    }, 'All scheduled jobs started successfully');
  } catch (error) {
    log.error({ error }, 'Failed to start scheduled jobs');
    throw error;
  }
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduledJobs(): void {
  if (!jobs) {
    log.warn('No jobs to stop');
    return;
  }

  log.info('Stopping all scheduled jobs...');

  jobs.webhookCleanup.stop();
  jobs.cacheWarming.stop();
  jobs.complianceReview.stop();
  jobs.contentCleanup.stop();
  jobs.sslRenewal.stop();

  jobs = null;

  log.info('All scheduled jobs stopped');
}

/**
 * Get job instances for manual execution or testing
 */
export function getJobs() {
  if (!jobs) {
    throw new Error('Jobs not initialized. Call startScheduledJobs() first.');
  }
  return jobs;
}

/**
 * Health check for jobs
 */
export function getJobsHealth(): {
  initialized: boolean;
  jobs: string[];
} {
  return {
    initialized: jobs !== null,
    jobs: jobs ? Object.keys(jobs) : [],
  };
}
