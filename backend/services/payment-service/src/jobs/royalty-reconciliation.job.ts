import { RoyaltyReconciliationService } from '../services/reconciliation/royalty-reconciliation.service';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RoyaltyReconciliationJob' });

// Lazy initialization of the service
let _service: RoyaltyReconciliationService | null = null;

function getService(): RoyaltyReconciliationService {
  if (!_service) {
    const pool = DatabaseService.getPool();
    // Mock blockchain client for now - would be injected in production
    const blockchainClient = {
      getSecondarySales: async () => [],
      getTransaction: async () => null,
    };
    _service = new RoyaltyReconciliationService(pool, blockchainClient);
  }
  return _service;
}

export async function runDailyReconciliation(): Promise<void> {
  log.info('Starting daily royalty reconciliation job');

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    await getService().runReconciliation('system', yesterday, endOfYesterday);

    log.info('Daily royalty reconciliation completed successfully');
  } catch (error) {
    log.error({ error }, 'Daily royalty reconciliation failed');
    throw error;
  }
}

export async function runWeeklyReconciliation(): Promise<void> {
  log.info('Starting weekly royalty reconciliation job');

  try {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    await getService().runReconciliation('system', lastWeek, yesterday);

    log.info('Weekly royalty reconciliation completed successfully');
  } catch (error) {
    log.error({ error }, 'Weekly royalty reconciliation failed');
    throw error;
  }
}

export function startRoyaltyReconciliationJobs(): void {
  const dailyCron = '0 2 * * *';
  const weeklyCron = '0 3 * * 1';

  log.info({
    daily: dailyCron,
    weekly: weeklyCron
  }, 'Royalty reconciliation jobs scheduled');
}
