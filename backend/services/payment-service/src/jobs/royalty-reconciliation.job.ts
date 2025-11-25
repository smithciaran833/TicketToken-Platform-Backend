import { royaltyReconciliationService } from '../services/reconciliation/royalty-reconciliation.service';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RoyaltyReconciliationJob' });

/**
 * Daily royalty reconciliation job
 * Runs every day at 2 AM to reconcile previous day's royalties
 */
export async function runDailyReconciliation(): Promise<void> {
  log.info('Starting daily royalty reconciliation job');

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    await royaltyReconciliationService.runReconciliation(yesterday, endOfYesterday);

    log.info('Daily royalty reconciliation completed successfully');
  } catch (error) {
    log.error('Daily royalty reconciliation failed', { error });
    throw error;
  }
}

/**
 * Weekly comprehensive reconciliation
 * Runs every Monday at 3 AM to reconcile previous week
 */
export async function runWeeklyReconciliation(): Promise<void> {
  log.info('Starting weekly royalty reconciliation job');

  try {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    await royaltyReconciliationService.runReconciliation(lastWeek, yesterday);

    log.info('Weekly royalty reconciliation completed successfully');
  } catch (error) {
    log.error('Weekly royalty reconciliation failed', { error });
    throw error;
  }
}

/**
 * Start the scheduled jobs
 */
export function startRoyaltyReconciliationJobs(): void {
  // Run daily at 2 AM
  const dailyCron = '0 2 * * *';
  
  // Run weekly on Monday at 3 AM
  const weeklyCron = '0 3 * * 1';

  log.info('Royalty reconciliation jobs scheduled', {
    daily: dailyCron,
    weekly: weeklyCron
  });

  // Note: Actual cron scheduling would be done by the service's job scheduler
  // This is just the job definition
}
