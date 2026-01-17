/**
 * Processors Unit Tests
 */

// Mock logger before import
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { startEventProcessors } from '../../src/processors';
import { logger } from '../../src/utils/logger';

describe('Event Processors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startEventProcessors', () => {
    it('should log startup message', async () => {
      await startEventProcessors();

      expect(logger.info).toHaveBeenCalledWith('Starting event processors...');
    });

    it('should log completion message', async () => {
      await startEventProcessors();

      expect(logger.info).toHaveBeenCalledWith('Event processors started');
    });

    it('should complete without errors', async () => {
      await expect(startEventProcessors()).resolves.not.toThrow();
    });
  });
});
