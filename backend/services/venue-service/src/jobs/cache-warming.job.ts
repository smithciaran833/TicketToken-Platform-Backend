import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { CacheService } from '../services/cache.service';
import { db } from '../config/database';

const log = logger.child({ component: 'CacheWarmingJob' });

/**
 * Cache Warming Cron Job
 *
 * Runs hourly to pre-load popular venues into cache
 * Prevents cache stampede on high-traffic venues
 */
export class CacheWarmingJob {
  private task: ScheduledTask | null = null;
  private cacheService: CacheService;

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
  }

  /**
   * Start the cron job
   */
  start(): void {
    // Run every hour at :05 past the hour
    this.task = cron.schedule('5 * * * *', async () => {
      log.info('Starting scheduled cache warming');

      try {
        await this.warmPopularVenues();
        log.info('Cache warming completed successfully');
      } catch (error) {
        log.error({ error }, 'Cache warming failed');
      }
    });

    log.info('Cache warming cron job started (runs hourly at :05)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      log.info('Cache warming cron job stopped');
    }
  }

  /**
   * Warm cache with popular venues
   */
  private async warmPopularVenues(): Promise<void> {
    // Get top 100 venues by total events
    const popularVenues = await db('venues')
      .where('status', 'active')
      .whereNull('deleted_at')
      .orderBy('total_events', 'desc')
      .limit(100)
      .select('id', 'tenant_id', 'name', 'total_events');

    if (popularVenues.length === 0) {
      log.info('No venues to warm');
      return;
    }

    // Prepare cache entries
    // CacheService.getCacheKey() adds: `${keyPrefix}tenant:${tenantId}:${key}`
    // So we pass just the ID part: `${venue.id}:details`
    // Result will be: `venue:tenant:${tenant_id}:${venue.id}:details`
    const cacheEntries = popularVenues.map(venue => ({
      key: `${venue.id}:details`,
      value: venue,
      ttl: 300, // 5 minutes
      tenantId: venue.tenant_id,
    }));

    // Warm cache
    await this.cacheService.warmCache(cacheEntries);

    log.info({ count: popularVenues.length }, 'Warmed cache with popular venues');
  }

  /**
   * Run warming manually (for testing)
   */
  async runNow(): Promise<void> {
    log.info('Running cache warming manually');

    try {
      await this.warmPopularVenues();
      log.info('Manual cache warming completed');
    } catch (error) {
      log.error({ error }, 'Manual cache warming failed');
      throw error;
    }
  }
}
