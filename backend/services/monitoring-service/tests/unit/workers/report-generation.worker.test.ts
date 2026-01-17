// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { ReportGenerationWorker } from '../../../src/workers/report-generation.worker';
import { logger } from '../../../src/logger';

describe('ReportGenerationWorker', () => {
  let worker: ReportGenerationWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });
    worker = new ReportGenerationWorker();
  });

  afterEach(async () => {
    await worker.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with null intervals', () => {
      expect((worker as any).dailyInterval).toBeNull();
      expect((worker as any).weeklyInterval).toBeNull();
    });
  });

  describe('start', () => {
    it('should log starting message', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Report Generation Worker...');
    });

    it('should log success message after starting', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Report Generation Worker started successfully');
    });

    it('should schedule daily reports', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Next daily report scheduled for:')
      );
    });

    it('should schedule weekly reports', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Next weekly report scheduled for:')
      );
    });

    it('should throw error if scheduling fails', async () => {
      const error = new Error('Scheduling failed');
      (logger.info as jest.Mock)
        .mockImplementationOnce(() => {}) // Starting message
        .mockImplementationOnce(() => { throw error; }); // Daily schedule message

      await expect(worker.start()).rejects.toThrow('Scheduling failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start Report Generation Worker:',
        expect.any(Error)
      );
    });
  });

  describe('generateDailyReport', () => {
    it('should log starting message', async () => {
      await (worker as any).generateDailyReport();

      expect(logger.info).toHaveBeenCalledWith('Generating daily monitoring report...');
    });

    it('should log sending report', async () => {
      await (worker as any).generateDailyReport();

      expect(logger.info).toHaveBeenCalledWith('Sending daily report...');
    });

    it('should log storing report', async () => {
      await (worker as any).generateDailyReport();

      expect(logger.debug).toHaveBeenCalledWith('Storing report in database...');
    });

    it('should log success message', async () => {
      await (worker as any).generateDailyReport();

      expect(logger.info).toHaveBeenCalledWith('Daily report generated successfully');
    });

    it('should log error on failure', async () => {
      (logger.info as jest.Mock).mockImplementation((msg: string) => {
        if (msg === 'Generating daily monitoring report...') {
          throw new Error('Report generation failed');
        }
      });

      await (worker as any).generateDailyReport();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate daily report:',
        expect.any(Error)
      );
    });
  });

  describe('generateWeeklyReport', () => {
    it('should log starting message', async () => {
      await (worker as any).generateWeeklyReport();

      expect(logger.info).toHaveBeenCalledWith('Generating weekly monitoring report...');
    });

    it('should log sending report', async () => {
      await (worker as any).generateWeeklyReport();

      expect(logger.info).toHaveBeenCalledWith('Sending weekly report...');
    });

    it('should log success message', async () => {
      await (worker as any).generateWeeklyReport();

      expect(logger.info).toHaveBeenCalledWith('Weekly report generated successfully');
    });

    it('should log error on failure', async () => {
      (logger.info as jest.Mock).mockImplementation((msg: string) => {
        if (msg === 'Generating weekly monitoring report...') {
          throw new Error('Report generation failed');
        }
      });

      await (worker as any).generateWeeklyReport();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate weekly report:',
        expect.any(Error)
      );
    });
  });

  describe('helper methods', () => {
    describe('countAlerts', () => {
      it('should return 0 (placeholder)', async () => {
        const result = await (worker as any).countAlerts(new Date());
        expect(result).toBe(0);
      });

      it('should accept days parameter', async () => {
        const result = await (worker as any).countAlerts(new Date(), 7);
        expect(result).toBe(0);
      });
    });

    describe('getAvgResponseTime', () => {
      it('should return 0 (placeholder)', async () => {
        const result = await (worker as any).getAvgResponseTime(new Date());
        expect(result).toBe(0);
      });
    });

    describe('getErrorRate', () => {
      it('should return 0 (placeholder)', async () => {
        const result = await (worker as any).getErrorRate(new Date());
        expect(result).toBe(0);
      });
    });

    describe('calculateUptime', () => {
      it('should return 99.9 (placeholder)', async () => {
        const result = await (worker as any).calculateUptime(new Date());
        expect(result).toBe(99.9);
      });
    });

    describe('getTopIssues', () => {
      it('should return empty array (placeholder)', async () => {
        const result = await (worker as any).getTopIssues(new Date());
        expect(result).toEqual([]);
      });
    });

    describe('analyzeTrends', () => {
      it('should return empty object (placeholder)', async () => {
        const result = await (worker as any).analyzeTrends(new Date());
        expect(result).toEqual({});
      });
    });

    describe('generateRecommendations', () => {
      it('should return empty array (placeholder)', async () => {
        const result = await (worker as any).generateRecommendations(new Date());
        expect(result).toEqual([]);
      });
    });

    describe('getWeekNumber', () => {
      it('should return a valid week number for beginning of year', () => {
        // Jan 4 is always in week 1 per ISO standard
        const result = (worker as any).getWeekNumber(new Date('2024-01-04'));
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(53);
      });

      it('should return correct week number for mid-year', () => {
        const result = (worker as any).getWeekNumber(new Date('2024-06-15'));
        expect(result).toBeGreaterThan(20);
        expect(result).toBeLessThan(30);
      });

      it('should return a valid week number for end of year', () => {
        const result = (worker as any).getWeekNumber(new Date('2024-12-25'));
        expect(result).toBeGreaterThanOrEqual(50);
        expect(result).toBeLessThanOrEqual(53);
      });

      it('should return number type', () => {
        const result = (worker as any).getWeekNumber(new Date());
        expect(typeof result).toBe('number');
      });
    });

    describe('sendReport', () => {
      it('should log sending message with report type', async () => {
        await (worker as any).sendReport({ type: 'daily' });
        expect(logger.info).toHaveBeenCalledWith('Sending daily report...');
      });

      it('should log sending message for weekly report', async () => {
        await (worker as any).sendReport({ type: 'weekly' });
        expect(logger.info).toHaveBeenCalledWith('Sending weekly report...');
      });
    });

    describe('storeReport', () => {
      it('should log storing message', async () => {
        await (worker as any).storeReport({ type: 'daily' });
        expect(logger.debug).toHaveBeenCalledWith('Storing report in database...');
      });
    });
  });

  describe('stop', () => {
    it('should log stopped message', async () => {
      await worker.start();
      jest.clearAllMocks();

      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Report Generation Worker stopped');
    });

    it('should handle stop when not started', async () => {
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Report Generation Worker stopped');
    });

    it('should be idempotent', async () => {
      await worker.start();

      await worker.stop();
      jest.clearAllMocks();
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Report Generation Worker stopped');
    });

    it('should set dailyInterval to null after stop', async () => {
      await worker.start();
      await worker.stop();

      expect((worker as any).dailyInterval).toBeNull();
    });

    it('should set weeklyInterval to null after stop', async () => {
      await worker.start();
      await worker.stop();

      expect((worker as any).weeklyInterval).toBeNull();
    });
  });

  describe('restart behavior', () => {
    it('should allow restart after stop', async () => {
      await worker.start();
      await worker.stop();

      jest.clearAllMocks();

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Report Generation Worker...');
      expect(logger.info).toHaveBeenCalledWith('Report Generation Worker started successfully');
    });
  });
});
