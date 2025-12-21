/**
 * Royalty Reconciliation Job Integration Tests
 */

import {
  runDailyReconciliation,
  runWeeklyReconciliation,
  startRoyaltyReconciliationJobs,
} from '../../../src/jobs/royalty-reconciliation.job';
import { royaltyReconciliationService } from '../../../src/services/reconciliation/royalty-reconciliation.service';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  db,
} from '../setup';

jest.mock('../../../src/services/reconciliation/royalty-reconciliation.service', () => ({
  royaltyReconciliationService: {
    runReconciliation: jest.fn(),
  },
}));

describe('RoyaltyReconciliationJob', () => {
  beforeAll(async () => {
    await setupTestApp();
  });

  afterAll(async () => {
    await teardownTestApp({ db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    jest.clearAllMocks();
  });

  describe('runDailyReconciliation()', () => {
    it('should call reconciliation service with yesterday date range', async () => {
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockResolvedValue(undefined);

      await runDailyReconciliation();

      expect(royaltyReconciliationService.runReconciliation).toHaveBeenCalledTimes(1);

      const [startDate, endDate] = (royaltyReconciliationService.runReconciliation as jest.Mock).mock.calls[0];

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      expect(startDate.getDate()).toBe(yesterday.getDate());
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);

      expect(endDate.getDate()).toBe(yesterday.getDate());
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    it('should propagate errors from reconciliation service', async () => {
      const error = new Error('Reconciliation failed');
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockRejectedValue(error);

      await expect(runDailyReconciliation()).rejects.toThrow('Reconciliation failed');
    });

    it('should complete successfully when service succeeds', async () => {
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockResolvedValue(undefined);

      await expect(runDailyReconciliation()).resolves.not.toThrow();
    });
  });

  describe('runWeeklyReconciliation()', () => {
    it('should call reconciliation service with last week date range', async () => {
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockResolvedValue(undefined);

      await runWeeklyReconciliation();

      expect(royaltyReconciliationService.runReconciliation).toHaveBeenCalledTimes(1);

      const [startDate, endDate] = (royaltyReconciliationService.runReconciliation as jest.Mock).mock.calls[0];

      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      lastWeek.setHours(0, 0, 0, 0);

      expect(startDate.getDate()).toBe(lastWeek.getDate());
      expect(startDate.getHours()).toBe(0);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      expect(endDate.getDate()).toBe(yesterday.getDate());
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    it('should propagate errors from reconciliation service', async () => {
      const error = new Error('Weekly reconciliation failed');
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockRejectedValue(error);

      await expect(runWeeklyReconciliation()).rejects.toThrow('Weekly reconciliation failed');
    });

    it('should complete successfully when service succeeds', async () => {
      (royaltyReconciliationService.runReconciliation as jest.Mock).mockResolvedValue(undefined);

      await expect(runWeeklyReconciliation()).resolves.not.toThrow();
    });
  });

  describe('startRoyaltyReconciliationJobs()', () => {
    it('should not throw when called', () => {
      expect(() => startRoyaltyReconciliationJobs()).not.toThrow();
    });

    it('should be callable multiple times without error', () => {
      expect(() => {
        startRoyaltyReconciliationJobs();
        startRoyaltyReconciliationJobs();
        startRoyaltyReconciliationJobs();
      }).not.toThrow();
    });
  });
});
