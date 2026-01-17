// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

import { startWorkers, stopWorkers } from '../../../src/workers';
import { logger } from '../../../src/logger';
import cron from 'node-cron';

describe('Workers Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startWorkers', () => {
    it('should log starting message', async () => {
      await startWorkers();

      expect(logger.info).toHaveBeenCalledWith('Starting background workers...');
    });

    it('should schedule alert evaluation worker every 60 seconds', async () => {
      await startWorkers();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/60 * * * * *',
        expect.any(Function)
      );
    });

    it('should schedule metric aggregation worker every 5 minutes', async () => {
      await startWorkers();

      expect(cron.schedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function)
      );
    });

    it('should schedule cleanup worker every hour', async () => {
      await startWorkers();

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 * * * *',
        expect.any(Function)
      );
    });

    it('should log completion message', async () => {
      await startWorkers();

      expect(logger.info).toHaveBeenCalledWith('Background workers started');
    });

    it('should schedule exactly 3 cron jobs', async () => {
      await startWorkers();

      expect(cron.schedule).toHaveBeenCalledTimes(3);
    });
  });

  describe('cron job callbacks', () => {
    it('should log debug message when alert evaluation runs successfully', async () => {
      await startWorkers();

      const alertCallback = (cron.schedule as jest.Mock).mock.calls[0][1];
      await alertCallback();

      expect(logger.debug).toHaveBeenCalledWith('Running alert evaluation...');
    });

    it('should log debug message when metric aggregation runs successfully', async () => {
      await startWorkers();

      const metricCallback = (cron.schedule as jest.Mock).mock.calls[1][1];
      await metricCallback();

      expect(logger.debug).toHaveBeenCalledWith('Running metric aggregation...');
    });

    it('should log debug message when cleanup runs successfully', async () => {
      await startWorkers();

      const cleanupCallback = (cron.schedule as jest.Mock).mock.calls[2][1];
      await cleanupCallback();

      expect(logger.debug).toHaveBeenCalledWith('Running cleanup...');
    });

    it('should log error when alert evaluation fails', async () => {
      const error = new Error('Alert evaluation failed');

      await startWorkers();

      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      const alertCallback = (cron.schedule as jest.Mock).mock.calls[0][1];
      await alertCallback();

      expect(logger.error).toHaveBeenCalledWith('Alert evaluation error:', error);
    });

    it('should log error when metric aggregation fails', async () => {
      const error = new Error('Metric aggregation failed');

      await startWorkers();

      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      const metricCallback = (cron.schedule as jest.Mock).mock.calls[1][1];
      await metricCallback();

      expect(logger.error).toHaveBeenCalledWith('Metric aggregation error:', error);
    });

    it('should log error when cleanup fails', async () => {
      const error = new Error('Cleanup failed');

      await startWorkers();

      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      const cleanupCallback = (cron.schedule as jest.Mock).mock.calls[2][1];
      await cleanupCallback();

      expect(logger.error).toHaveBeenCalledWith('Cleanup error:', error);
    });
  });

  describe('stopWorkers', () => {
    it('should log stopping message', () => {
      stopWorkers();

      expect(logger.info).toHaveBeenCalledWith('Stopping background workers...');
    });
  });
});
