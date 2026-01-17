// Mock external dependencies BEFORE any imports
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { CommunicationQueue } from '../../../src/queues/definitions/communication.queue';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { EmailProcessor } from '../../../src/workers/communication/email.processor';
import { JOB_TYPES } from '../../../src/config/constants';
import { QUEUE_CONFIGS } from '../../../src/config/queues.config';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/queues/factories/queue.factory');
jest.mock('../../../src/workers/communication/email.processor');
jest.mock('../../../src/config/constants', () => ({
  JOB_TYPES: {
    EMAIL_SEND: 'email:send',
  },
}));
jest.mock('../../../src/config/queues.config', () => ({
  QUEUE_CONFIGS: {
    COMMUNICATION_QUEUE: {
      retryLimit: 5,
      retryDelay: 2000,
      retryBackoff: true,
      expireInSeconds: 7200,
    },
  },
}));

describe('CommunicationQueue', () => {
  let mockBoss: any;
  let mockEmailProcessor: any;
  let communicationQueue: CommunicationQueue;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBoss = {
      work: jest.fn(),
      send: jest.fn(),
    };

    mockEmailProcessor = {
      process: jest.fn(),
    };

    (QueueFactory.getBoss as jest.Mock).mockReturnValue(mockBoss);
    (EmailProcessor as jest.Mock).mockImplementation(() => mockEmailProcessor);
  });

  describe('constructor', () => {
    it('should get boss instance from QueueFactory', () => {
      communicationQueue = new CommunicationQueue();
      
      expect(QueueFactory.getBoss).toHaveBeenCalledTimes(1);
    });

    it('should instantiate EmailProcessor', () => {
      communicationQueue = new CommunicationQueue();
      
      expect(EmailProcessor).toHaveBeenCalledTimes(1);
    });

    it('should call setupProcessors on initialization', () => {
      communicationQueue = new CommunicationQueue();
      
      expect(mockBoss.work).toHaveBeenCalled();
    });
  });

  describe('setupProcessors', () => {
    beforeEach(() => {
      communicationQueue = new CommunicationQueue();
    });

    it('should register email processor with correct job type', () => {
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_TYPES.EMAIL_SEND,
        expect.any(Function)
      );
    });

    it('should log initialization message', () => {
      expect(logger.info).toHaveBeenCalledWith('Communication queue processors initialized');
    });

    describe('registered worker callback', () => {
      let workerCallback: Function;

      beforeEach(() => {
        workerCallback = mockBoss.work.mock.calls[0][1];
      });

      it('should call emailProcessor.process with job data', async () => {
        const mockJob = { data: { to: 'test@example.com', subject: 'Test', body: 'Hello' } };
        mockEmailProcessor.process.mockResolvedValue({ success: true });

        await workerCallback(mockJob);

        expect(mockEmailProcessor.process).toHaveBeenCalledWith({
          data: mockJob.data,
        });
      });

      it('should return processor result on success', async () => {
        const mockJob = { data: { to: 'user@example.com' } };
        const expectedResult = { success: true, messageId: 'msg-123' };
        mockEmailProcessor.process.mockResolvedValue(expectedResult);

        const result = await workerCallback(mockJob);

        expect(result).toEqual(expectedResult);
      });

      it('should log and rethrow error when processor fails', async () => {
        const mockJob = { data: { to: 'invalid' } };
        const mockError = new Error('SMTP connection failed');
        mockEmailProcessor.process.mockRejectedValue(mockError);

        await expect(workerCallback(mockJob)).rejects.toThrow('SMTP connection failed');
        expect(logger.error).toHaveBeenCalledWith('Email job failed:', mockError);
      });

      it('should handle email validation errors', async () => {
        const mockJob = { data: { to: '' } };
        const validationError = new Error('Invalid email address');
        mockEmailProcessor.process.mockRejectedValue(validationError);

        await expect(workerCallback(mockJob)).rejects.toThrow('Invalid email address');
      });
    });
  });

  describe('addJob', () => {
    beforeEach(() => {
      communicationQueue = new CommunicationQueue();
    });

    it('should send job to boss with correct job type and data', async () => {
      const jobType = 'email:send';
      const jobData = { to: 'user@example.com', subject: 'Welcome', body: 'Hello!' };
      mockBoss.send.mockResolvedValue('job-123');

      await communicationQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        expect.any(Object)
      );
    });

    it('should merge default config with custom options', async () => {
      const jobType = 'email:send';
      const jobData = { to: 'test@example.com' };
      const customOptions = { priority: 5, retryLimit: 10 };
      mockBoss.send.mockResolvedValue('job-456');

      await communicationQueue.addJob(jobType, jobData, customOptions);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: 10,
          retryDelay: QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds,
          priority: 5,
        }
      );
    });

    it('should use default config when no options provided', async () => {
      const jobType = 'email:send';
      const jobData = { to: 'default@example.com' };
      mockBoss.send.mockResolvedValue('job-789');

      await communicationQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryLimit,
          retryDelay: QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds,
        }
      );
    });

    it('should return job ID on success', async () => {
      const expectedJobId = 'email-job-uuid-123';
      mockBoss.send.mockResolvedValue(expectedJobId);

      const result = await communicationQueue.addJob('email:send', { to: 'test@test.com' });

      expect(result).toBe(expectedJobId);
    });

    it('should return null when boss.send returns null', async () => {
      mockBoss.send.mockResolvedValue(null);

      const result = await communicationQueue.addJob('email:send', {});

      expect(result).toBeNull();
    });

    it('should log success message with job type and ID', async () => {
      mockBoss.send.mockResolvedValue('logged-email-job');

      await communicationQueue.addJob('email:send', { to: 'log@test.com' });

      expect(logger.info).toHaveBeenCalled();
    });

    it('should log error and rethrow when send fails', async () => {
      const mockError = new Error('Queue connection lost');
      mockBoss.send.mockRejectedValue(mockError);

      await expect(
        communicationQueue.addJob('email:send', {})
      ).rejects.toThrow('Queue connection lost');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should not catch and swallow errors', async () => {
      const customError = new Error('Unexpected queue error');
      mockBoss.send.mockRejectedValue(customError);

      await expect(communicationQueue.addJob('email:send', {})).rejects.toThrow(customError);
    });

    it('should handle high priority email jobs', async () => {
      const urgentEmail = { to: 'urgent@example.com', subject: 'URGENT' };
      mockBoss.send.mockResolvedValue('urgent-job-id');

      await communicationQueue.addJob('email:send', urgentEmail, { priority: 1 });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'email:send',
        urgentEmail,
        expect.objectContaining({ priority: 1 })
      );
    });
  });

  describe('getBoss', () => {
    it('should return the PgBoss instance', () => {
      communicationQueue = new CommunicationQueue();

      const result = communicationQueue.getBoss();

      expect(result).toBe(mockBoss);
    });

    it('should return the same instance on multiple calls', () => {
      communicationQueue = new CommunicationQueue();

      const result1 = communicationQueue.getBoss();
      const result2 = communicationQueue.getBoss();

      expect(result1).toBe(result2);
    });
  });
});
