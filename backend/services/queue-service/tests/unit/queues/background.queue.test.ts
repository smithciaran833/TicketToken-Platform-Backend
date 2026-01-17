// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { BackgroundQueue } from '../../../src/queues/definitions/background.queue';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { AnalyticsProcessor } from '../../../src/workers/background/analytics.processor';
import { JOB_TYPES } from '../../../src/config/constants';
import { QUEUE_CONFIGS } from '../../../src/config/queues.config';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/queues/factories/queue.factory');
jest.mock('../../../src/workers/background/analytics.processor');
jest.mock('../../../src/config/constants', () => ({
  JOB_TYPES: {
    ANALYTICS_PROCESS: 'analytics:process',
  },
}));
jest.mock('../../../src/config/queues.config', () => ({
  QUEUE_CONFIGS: {
    BACKGROUND_QUEUE: {
      retryLimit: 3,
      retryDelay: 1000,
      retryBackoff: true,
      expireInSeconds: 3600,
    },
  },
}));

describe('BackgroundQueue', () => {
  let mockBoss: any;
  let mockAnalyticsProcessor: any;
  let backgroundQueue: BackgroundQueue;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBoss = {
      work: jest.fn(),
      send: jest.fn(),
    };

    mockAnalyticsProcessor = {
      process: jest.fn(),
    };

    (QueueFactory.getBoss as jest.Mock).mockReturnValue(mockBoss);
    (AnalyticsProcessor as jest.Mock).mockImplementation(() => mockAnalyticsProcessor);
  });

  describe('constructor', () => {
    it('should get boss instance from QueueFactory', () => {
      backgroundQueue = new BackgroundQueue();
      
      expect(QueueFactory.getBoss).toHaveBeenCalledTimes(1);
    });

    it('should instantiate AnalyticsProcessor', () => {
      backgroundQueue = new BackgroundQueue();
      
      expect(AnalyticsProcessor).toHaveBeenCalledTimes(1);
    });

    it('should call setupProcessors on initialization', () => {
      backgroundQueue = new BackgroundQueue();
      
      expect(mockBoss.work).toHaveBeenCalled();
    });
  });

  describe('setupProcessors', () => {
    beforeEach(() => {
      backgroundQueue = new BackgroundQueue();
    });

    it('should register analytics processor with correct job type', () => {
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_TYPES.ANALYTICS_PROCESS,
        expect.any(Function)
      );
    });

    it('should log initialization message', () => {
      expect(logger.info).toHaveBeenCalledWith('Background queue processors initialized');
    });

    describe('registered worker callback', () => {
      let workerCallback: Function;

      beforeEach(() => {
        workerCallback = mockBoss.work.mock.calls[0][1];
      });

      it('should call analyticsProcessor.process with job data', async () => {
        const mockJob = { data: { eventType: 'page_view', userId: 'user123' } };
        mockAnalyticsProcessor.process.mockResolvedValue({ success: true });

        await workerCallback(mockJob);

        expect(mockAnalyticsProcessor.process).toHaveBeenCalledWith({
          data: mockJob.data,
        });
      });

      it('should return processor result on success', async () => {
        const mockJob = { data: { eventType: 'click' } };
        const expectedResult = { success: true, processed: 1 };
        mockAnalyticsProcessor.process.mockResolvedValue(expectedResult);

        const result = await workerCallback(mockJob);

        expect(result).toEqual(expectedResult);
      });

      it('should log and rethrow error when processor fails', async () => {
        const mockJob = { data: { eventType: 'error_test' } };
        const mockError = new Error('Processing failed');
        mockAnalyticsProcessor.process.mockRejectedValue(mockError);

        await expect(workerCallback(mockJob)).rejects.toThrow('Processing failed');
        expect(logger.error).toHaveBeenCalledWith('Analytics job failed:', mockError);
      });
    });
  });

  describe('addJob', () => {
    beforeEach(() => {
      backgroundQueue = new BackgroundQueue();
    });

    it('should send job to boss with correct job type and data', async () => {
      const jobType = 'analytics:process';
      const jobData = { eventType: 'purchase', amount: 100 };
      mockBoss.send.mockResolvedValue('job-123');

      await backgroundQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        expect.any(Object)
      );
    });

    it('should merge default config with custom options', async () => {
      const jobType = 'analytics:process';
      const jobData = { eventType: 'test' };
      const customOptions = { priority: 10, retryLimit: 5 };
      mockBoss.send.mockResolvedValue('job-456');

      await backgroundQueue.addJob(jobType, jobData, customOptions);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: 5,
          retryDelay: QUEUE_CONFIGS.BACKGROUND_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.BACKGROUND_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.BACKGROUND_QUEUE.expireInSeconds,
          priority: 10,
        }
      );
    });

    it('should use default config when no options provided', async () => {
      const jobType = 'analytics:process';
      const jobData = { eventType: 'default_test' };
      mockBoss.send.mockResolvedValue('job-789');

      await backgroundQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: QUEUE_CONFIGS.BACKGROUND_QUEUE.retryLimit,
          retryDelay: QUEUE_CONFIGS.BACKGROUND_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.BACKGROUND_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.BACKGROUND_QUEUE.expireInSeconds,
        }
      );
    });

    it('should return job ID on success', async () => {
      const expectedJobId = 'uuid-job-id-123';
      mockBoss.send.mockResolvedValue(expectedJobId);

      const result = await backgroundQueue.addJob('analytics:process', {});

      expect(result).toBe(expectedJobId);
    });

    it('should return null when boss.send returns null', async () => {
      mockBoss.send.mockResolvedValue(null);

      const result = await backgroundQueue.addJob('analytics:process', {});

      expect(result).toBeNull();
    });

    it('should log success message with job type and ID', async () => {
      mockBoss.send.mockResolvedValue('logged-job-id');

      await backgroundQueue.addJob('analytics:process', { test: true });

      expect(logger.info).toHaveBeenCalled();
    });

    it('should log error and rethrow when send fails', async () => {
      const mockError = new Error('Database connection failed');
      mockBoss.send.mockRejectedValue(mockError);

      await expect(
        backgroundQueue.addJob('analytics:process', {})
      ).rejects.toThrow('Database connection failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should not catch and swallow errors', async () => {
      const customError = new Error('Custom send error');
      mockBoss.send.mockRejectedValue(customError);

      await expect(backgroundQueue.addJob('test', {})).rejects.toThrow(customError);
    });
  });

  describe('getBoss', () => {
    it('should return the PgBoss instance', () => {
      backgroundQueue = new BackgroundQueue();

      const result = backgroundQueue.getBoss();

      expect(result).toBe(mockBoss);
    });

    it('should return the same instance on multiple calls', () => {
      backgroundQueue = new BackgroundQueue();

      const result1 = backgroundQueue.getBoss();
      const result2 = backgroundQueue.getBoss();

      expect(result1).toBe(result2);
    });
  });
});
