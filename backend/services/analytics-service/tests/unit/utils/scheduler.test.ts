/**
 * Scheduler Unit Tests
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { startScheduledJobs } from '../../../src/utils/scheduler';
import { logger } from '../../../src/utils/logger';

describe('Scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startScheduledJobs', () => {
    it('should log startup message', async () => {
      await startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith('Starting scheduled jobs...');
      expect(logger.info).toHaveBeenCalledWith('Scheduled jobs started');
    });

    it('should complete successfully', async () => {
      await expect(startScheduledJobs()).resolves.toBeUndefined();
    });

    it('should be callable multiple times', async () => {
      await startScheduledJobs();
      await startScheduledJobs();

      expect(logger.info).toHaveBeenCalledTimes(4); // 2 calls × 2 logs each
    });
  });
});
