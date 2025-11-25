import { JobExecutor } from './job-executor';
import { logger } from '../utils/logger';

/**
 * Job Manager
 * Orchestrates all background jobs and handles graceful shutdown
 */
export class JobManager {
  private jobs: JobExecutor[] = [];
  private isShuttingDown = false;

  /**
   * Register a job with the manager
   */
  register(job: JobExecutor): void {
    this.jobs.push(job);
    logger.info('Job registered', { jobName: job.getStatus().name });
  }

  /**
   * Start all registered jobs
   */
  startAll(): void {
    logger.info(`Starting ${this.jobs.length} jobs`);
    
    for (const job of this.jobs) {
      try {
        job.start();
      } catch (error) {
        logger.error('Failed to start job', {
          jobName: job.getStatus().name,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Register shutdown handlers
    this.registerShutdownHandlers();
  }

  /**
   * Stop all registered jobs
   */
  stopAll(): void {
    logger.info(`Stopping ${this.jobs.length} jobs`);
    
    for (const job of this.jobs) {
      try {
        job.stop();
      } catch (error) {
        logger.error('Failed to stop job', {
          jobName: job.getStatus().name,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  /**
   * Get status of all jobs
   */
  getAllStatus(): Array<{
    name: string;
    status: string;
    enabled: boolean;
    circuitOpen: boolean;
  }> {
    return this.jobs.map(job => job.getStatus());
  }

  /**
   * Graceful shutdown - stop scheduling and wait for running jobs
   */
  async gracefulShutdown(timeoutMs: number = 30000): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown of all jobs', {
      jobCount: this.jobs.length,
      timeoutMs,
    });

    // Stop scheduling new executions
    this.stopAll();

    // Wait for all running jobs to complete
    const shutdownPromises = this.jobs.map(async (job) => {
      try {
        await job.waitForCompletion(timeoutMs);
        logger.info('Job completed gracefully', { jobName: job.getStatus().name });
      } catch (error) {
        logger.error('Job did not complete gracefully', {
          jobName: job.getStatus().name,
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    try {
      await Promise.all(shutdownPromises);
      logger.info('All jobs shut down gracefully');
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
    }
  }

  /**
   * Register process signal handlers for graceful shutdown
   */
  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);
      
      try {
        await this.gracefulShutdown(30000);
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      shutdown('uncaughtException').catch(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      shutdown('unhandledRejection').catch(() => process.exit(1));
    });
  }

  /**
   * Get a specific job by name
   */
  getJob(name: string): JobExecutor | undefined {
    return this.jobs.find(job => job.getStatus().name === name);
  }

  /**
   * Get count of registered jobs
   */
  getJobCount(): number {
    return this.jobs.length;
  }
}

// Export singleton instance
export const jobManager = new JobManager();
