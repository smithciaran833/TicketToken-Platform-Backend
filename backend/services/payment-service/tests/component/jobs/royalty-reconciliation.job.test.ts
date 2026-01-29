/**
 * COMPONENT TEST: RoyaltyReconciliationJob
 *
 * Tests royalty reconciliation scheduling
 */

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(() => ({})),
  },
}));

// Mock the RoyaltyReconciliationService class
const mockRunReconciliation = jest.fn();
jest.mock('../../../src/services/reconciliation/royalty-reconciliation.service', () => ({
  RoyaltyReconciliationService: jest.fn().mockImplementation(() => ({
    runReconciliation: mockRunReconciliation,
  })),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  runDailyReconciliation,
  runWeeklyReconciliation,
  startRoyaltyReconciliationJobs,
} from '../../../src/jobs/royalty-reconciliation.job';

describe('RoyaltyReconciliationJob Component Tests', () => {
  beforeEach(() => {
    mockRunReconciliation.mockReset();
    mockRunReconciliation.mockResolvedValue({
      runId: 'test-run-id',
      transactionsChecked: 0,
      discrepanciesFound: 0,
      discrepanciesResolved: 0,
      totalRoyaltiesCalculated: 0,
      totalRoyaltiesPaid: 0,
    });
  });

  // ===========================================================================
  // DAILY RECONCILIATION
  // ===========================================================================
  describe('runDailyReconciliation()', () => {
    it('should run reconciliation for yesterday', async () => {
      await runDailyReconciliation();

      expect(mockRunReconciliation).toHaveBeenCalledTimes(1);

      const [tenantId, startDate, endDate] = mockRunReconciliation.mock.calls[0];

      expect(tenantId).toBe('system');

      // Should be yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      expect(startDate.getDate()).toBe(yesterday.getDate());
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);

      expect(endDate.getDate()).toBe(yesterday.getDate());
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    it('should throw on reconciliation failure', async () => {
      mockRunReconciliation.mockRejectedValueOnce(new Error('Reconciliation failed'));

      await expect(runDailyReconciliation()).rejects.toThrow('Reconciliation failed');
    });
  });

  // ===========================================================================
  // WEEKLY RECONCILIATION
  // ===========================================================================
  describe('runWeeklyReconciliation()', () => {
    it('should run reconciliation for last 7 days', async () => {
      await runWeeklyReconciliation();

      expect(mockRunReconciliation).toHaveBeenCalledTimes(1);

      const [tenantId, startDate, endDate] = mockRunReconciliation.mock.calls[0];

      expect(tenantId).toBe('system');

      // Should span 7 days
      const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(7);
    });

    it('should throw on reconciliation failure', async () => {
      mockRunReconciliation.mockRejectedValueOnce(new Error('Weekly reconciliation failed'));

      await expect(runWeeklyReconciliation()).rejects.toThrow('Weekly reconciliation failed');
    });
  });

  // ===========================================================================
  // START JOBS
  // ===========================================================================
  describe('startRoyaltyReconciliationJobs()', () => {
    it('should not throw when starting jobs', () => {
      expect(() => startRoyaltyReconciliationJobs()).not.toThrow();
    });
  });
});
