// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock QueueFactory
jest.mock('../../../src/queues/factories/queue.factory', () => ({
  QueueFactory: {
    getQueue: jest.fn(),
  },
}));

// Mock cache integration
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { JobController } from '../../../src/controllers/job.controller';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { logger } from '../../../src/utils/logger';
import { AuthRequest } from '../../../src/middleware/auth.middleware';
import { QUEUE_PRIORITIES } from '../../../src/config/constants';

describe('JobController', () => {
  let controller: JobController;
  let mockReply: Partial<FastifyReply>;
  let mockQueueInstance: any;
  let mockJob: any;

  beforeEach(() => {
    controller = new JobController();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockJob = {
      id: 'job-123',
      name: 'payment',
      data: { amount: 100 },
      queue: { name: 'money' },
      timestamp: Date.now(),
      processedOn: null,
      finishedOn: null,
      attemptsMade: 0,
      getState: jest.fn().mockResolvedValue('waiting'),
      progress: jest.fn().mockReturnValue(0),
      retry: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockQueueInstance = {
      add: jest.fn().mockResolvedValue(mockJob),
      getJob: jest.fn().mockResolvedValue(mockJob),
    };

    (QueueFactory.getQueue as jest.Mock).mockReturnValue(mockQueueInstance);
  });

  describe('addJob', () => {
    it('should add job successfully and return 201', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          type: 'payment',
          data: { amount: 100, currency: 'USD' },
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'payment',
        expect.objectContaining({
          amount: 100,
          currency: 'USD',
          userId: 'user-123',
          addedAt: expect.any(String),
        }),
        expect.objectContaining({
          priority: QUEUE_PRIORITIES.HIGH,
          delay: 0,
          attempts: 10,
        })
      );
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        jobId: 'job-123',
        queue: 'money',
        type: 'payment',
        status: 'queued',
        options: expect.objectContaining({
          priority: QUEUE_PRIORITIES.HIGH,
          attempts: 10,
        }),
      });
    });

    it('should use HIGH priority and 10 attempts for money queue', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          type: 'payment',
          data: { amount: 50 },
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({
          priority: QUEUE_PRIORITIES.HIGH, // 7
          attempts: 10,
        })
      );
    });

    it('should use NORMAL priority and 3 attempts for non-money queues', async () => {
      const mockRequest = {
        body: {
          queue: 'communication',
          type: 'email',
          data: { to: 'test@example.com' },
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'email',
        expect.any(Object),
        expect.objectContaining({
          priority: QUEUE_PRIORITIES.NORMAL, // 5
          attempts: 3,
        })
      );
    });

    it('should use custom options when provided', async () => {
      const mockRequest = {
        body: {
          queue: 'background',
          type: 'analytics',
          data: { eventType: 'click' },
          options: {
            priority: 9,
            delay: 5000,
            attempts: 5,
          },
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'analytics',
        expect.any(Object),
        expect.objectContaining({
          priority: 9,
          delay: 5000,
          attempts: 5,
        })
      );
    });

    it('should add userId and addedAt to job data', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          type: 'payment',
          data: { amount: 100 },
        },
        user: { userId: 'user-456' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.userId).toBe('user-456');
      expect(jobData.addedAt).toBeDefined();
      expect(() => new Date(jobData.addedAt)).not.toThrow();
    });

    it('should handle missing user gracefully', async () => {
      const mockRequest = {
        body: {
          queue: 'background',
          type: 'cleanup',
          data: { targetId: 'target-1' },
        },
        user: undefined,
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.userId).toBeUndefined();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should log job addition with relevant details', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          type: 'refund',
          data: { transactionId: 'tx-123' },
        },
        user: { userId: 'user-789' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith(
        'Job added to money queue',
        expect.objectContaining({
          jobId: 'job-123',
          type: 'refund',
          userId: 'user-789',
        })
      );
    });

    it('should return 500 when queue throws an error', async () => {
      mockQueueInstance.add.mockRejectedValue(new Error('Redis connection failed'));

      const mockRequest = {
        body: {
          queue: 'money',
          type: 'payment',
          data: { amount: 100 },
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to add job' });
      expect(logger.error).toHaveBeenCalledWith('Failed to add job:', expect.any(Error));
    });

    it('should return 500 when QueueFactory.getQueue throws', async () => {
      (QueueFactory.getQueue as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid queue');
      });

      const mockRequest = {
        body: {
          queue: 'invalid',
          type: 'test',
          data: {},
        },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.addJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to add job' });
    });
  });

  describe('getJob', () => {
    it('should return job details when found', async () => {
      const now = Date.now();
      mockJob.timestamp = now;
      mockJob.processedOn = now + 1000;
      mockJob.finishedOn = now + 2000;
      mockJob.attemptsMade = 1;
      mockJob.getState.mockResolvedValue('completed');
      mockJob.progress.mockReturnValue(100);

      const mockRequest = {
        params: { id: 'job-123' },
        query: { queue: 'money' },
      } as unknown as FastifyRequest;

      await controller.getJob(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(mockQueueInstance.getJob).toHaveBeenCalledWith('job-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        id: 'job-123',
        queue: 'money',
        type: 'payment',
        data: { amount: 100 },
        state: 'completed',
        progress: 100,
        attempts: 1,
        createdAt: expect.any(Date),
        processedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      });
    });

    it('should return 400 when queue parameter is missing', async () => {
      const mockRequest = {
        params: { id: 'job-123' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Queue parameter required' });
      expect(QueueFactory.getQueue).not.toHaveBeenCalled();
    });

    it('should return 404 when job is not found', async () => {
      mockQueueInstance.getJob.mockResolvedValue(null);

      const mockRequest = {
        params: { id: 'nonexistent-job' },
        query: { queue: 'money' },
      } as unknown as FastifyRequest;

      await controller.getJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Job not found' });
    });

    it('should handle null processedOn and finishedOn', async () => {
      mockJob.processedOn = null;
      mockJob.finishedOn = null;

      const mockRequest = {
        params: { id: 'job-123' },
        query: { queue: 'money' },
      } as unknown as FastifyRequest;

      await controller.getJob(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.processedAt).toBeNull();
      expect(sendCall.finishedAt).toBeNull();
    });

    it('should return 500 when an error occurs', async () => {
      mockQueueInstance.getJob.mockRejectedValue(new Error('Database error'));

      const mockRequest = {
        params: { id: 'job-123' },
        query: { queue: 'money' },
      } as unknown as FastifyRequest;

      await controller.getJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get job' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get job:', expect.any(Error));
    });
  });

  describe('retryJob', () => {
    it('should retry job successfully', async () => {
      const mockRequest = {
        params: { id: 'job-123' },
        body: { queue: 'money' },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.retryJob(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getJob).toHaveBeenCalledWith('job-123');
      expect(mockJob.retry).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        jobId: 'job-123',
        status: 'retrying',
        message: 'Job has been queued for retry',
      });
    });

    it('should log retry action with user ID', async () => {
      const mockRequest = {
        params: { id: 'job-456' },
        body: { queue: 'communication' },
        user: { userId: 'admin-user' },
      } as AuthRequest;

      await controller.retryJob(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith('Job job-456 retried by user admin-user');
    });

    it('should return 404 when job not found', async () => {
      mockQueueInstance.getJob.mockResolvedValue(null);

      const mockRequest = {
        params: { id: 'nonexistent' },
        body: { queue: 'money' },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.retryJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Job not found' });
      expect(mockJob.retry).not.toHaveBeenCalled();
    });

    it('should return 500 when retry fails', async () => {
      mockJob.retry.mockRejectedValue(new Error('Cannot retry completed job'));

      const mockRequest = {
        params: { id: 'job-123' },
        body: { queue: 'money' },
        user: { userId: 'user-123' },
      } as AuthRequest;

      await controller.retryJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retry job' });
      expect(logger.error).toHaveBeenCalledWith('Failed to retry job:', expect.any(Error));
    });
  });

  describe('cancelJob', () => {
    it('should cancel job successfully', async () => {
      const mockRequest = {
        params: { id: 'job-123' },
        query: { queue: 'money' },
        user: { userId: 'user-123' },
      } as unknown as AuthRequest;

      await controller.cancelJob(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getJob).toHaveBeenCalledWith('job-123');
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        jobId: 'job-123',
        status: 'cancelled',
        message: 'Job has been cancelled',
      });
    });

    it('should log cancellation with user ID', async () => {
      const mockRequest = {
        params: { id: 'job-789' },
        query: { queue: 'background' },
        user: { userId: 'moderator-user' },
      } as unknown as AuthRequest;

      await controller.cancelJob(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith('Job job-789 cancelled by user moderator-user');
    });

    it('should return 400 when queue parameter is missing', async () => {
      const mockRequest = {
        params: { id: 'job-123' },
        query: {},
        user: { userId: 'user-123' },
      } as unknown as AuthRequest;

      await controller.cancelJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Queue parameter required' });
    });

    it('should return 404 when job not found', async () => {
      mockQueueInstance.getJob.mockResolvedValue(null);

      const mockRequest = {
        params: { id: 'nonexistent' },
        query: { queue: 'money' },
        user: { userId: 'user-123' },
      } as unknown as AuthRequest;

      await controller.cancelJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Job not found' });
    });

    it('should return 500 when removal fails', async () => {
      mockJob.remove.mockRejectedValue(new Error('Job is currently processing'));

      const mockRequest = {
        params: { id: 'job-123' },
        query: { queue: 'money' },
        user: { userId: 'user-123' },
      } as unknown as AuthRequest;

      await controller.cancelJob(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to cancel job' });
    });
  });

  describe('addBatchJobs', () => {
    it('should add batch jobs successfully', async () => {
      let jobIdCounter = 1;
      mockQueueInstance.add.mockImplementation(() =>
        Promise.resolve({ id: `job-${jobIdCounter++}` })
      );

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            { type: 'analytics', data: { targetId: 'target-1', eventType: 'click' } },
            { type: 'analytics', data: { targetId: 'target-2', eventType: 'view' } },
          ],
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.add).toHaveBeenCalledTimes(2);
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'background',
        total: 2,
        successful: 2,
        failed: 0,
        jobs: [
          { index: 0, jobId: 'job-1', type: 'analytics', status: 'queued' },
          { index: 1, jobId: 'job-2', type: 'analytics', status: 'queued' },
        ],
        errors: undefined,
      });
    });

    it('should return 400 when jobs array is empty', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [],
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No jobs provided' });
    });

    it('should return 400 when jobs is not an array', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: 'not-an-array',
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No jobs provided' });
    });

    it('should return 400 when batch exceeds 100 jobs', async () => {
      const jobs = Array(101).fill({ type: 'analytics', data: { targetId: 'x' } });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs,
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Batch size exceeds maximum of 100 jobs' });
    });

    it('should validate money queue jobs require amount for payment type', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: { currency: 'USD' } }, // Missing amount
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          successful: 0,
          failed: 1,
          errors: expect.arrayContaining([
            expect.objectContaining({
              index: 0,
              error: 'Payment jobs require amount',
            }),
          ]),
        })
      );
    });

    it('should validate money queue rejects invalid amounts', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: { amount: -100 } }, // Negative amount
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.failed).toBe(1);
      expect(response.errors[0].error).toBe('Invalid amount value');
    });

    it('should validate refund jobs require transactionId', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'refund', data: { amount: 50 } }, // Missing transactionId
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.errors[0].error).toBe('Refund jobs require transactionId');
    });

    it('should validate communication queue email jobs require recipient', async () => {
      const mockRequest = {
        body: {
          queue: 'communication',
          jobs: [
            { type: 'email', data: { subject: 'Hello' } }, // Missing 'to'
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.errors[0].error).toBe('Email jobs require recipient');
    });

    it('should validate email addresses', async () => {
      const mockRequest = {
        body: {
          queue: 'communication',
          jobs: [
            { type: 'email', data: { to: 'invalid-email' } },
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.errors[0].error).toBe('Invalid email address');
    });

    it('should validate background jobs require targetId', async () => {
      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            { type: 'analytics', data: { eventType: 'click' } }, // Missing targetId
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.errors[0].error).toBe('Background jobs require targetId');
    });

    it('should stop on first error when stopOnError is true', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: {} }, // Invalid - missing amount
            { type: 'payment', data: { amount: 100 } }, // Valid
          ],
          options: { stopOnError: true, validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Business validation failed',
        failedAt: 0,
        validationErrors: expect.any(Array),
      });
      // Should not have added any jobs
      expect(mockQueueInstance.add).not.toHaveBeenCalled();
    });

    it('should continue processing when stopOnError is false', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            { type: 'analytics', data: {} }, // Invalid - missing targetId
            { type: 'analytics', data: { targetId: 'valid-target', eventType: 'click' } }, // Valid
          ],
          options: { stopOnError: false, validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockQueueInstance.add).toHaveBeenCalledTimes(1);
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.successful).toBe(1);
      expect(response.failed).toBe(1);
    });

    it('should sanitize job data by removing dangerous keys', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      // Use keys that will actually appear in Object.entries()
      // __proto__ is special and won't show up, but __dangerous and prototypeHack will
      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            {
              type: 'analytics',
              data: {
                targetId: 'target-1',
                eventType: 'click',
                __dangerous: 'malicious',
                prototypeHack: 'bad',
                safeKey: 'safe',
              },
            },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      // Keys starting with __ should be removed
      expect(jobData.__dangerous).toBeUndefined();
      // Keys containing 'prototype' should be removed
      expect(jobData.prototypeHack).toBeUndefined();
      // Safe keys should remain
      expect(jobData.safeKey).toBe('safe');
      expect(jobData.targetId).toBe('target-1');
    });

    it('should sanitize script tags from string values', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            {
              type: 'analytics',
              data: {
                targetId: 'target-1',
                eventType: 'click',
                description: 'Hello <script>alert("xss")</script> World',
              },
            },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.description).toBe('Hello  World');
      expect(jobData.description).not.toContain('script');
    });

    it('should sanitize SQL keywords from string values', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            {
              type: 'analytics',
              data: {
                targetId: 'target-1',
                eventType: 'click',
                query: 'SELECT * FROM users; DROP TABLE users;',
              },
            },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.query).not.toContain('SELECT');
      expect(jobData.query).not.toContain('DROP');
    });

    it('should enrich job data with userId, batchIndex, and addedAt', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            { type: 'analytics', data: { targetId: 't1', eventType: 'click' } },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'batch-user-123' },
        headers: { 'x-batch-id': 'batch-abc-123' },
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.userId).toBe('batch-user-123');
      expect(jobData.batchId).toBe('batch-abc-123');
      expect(jobData.batchIndex).toBe(0);
      expect(jobData.addedAt).toBeDefined();
    });

    it('should rollback queued jobs when stopOnError and processing fails', async () => {
      let callCount = 0;
      const createdJobs: any[] = [];

      mockQueueInstance.add.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Queue full'));
        }
        const job = { id: `job-${callCount}`, remove: jest.fn().mockResolvedValue(undefined) };
        createdJobs.push(job);
        return Promise.resolve(job);
      });

      mockQueueInstance.getJob.mockImplementation((id: string) => {
        return Promise.resolve(createdJobs.find(j => j.id === id));
      });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            { type: 'analytics', data: { targetId: 't1', eventType: 'click' } },
            { type: 'analytics', data: { targetId: 't2', eventType: 'view' } },
          ],
          options: { stopOnError: true, validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      // First job should have been removed
      expect(createdJobs[0].remove).toHaveBeenCalled();
    });

    it('should log batch completion with summary', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'communication',
          jobs: [
            { type: 'email', data: { to: 'test@example.com', subject: 'Hi', template: 'welcome' } },
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-batch' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith(
        'Batch of 1 jobs added to communication queue',
        expect.objectContaining({
          userId: 'user-batch',
          successful: 1,
          failed: 0,
        })
      );
    });

    it('should return 500 for unexpected errors', async () => {
      (QueueFactory.getQueue as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [{ type: 'payment', data: { amount: 100 } }],
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to add batch jobs' });
      expect(logger.error).toHaveBeenCalledWith('Failed to add batch jobs:', expect.any(Error));
    });

    it('should skip validation when validateAll is false', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: {} }, // Would fail validation but validateAll is false
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      // Job should be processed without validation
      expect(mockQueueInstance.add).toHaveBeenCalledTimes(1);
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should use correct default options for money queue in batch', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: { amount: 100, currency: 'USD', userId: 'u1' } },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobOptions = addCall[2];

      expect(jobOptions.priority).toBe(QUEUE_PRIORITIES.HIGH);
      expect(jobOptions.attempts).toBe(10);
      expect(jobOptions.backoff).toEqual({ type: 'exponential', delay: 2000 });
    });

    it('should handle nested object sanitization', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'background',
          jobs: [
            {
              type: 'analytics',
              data: {
                targetId: 'target-1',
                eventType: 'click',
                nested: {
                  __innerDangerous: 'bad',
                  safe: 'value',
                  deeper: {
                    prototypeAttack: 'malicious',
                    good: 'data',
                  },
                },
              },
            },
          ],
          options: { validateAll: false },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const addCall = mockQueueInstance.add.mock.calls[0];
      const jobData = addCall[1];

      expect(jobData.nested.__innerDangerous).toBeUndefined();
      expect(jobData.nested.safe).toBe('value');
      expect(jobData.nested.deeper.prototypeAttack).toBeUndefined();
      expect(jobData.nested.deeper.good).toBe('data');
    });

    it('should validate amount upper bound for money queue', async () => {
      const mockRequest = {
        body: {
          queue: 'money',
          jobs: [
            { type: 'payment', data: { amount: 1000001 } }, // Exceeds max 1000000
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.failed).toBe(1);
      expect(response.errors[0].error).toBe('Invalid amount value');
    });

    it('should accept valid email addresses', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-1' });

      const mockRequest = {
        body: {
          queue: 'communication',
          jobs: [
            { type: 'email', data: { to: 'valid@example.com', subject: 'Test', template: 'welcome' } },
          ],
          options: { validateAll: true },
        },
        user: { userId: 'user-123' },
        headers: {},
      } as unknown as AuthRequest;

      await controller.addBatchJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockQueueInstance.add).toHaveBeenCalledTimes(1);
    });
  });
});
