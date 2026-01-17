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
    getQueueMetrics: jest.fn(),
  },
}));

// Mock cache integration
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { QueueController } from '../../../src/controllers/queue.controller';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { logger } from '../../../src/utils/logger';
import { AuthRequest } from '../../../src/middleware/auth.middleware';

describe('QueueController', () => {
  let controller: QueueController;
  let mockReply: Partial<FastifyReply>;
  let mockQueueInstance: any;

  beforeEach(() => {
    controller = new QueueController();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockQueueInstance = {
      name: 'money',
      getJobs: jest.fn().mockResolvedValue([]),
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      clean: jest.fn().mockResolvedValue(undefined),
      empty: jest.fn().mockResolvedValue(undefined),
    };

    (QueueFactory.getQueue as jest.Mock).mockReturnValue(mockQueueInstance);
  });

  describe('listQueues', () => {
    it('should return metrics for all three queues', async () => {
      const mockMetrics = [
        { name: 'money', waiting: 5, active: 2, completed: 100, failed: 1 },
        { name: 'communication', waiting: 10, active: 1, completed: 500, failed: 5 },
        { name: 'background', waiting: 20, active: 0, completed: 1000, failed: 10 },
      ];

      (QueueFactory.getQueueMetrics as jest.Mock)
        .mockResolvedValueOnce(mockMetrics[0])
        .mockResolvedValueOnce(mockMetrics[1])
        .mockResolvedValueOnce(mockMetrics[2]);

      const mockRequest = {} as FastifyRequest;

      await controller.listQueues(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledTimes(3);
      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledWith('money');
      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledWith('communication');
      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledWith('background');
      expect(mockReply.send).toHaveBeenCalledWith(mockMetrics);
    });

    it('should return 500 when getQueueMetrics fails', async () => {
      (QueueFactory.getQueueMetrics as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      const mockRequest = {} as FastifyRequest;

      await controller.listQueues(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to list queues' });
      expect(logger.error).toHaveBeenCalledWith('Failed to list queues:', expect.any(Error));
    });

    it('should handle partial failures in Promise.all', async () => {
      (QueueFactory.getQueueMetrics as jest.Mock)
        .mockResolvedValueOnce({ name: 'money', waiting: 5 })
        .mockRejectedValueOnce(new Error('Communication queue unavailable'));

      const mockRequest = {} as FastifyRequest;

      await controller.listQueues(mockRequest, mockReply as FastifyReply);

      // Promise.all rejects if any promise rejects
      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to list queues' });
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status with job samples', async () => {
      const now = Date.now();
      const mockMetrics = { name: 'money', waiting: 2, active: 1, completed: 50, failed: 1 };

      const mockWaitingJobs = [
        { id: 'job-1', name: 'payment', timestamp: now - 10000 },
        { id: 'job-2', name: 'refund', timestamp: now - 5000 },
      ];

      const mockActiveJobs = [
        { id: 'job-3', name: 'payment', timestamp: now - 3000, processedOn: now - 1000 },
      ];

      const mockFailedJobs = [
        { id: 'job-4', name: 'payment', timestamp: now - 60000, finishedOn: now - 50000, failedReason: 'Timeout' },
      ];

      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue(mockMetrics);
      mockQueueInstance.getJobs
        .mockResolvedValueOnce(mockWaitingJobs)
        .mockResolvedValueOnce(mockActiveJobs)
        .mockResolvedValueOnce(mockFailedJobs);

      const mockRequest = {
        params: { name: 'money' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(QueueFactory.getQueueMetrics).toHaveBeenCalledWith('money');
      expect(mockQueueInstance.getJobs).toHaveBeenCalledWith(['waiting'], 0, 10);
      expect(mockQueueInstance.getJobs).toHaveBeenCalledWith(['active'], 0, 10);
      expect(mockQueueInstance.getJobs).toHaveBeenCalledWith(['failed'], 0, 10);

      expect(mockReply.send).toHaveBeenCalledWith({
        name: 'money',
        metrics: mockMetrics,
        samples: {
          waiting: [
            { id: 'job-1', type: 'payment', createdAt: expect.any(Date) },
            { id: 'job-2', type: 'refund', createdAt: expect.any(Date) },
          ],
          active: [
            { id: 'job-3', type: 'payment', startedAt: expect.any(Date) },
          ],
          failed: [
            { id: 'job-4', type: 'payment', failedAt: expect.any(Date), reason: 'Timeout' },
          ],
        },
      });
    });

    it('should handle empty job lists', async () => {
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ name: 'background' });
      mockQueueInstance.name = 'background';
      mockQueueInstance.getJobs.mockResolvedValue([]);

      const mockRequest = {
        params: { name: 'background' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        name: 'background',
        metrics: { name: 'background' },
        samples: {
          waiting: [],
          active: [],
          failed: [],
        },
      });
    });

    it('should use timestamp as fallback when processedOn is null', async () => {
      const now = Date.now();
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ name: 'money' });

      mockQueueInstance.getJobs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'job-1', name: 'payment', timestamp: now, processedOn: null }])
        .mockResolvedValueOnce([]);

      const mockRequest = {
        params: { name: 'money' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.samples.active[0].startedAt).toEqual(new Date(now));
    });

    it('should use timestamp as fallback when finishedOn is null for failed jobs', async () => {
      const now = Date.now();
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ name: 'money' });

      mockQueueInstance.getJobs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'job-1', name: 'payment', timestamp: now, finishedOn: null, failedReason: 'Error' }]);

      const mockRequest = {
        params: { name: 'money' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.samples.failed[0].failedAt).toEqual(new Date(now));
    });

    it('should return 500 when getQueue fails', async () => {
      (QueueFactory.getQueue as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid queue name');
      });

      const mockRequest = {
        params: { name: 'invalid' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get queue status' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get queue status:', expect.any(Error));
    });

    it('should return 500 when getJobs fails', async () => {
      (QueueFactory.getQueueMetrics as jest.Mock).mockResolvedValue({ name: 'money' });
      mockQueueInstance.getJobs.mockRejectedValue(new Error('Redis timeout'));

      const mockRequest = {
        params: { name: 'money' },
      } as unknown as FastifyRequest;

      await controller.getQueueStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get queue status' });
    });
  });

  describe('pauseQueue', () => {
    it('should pause queue successfully', async () => {
      const mockRequest = {
        params: { name: 'money' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.pauseQueue(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(mockQueueInstance.pause).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        status: 'paused',
        message: 'Queue has been paused',
      });
    });

    it('should log warning when queue is paused', async () => {
      const mockRequest = {
        params: { name: 'communication' },
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.pauseQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalledWith('Queue communication paused by user ops-user');
    });

    it('should handle missing user gracefully in log', async () => {
      const mockRequest = {
        params: { name: 'background' },
        user: undefined,
      } as unknown as AuthRequest;

      await controller.pauseQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalledWith('Queue background paused by user undefined');
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'background',
        status: 'paused',
        message: 'Queue has been paused',
      });
    });

    it('should return 500 when pause fails', async () => {
      mockQueueInstance.pause.mockRejectedValue(new Error('Cannot pause queue'));

      const mockRequest = {
        params: { name: 'money' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.pauseQueue(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to pause queue' });
      expect(logger.error).toHaveBeenCalledWith('Failed to pause queue:', expect.any(Error));
    });

    it('should return 500 when getQueue throws', async () => {
      (QueueFactory.getQueue as jest.Mock).mockImplementation(() => {
        throw new Error('Queue not found');
      });

      const mockRequest = {
        params: { name: 'nonexistent' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.pauseQueue(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to pause queue' });
    });
  });

  describe('resumeQueue', () => {
    it('should resume queue successfully', async () => {
      const mockRequest = {
        params: { name: 'money' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.resumeQueue(mockRequest, mockReply as FastifyReply);

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(mockQueueInstance.resume).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        status: 'active',
        message: 'Queue has been resumed',
      });
    });

    it('should log info when queue is resumed', async () => {
      const mockRequest = {
        params: { name: 'communication' },
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.resumeQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith('Queue communication resumed by user ops-user');
    });

    it('should handle missing user gracefully in log', async () => {
      const mockRequest = {
        params: { name: 'background' },
        user: undefined,
      } as unknown as AuthRequest;

      await controller.resumeQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith('Queue background resumed by user undefined');
    });

    it('should return 500 when resume fails', async () => {
      mockQueueInstance.resume.mockRejectedValue(new Error('Cannot resume queue'));

      const mockRequest = {
        params: { name: 'money' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.resumeQueue(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to resume queue' });
      expect(logger.error).toHaveBeenCalledWith('Failed to resume queue:', expect.any(Error));
    });
  });

  describe('clearQueue', () => {
    it('should clear queue by type when type is provided', async () => {
      const mockRequest = {
        params: { name: 'money' },
        query: { type: 'failed' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.clean).toHaveBeenCalledWith(0, 'failed');
      expect(mockQueueInstance.empty).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        action: 'cleared failed',
        message: 'Queue has been cleared',
      });
    });

    it('should clear completed jobs', async () => {
      const mockRequest = {
        params: { name: 'communication' },
        query: { type: 'completed' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.clean).toHaveBeenCalledWith(0, 'completed');
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'communication',
        action: 'cleared completed',
        message: 'Queue has been cleared',
      });
    });

    it('should clear delayed jobs', async () => {
      const mockRequest = {
        params: { name: 'background' },
        query: { type: 'delayed' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.clean).toHaveBeenCalledWith(0, 'delayed');
    });

    it('should clear wait jobs', async () => {
      const mockRequest = {
        params: { name: 'money' },
        query: { type: 'wait' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.clean).toHaveBeenCalledWith(0, 'wait');
    });

    it('should empty entire queue when no type is provided', async () => {
      const mockRequest = {
        params: { name: 'money' },
        query: {},
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.empty).toHaveBeenCalled();
      expect(mockQueueInstance.clean).not.toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        action: 'emptied',
        message: 'Queue has been cleared',
      });
    });

    it('should log warning when clearing by type', async () => {
      const mockRequest = {
        params: { name: 'money' },
        query: { type: 'failed' },
        user: { userId: 'cleanup-user' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalledWith('Queue money cleared (failed) by user cleanup-user');
    });

    it('should log warning when emptying queue', async () => {
      const mockRequest = {
        params: { name: 'background' },
        query: {},
        user: { userId: 'admin-user' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalledWith('Queue background emptied by user admin-user');
    });

    it('should return 500 when clean fails', async () => {
      mockQueueInstance.clean.mockRejectedValue(new Error('Clean operation failed'));

      const mockRequest = {
        params: { name: 'money' },
        query: { type: 'failed' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to clear queue' });
      expect(logger.error).toHaveBeenCalledWith('Failed to clear queue:', expect.any(Error));
    });

    it('should return 500 when empty fails', async () => {
      mockQueueInstance.empty.mockRejectedValue(new Error('Empty operation failed'));

      const mockRequest = {
        params: { name: 'money' },
        query: {},
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.clearQueue(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to clear queue' });
    });
  });

  describe('getQueueJobs', () => {
    const createMockJob = (overrides: any = {}) => ({
      id: 'job-1',
      name: 'payment',
      data: { amount: 100 },
      attemptsMade: 0,
      progress: jest.fn().mockReturnValue(0),
      timestamp: Date.now(),
      processedOn: null,
      finishedOn: null,
      failedReason: null,
      ...overrides,
    });

    it('should return waiting jobs by default', async () => {
      const mockJobs = [createMockJob({ id: 'job-1' }), createMockJob({ id: 'job-2' })];
      mockQueueInstance.getWaiting.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getWaiting).toHaveBeenCalledWith(0, 20);
      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        status: 'waiting',
        count: 2,
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: 'job-1', type: 'payment' }),
          expect.objectContaining({ id: 'job-2', type: 'payment' }),
        ]),
      });
    });

    it('should return active jobs when status is active', async () => {
      const mockJobs = [createMockJob({ id: 'job-1', processedOn: Date.now() })];
      mockQueueInstance.getActive.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'active' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getActive).toHaveBeenCalledWith(0, 20);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should return completed jobs when status is completed', async () => {
      const mockJobs = [createMockJob({ id: 'job-1', finishedOn: Date.now() })];
      mockQueueInstance.getCompleted.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'completed' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getCompleted).toHaveBeenCalledWith(0, 20);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should return failed jobs when status is failed', async () => {
      const mockJobs = [createMockJob({ id: 'job-1', failedReason: 'Timeout error' })];
      mockQueueInstance.getFailed.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'failed' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getFailed).toHaveBeenCalledWith(0, 20);
      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.jobs[0].failedReason).toBe('Timeout error');
    });

    it('should respect pagination parameters', async () => {
      mockQueueInstance.getWaiting.mockResolvedValue([]);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'waiting', start: '10', end: '30' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getWaiting).toHaveBeenCalledWith(10, 30);
    });

    it('should convert string pagination params to numbers', async () => {
      mockQueueInstance.getActive.mockResolvedValue([]);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'active', start: '5', end: '15' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockQueueInstance.getActive).toHaveBeenCalledWith(5, 15);
    });

    it('should return 400 for invalid status parameter', async () => {
      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'invalid-status' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid status parameter' });
    });

    it('should map job properties correctly', async () => {
      const now = Date.now();
      const mockJobs = [
        createMockJob({
          id: 'job-123',
          name: 'refund',
          data: { transactionId: 'tx-456' },
          attemptsMade: 3,
          progress: jest.fn().mockReturnValue(75),
          timestamp: now - 10000,
          processedOn: now - 5000,
          finishedOn: now,
          failedReason: null,
        }),
      ];
      mockQueueInstance.getCompleted.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: { status: 'completed' },
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      const job = sendCall.jobs[0];

      expect(job).toEqual({
        id: 'job-123',
        type: 'refund',
        data: { transactionId: 'tx-456' },
        attempts: 3,
        progress: 75,
        createdAt: expect.any(Date),
        processedAt: expect.any(Date),
        finishedAt: expect.any(Date),
        failedReason: null,
      });
    });

    it('should handle jobs without progress function', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          name: 'payment',
          data: {},
          attemptsMade: 0,
          progress: null, // No progress function
          timestamp: Date.now(),
          processedOn: null,
          finishedOn: null,
          failedReason: null,
        },
      ];
      mockQueueInstance.getWaiting.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.jobs[0].progress).toBe(0);
    });

    it('should handle null processedOn and finishedOn', async () => {
      const mockJobs = [createMockJob({ processedOn: null, finishedOn: null })];
      mockQueueInstance.getWaiting.mockResolvedValue(mockJobs);

      const mockRequest = {
        params: { name: 'money' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.jobs[0].processedAt).toBeNull();
      expect(sendCall.jobs[0].finishedAt).toBeNull();
    });

    it('should return empty array when no jobs found', async () => {
      mockQueueInstance.getWaiting.mockResolvedValue([]);

      const mockRequest = {
        params: { name: 'money' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        queue: 'money',
        status: 'waiting',
        count: 0,
        jobs: [],
      });
    });

    it('should return 500 when fetching jobs fails', async () => {
      mockQueueInstance.getWaiting.mockRejectedValue(new Error('Redis error'));

      const mockRequest = {
        params: { name: 'money' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get queue jobs' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get queue jobs:', expect.any(Error));
    });

    it('should return 500 when getQueue throws', async () => {
      (QueueFactory.getQueue as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid queue');
      });

      const mockRequest = {
        params: { name: 'invalid' },
        query: {},
      } as unknown as FastifyRequest;

      await controller.getQueueJobs(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get queue jobs' });
    });
  });
});
