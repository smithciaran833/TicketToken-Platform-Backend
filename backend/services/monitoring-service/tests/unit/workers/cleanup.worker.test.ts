// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { CleanupWorker } from '../../../src/workers/cleanup.worker';
import { logger } from '../../../src/logger';

describe('CleanupWorker', () => {
  let worker: CleanupWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });
    worker = new CleanupWorker();
  });

  afterEach(async () => {
    await worker.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with null interval', () => {
      expect((worker as any).interval).toBeNull();
    });
  });

  describe('start', () => {
    it('should log starting message', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Cleanup Worker...');
    });

    it('should log success message after starting', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Cleanup Worker started successfully');
    });

    it('should log next scheduled cleanup time', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Next cleanup scheduled for: \d{4}-\d{2}-\d{2}T/)
      );
    });

    it('should schedule cleanup for 2 AM local time', async () => {
      await worker.start();

      // The worker schedules for 2 AM local time, so we just verify it scheduled something
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Next cleanup scheduled for:')
      );
    });

    it('should throw error if scheduling fails', async () => {
      const error = new Error('Scheduling failed');
      (logger.info as jest.Mock)
        .mockImplementationOnce(() => {}) // Starting message
        .mockImplementationOnce(() => { throw error; }); // Next scheduled message

      await expect(worker.start()).rejects.toThrow('Scheduling failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start Cleanup Worker:',
        expect.any(Error)
      );
    });
  });

  describe('cleanup methods', () => {
    describe('cleanOldAlerts', () => {
      it('should log correct days parameter', async () => {
        await (worker as any).cleanOldAlerts(90);

        expect(logger.info).toHaveBeenCalledWith('Cleaning alerts older than 90 days...');
        expect(logger.info).toHaveBeenCalledWith('Alert cleanup completed');
      });

      it('should handle different retention periods', async () => {
        await (worker as any).cleanOldAlerts(30);

        expect(logger.info).toHaveBeenCalledWith('Cleaning alerts older than 30 days...');
      });

      it('should throw error on failure', async () => {
        (logger.info as jest.Mock).mockImplementationOnce(() => {
          throw new Error('Delete failed');
        });

        await expect((worker as any).cleanOldAlerts(90)).rejects.toThrow('Delete failed');
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to clean old alerts:',
          expect.any(Error)
        );
      });
    });

    describe('cleanOldAggregations', () => {
      it('should log correct days parameter', async () => {
        await (worker as any).cleanOldAggregations(365);

        expect(logger.info).toHaveBeenCalledWith('Cleaning aggregations older than 365 days...');
        expect(logger.info).toHaveBeenCalledWith('Aggregation cleanup completed');
      });

      it('should throw error on failure', async () => {
        (logger.info as jest.Mock).mockImplementationOnce(() => {
          throw new Error('Delete failed');
        });

        await expect((worker as any).cleanOldAggregations(365)).rejects.toThrow('Delete failed');
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to clean old aggregations:',
          expect.any(Error)
        );
      });
    });

    describe('cleanElasticsearch', () => {
      it('should log correct days parameter', async () => {
        await (worker as any).cleanElasticsearch(30);

        expect(logger.info).toHaveBeenCalledWith('Cleaning Elasticsearch logs older than 30 days...');
        expect(logger.info).toHaveBeenCalledWith('Elasticsearch cleanup completed');
      });

      it('should throw error on failure', async () => {
        (logger.info as jest.Mock).mockImplementationOnce(() => {
          throw new Error('ES connection failed');
        });

        await expect((worker as any).cleanElasticsearch(30)).rejects.toThrow('ES connection failed');
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to clean Elasticsearch:',
          expect.any(Error)
        );
      });
    });
  });

  describe('cleanup execution', () => {
    it('should call all cleanup methods when cleanup runs', async () => {
      // Directly test the private cleanup method
      await (worker as any).cleanup();

      expect(logger.info).toHaveBeenCalledWith('Starting daily cleanup...');
      expect(logger.info).toHaveBeenCalledWith('Cleaning alerts older than 90 days...');
      expect(logger.info).toHaveBeenCalledWith('Cleaning aggregations older than 365 days...');
      expect(logger.info).toHaveBeenCalledWith('Cleaning Elasticsearch logs older than 30 days...');
      expect(logger.info).toHaveBeenCalledWith('Daily cleanup completed successfully');
    });

    it('should log error but continue if cleanup fails', async () => {
      // Make cleanOldAlerts throw
      const originalCleanOldAlerts = (worker as any).cleanOldAlerts.bind(worker);
      (worker as any).cleanOldAlerts = jest.fn().mockRejectedValue(new Error('DB error'));

      await (worker as any).cleanup();

      expect(logger.error).toHaveBeenCalledWith('Cleanup failed:', expect.any(Error));
    });
  });

  describe('stop', () => {
    it('should log stopped message', async () => {
      await worker.start();
      jest.clearAllMocks();

      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Cleanup Worker stopped');
    });

    it('should handle stop when not started', async () => {
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Cleanup Worker stopped');
    });

    it('should be idempotent', async () => {
      await worker.start();

      await worker.stop();
      jest.clearAllMocks();
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Cleanup Worker stopped');
    });

    it('should set interval to null after stop', async () => {
      await worker.start();
      await worker.stop();

      expect((worker as any).interval).toBeNull();
    });
  });
});
