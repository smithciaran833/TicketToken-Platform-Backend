import { Knex } from 'knex';
import { pino } from 'pino';
import { CapacityService } from './capacity.service';

const logger = pino({ name: 'reservation-cleanup' });

export class ReservationCleanupService {
  private capacityService: CapacityService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

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
   */
  private async runCleanup(): Promise<void> {
    try {
      logger.debug('Running reservation cleanup...');
      
      const releasedCount = await this.capacityService.releaseExpiredReservations();
      
      if (releasedCount > 0) {
        logger.info({ releasedCount }, 'Released expired reservations');
      } else {
        logger.debug('No expired reservations found');
      }
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Error running reservation cleanup');
    }
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
   */
  getStatus(): {
    isRunning: boolean;
    intervalMinutes: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes
    };
  }
}
