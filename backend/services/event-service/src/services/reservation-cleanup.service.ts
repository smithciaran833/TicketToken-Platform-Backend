import { Knex } from 'knex';
import { pino } from 'pino';
import { CapacityService } from './capacity.service';

/**
 * HIGH PRIORITY RESILIENCE FIXES:
 * - Issue #17: Added backoff on consecutive failures
 * - Issue #18: Added metrics and alerting for monitoring
 */

const logger = pino({ name: 'reservation-cleanup' });

export class ReservationCleanupService {
  private capacityService: CapacityService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  // HIGH PRIORITY FIX: Track failures for circuit breaker behavior
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 5;
  private backoffMs: number = 0;
  
  // HIGH PRIORITY FIX: Track metrics
  private totalCleanups: number = 0;
  private totalReservationsReleased: number = 0;
  private lastCleanupTime: Date | null = null;
  private lastCleanupDuration: number = 0;
  
  // MEDIUM PRIORITY FIX (Issue #31): Prevent overlapping cleanup executions
  private isCleanupInProgress: boolean = false;
  private skippedCleanups: number = 0;

  constructor(
    private db: Knex,
    private intervalMinutes: number = 1 // Run every minute by default
  ) {
    this.capacityService = new CapacityService(db);
  }

  /**
   * Start the background job
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Reservation cleanup job is already running');
      return;
    }

    this.isRunning = true;
    logger.info({ intervalMinutes: this.intervalMinutes }, 'Starting reservation cleanup job');

    // Run immediately on start
    this.runCleanup();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the background job
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Reservation cleanup job is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Stopped reservation cleanup job');
  }

  /**
   * Run the cleanup process
   * HIGH PRIORITY FIX: Added backoff, metrics, and alerting
   * MEDIUM PRIORITY FIX (Issue #31): Prevent overlapping executions
   */
  private async runCleanup(): Promise<void> {
    // MEDIUM PRIORITY FIX: Check if cleanup is already in progress
    if (this.isCleanupInProgress) {
      this.skippedCleanups++;
      logger.warn({ 
        skippedCleanups: this.skippedCleanups,
        lastDuration: this.lastCleanupDuration 
      }, 'Skipping cleanup - previous cleanup still in progress');
      return;
    }

    // Set mutex lock
    this.isCleanupInProgress = true;

    // HIGH PRIORITY FIX: Apply backoff if there are consecutive failures
    if (this.backoffMs > 0) {
      logger.warn({ backoffMs: this.backoffMs, consecutiveFailures: this.consecutiveFailures }, 
        'Cleanup job in backoff mode due to consecutive failures');
      await this.sleep(this.backoffMs);
      this.backoffMs = 0; // Reset after waiting
    }

    const startTime = Date.now();

    try {
      logger.debug('Running reservation cleanup...');
      
      const releasedCount = await this.capacityService.releaseExpiredReservations();
      
      // HIGH PRIORITY FIX: Update metrics
      this.totalCleanups++;
      this.totalReservationsReleased += releasedCount;
      this.lastCleanupTime = new Date();
      this.lastCleanupDuration = Date.now() - startTime;
      
      // HIGH PRIORITY FIX: Reset failure count on success
      if (this.consecutiveFailures > 0) {
        logger.info({ 
          previousFailures: this.consecutiveFailures 
        }, 'Cleanup job recovered after failures');
        this.consecutiveFailures = 0;
      }
      
      if (releasedCount > 0) {
        logger.info({ 
          releasedCount,
          durationMs: this.lastCleanupDuration,
          totalCleanups: this.totalCleanups,
          totalReleased: this.totalReservationsReleased
        }, 'Released expired reservations');
      } else {
        logger.debug({ 
          durationMs: this.lastCleanupDuration 
        }, 'No expired reservations found');
      }
    } catch (error: any) {
      // HIGH PRIORITY FIX: Track consecutive failures
      this.consecutiveFailures++;
      this.lastCleanupDuration = Date.now() - startTime;
      
      logger.error({ 
        error: error.message, 
        stack: error.stack,
        consecutiveFailures: this.consecutiveFailures,
        durationMs: this.lastCleanupDuration
      }, 'Error running reservation cleanup');
      
      // HIGH PRIORITY FIX: Alert on repeated failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        logger.error({
          consecutiveFailures: this.consecutiveFailures,
          maxConsecutiveFailures: this.maxConsecutiveFailures,
          nextBackoff: this.calculateBackoff()
        }, '🚨 ALERT: Cleanup job failing repeatedly - entering backoff mode');
        
        // Apply exponential backoff
        this.backoffMs = this.calculateBackoff();
      }
    } finally {
      // MEDIUM PRIORITY FIX: Always release the mutex lock
      this.isCleanupInProgress = false;
    }
  }

  /**
   * HIGH PRIORITY FIX: Calculate exponential backoff
   */
  private calculateBackoff(): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
    const backoff = Math.min(
      1000 * Math.pow(2, this.consecutiveFailures - this.maxConsecutiveFailures),
      60000
    );
    return backoff;
  }

  /**
   * HIGH PRIORITY FIX: Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for cleanup (useful for testing)
   */
  async triggerCleanup(): Promise<number> {
    logger.info('Manual cleanup triggered');
    return await this.capacityService.releaseExpiredReservations();
  }

  /**
   * Get job status
   * HIGH PRIORITY FIX: Added metrics for monitoring
   * MEDIUM PRIORITY FIX (Issue #31): Added overlapping execution tracking
   */
  getStatus(): {
    isRunning: boolean;
    intervalMinutes: number;
    consecutiveFailures: number;
    totalCleanups: number;
    totalReservationsReleased: number;
    lastCleanupTime: Date | null;
    lastCleanupDuration: number;
    isInBackoff: boolean;
    backoffMs: number;
    isCleanupInProgress: boolean;
    skippedCleanups: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      consecutiveFailures: this.consecutiveFailures,
      totalCleanups: this.totalCleanups,
      totalReservationsReleased: this.totalReservationsReleased,
      lastCleanupTime: this.lastCleanupTime,
      lastCleanupDuration: this.lastCleanupDuration,
      isInBackoff: this.backoffMs > 0,
      backoffMs: this.backoffMs,
      isCleanupInProgress: this.isCleanupInProgress,
      skippedCleanups: this.skippedCleanups,
    };
  }

  /**
   * HIGH PRIORITY FIX: Reset metrics (useful for testing/monitoring)
   * MEDIUM PRIORITY FIX (Issue #31): Also reset skipped cleanups counter
   */
  resetMetrics(): void {
    this.totalCleanups = 0;
    this.totalReservationsReleased = 0;
    this.consecutiveFailures = 0;
    this.backoffMs = 0;
    this.skippedCleanups = 0;
    logger.info('Cleanup job metrics reset');
  }
}
