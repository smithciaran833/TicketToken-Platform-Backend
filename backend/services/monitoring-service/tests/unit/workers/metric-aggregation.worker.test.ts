// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { MetricAggregationWorker } from '../../../src/workers/metric-aggregation.worker';
import { logger } from '../../../src/logger';

describe('MetricAggregationWorker', () => {
  let worker: MetricAggregationWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });
    worker = new MetricAggregationWorker();
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

      expect(logger.info).toHaveBeenCalledWith('Starting Metric Aggregation Worker...');
    });

    it('should run initial aggregation immediately', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Running metric aggregation...');
    });

    it('should log success message after starting', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Metric Aggregation Worker started successfully');
    });

    it('should set up interval for periodic aggregation', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('should aggregate every 5 minutes', async () => {
      await worker.start();
      jest.clearAllMocks();

      // Advance 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      expect(logger.debug).toHaveBeenCalledWith('Running metric aggregation...');
    });

    it('should handle initial aggregation failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Aggregation failed');
      });

      await expect(worker.start()).rejects.toThrow('Aggregation failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start Metric Aggregation Worker:',
        expect.any(Error)
      );
    });

    it('should log error if aggregation cycle fails', async () => {
      await worker.start();
      jest.clearAllMocks();

      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Cycle failed');
      });

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        'Metric aggregation cycle failed:',
        expect.any(Error)
      );
    });
  });

  describe('aggregate', () => {
    it('should always aggregate 5 minute window', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 5m');
    });

    it('should aggregate hourly window when minutes is 0', async () => {
      // Create a date where getMinutes() returns 0
      const mockDate = new Date();
      mockDate.setMinutes(0);
      mockDate.setSeconds(0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1h');
    });

    it('should not aggregate hourly window at non-zero minutes', async () => {
      const mockDate = new Date();
      mockDate.setMinutes(30);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).not.toHaveBeenCalledWith('Aggregating metrics for window: 1h');
    });

    it('should aggregate daily window when hour is divisible by 6 and minutes is 0', async () => {
      // Set to 6:00 AM local time
      const mockDate = new Date();
      mockDate.setHours(6, 0, 0, 0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should aggregate daily window at midnight local time', async () => {
      const mockDate = new Date();
      mockDate.setHours(0, 0, 0, 0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should aggregate daily window at 12 PM local time', async () => {
      const mockDate = new Date();
      mockDate.setHours(12, 0, 0, 0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should aggregate daily window at 6 PM local time', async () => {
      const mockDate = new Date();
      mockDate.setHours(18, 0, 0, 0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should not aggregate daily window at 3 AM', async () => {
      const mockDate = new Date();
      mockDate.setHours(3, 0, 0, 0);
      jest.setSystemTime(mockDate);

      await worker.start();

      expect(logger.info).not.toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should log completion message', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Metric aggregation completed');
    });

    it('should throw error on failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Aggregation failed');
      });

      await expect(worker.start()).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Metric aggregation failed:',
        expect.any(Error)
      );
    });
  });

  describe('aggregateTimeWindow', () => {
    it('should log aggregation for 5m window', async () => {
      await (worker as any).aggregateTimeWindow('5m');

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 5m');
    });

    it('should log aggregation for 1h window', async () => {
      await (worker as any).aggregateTimeWindow('1h');

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1h');
    });

    it('should log aggregation for 1d window', async () => {
      await (worker as any).aggregateTimeWindow('1d');

      expect(logger.info).toHaveBeenCalledWith('Aggregating metrics for window: 1d');
    });

    it('should aggregate all defined metrics', async () => {
      await (worker as any).aggregateTimeWindow('5m');

      const expectedMetrics = [
        'http_request_duration_ms',
        'db_query_duration_ms',
        'payment_success_total',
        'payment_failure_total',
        'tickets_sold_total',
        'active_users',
        'queue_size'
      ];

      for (const metric of expectedMetrics) {
        expect(logger.debug).toHaveBeenCalledWith(`Aggregated ${metric} for 5m`);
      }
    });

    it('should log error for individual metric failure but continue', async () => {
      let callCount = 0;
      (logger.debug as jest.Mock).mockImplementation((msg: string) => {
        if (msg.includes('http_request_duration_ms')) {
          callCount++;
          if (callCount === 1) {
            throw new Error('Metric aggregation failed');
          }
        }
      });

      await (worker as any).aggregateTimeWindow('5m');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to aggregate http_request_duration_ms:',
        expect.any(Error)
      );

      // Should still aggregate other metrics
      expect(logger.debug).toHaveBeenCalledWith('Aggregated db_query_duration_ms for 5m');
    });
  });

  describe('stop', () => {
    it('should clear the interval', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);

      await worker.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should set interval to null', async () => {
      await worker.start();
      await worker.stop();

      expect((worker as any).interval).toBeNull();
    });

    it('should log stopped message', async () => {
      await worker.start();
      jest.clearAllMocks();

      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Metric Aggregation Worker stopped');
    });

    it('should handle stop when not started', async () => {
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Metric Aggregation Worker stopped');
    });

    it('should be idempotent', async () => {
      await worker.start();

      await worker.stop();
      await worker.stop();
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Metric Aggregation Worker stopped');
    });
  });

  describe('restart behavior', () => {
    it('should allow restart after stop', async () => {
      await worker.start();
      await worker.stop();

      jest.clearAllMocks();

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Metric Aggregation Worker...');
      expect(logger.info).toHaveBeenCalledWith('Metric Aggregation Worker started successfully');
    });
  });
});
