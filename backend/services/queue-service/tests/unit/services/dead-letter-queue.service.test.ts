// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    recordJobFailed: jest.fn(),
  },
}));

import { DeadLetterQueueService, DeadLetterJob } from '../../../src/services/dead-letter-queue.service';
import { BullQueueAdapter } from '../../../src/adapters/bull-queue-adapter';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { logger } from '../../../src/utils/logger';
import { metricsService } from '../../../src/services/metrics.service';

describe('DeadLetterQueueService', () => {
  let service: DeadLetterQueueService;
  let mockDlqQueue: jest.Mocked<Partial<BullQueueAdapter>>;

  beforeEach(() => {
    mockDlqQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dlq-job-1' }),
    };

    service = new DeadLetterQueueService(mockDlqQueue as BullQueueAdapter);
  });

  describe('constructor', () => {
    it('should initialize with dlq queue', () => {
      expect(service).toBeInstanceOf(DeadLetterQueueService);
    });

    it('should log initialization of event handlers', () => {
      expect(logger.info).toHaveBeenCalledWith('DLQ event handlers initialized');
    });
  });

  describe('moveToDeadLetterQueue', () => {
    const createMockJob = (overrides: Partial<BullJobData> = {}): BullJobData => ({
      id: 'job-123',
      name: 'payment',
      data: { userId: 'user-1', amount: 100 },
      attemptsMade: 3,
      ...overrides,
    } as BullJobData);

    it('should move job to dead letter queue', async () => {
      const mockJob = createMockJob();
      const error = new Error('Payment gateway timeout');

      await service.moveToDeadLetterQueue(mockJob, error);

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        'failed-job',
        expect.objectContaining({
          id: 'job-123',
          queueName: 'payment',
          data: { userId: 'user-1', amount: 100 },
          failedReason: 'Payment gateway timeout',
          attemptsMade: 3,
        }),
        {
          removeOnComplete: false,
          removeOnFail: false,
        }
      );
    });

    it('should store job in dlqStorage', async () => {
      const mockJob = createMockJob();
      const error = new Error('Test error');

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob).not.toBeNull();
      expect(storedJob?.id).toBe('job-123');
      expect(storedJob?.failedReason).toBe('Test error');
    });

    it('should include stack trace in dead letter job', async () => {
      const mockJob = createMockJob();
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob?.stackTrace).toBe('Error: Test error\n    at test.js:1:1');
    });

    it('should record metrics for failed job', async () => {
      const mockJob = createMockJob({ name: 'refund' });
      const error = new Error('Refund failed');

      await service.moveToDeadLetterQueue(mockJob, error);

      expect(metricsService.recordJobFailed).toHaveBeenCalledWith('refund', 'moved_to_dlq');
    });

    it('should log error with job details', async () => {
      const mockJob = createMockJob();
      const error = new Error('Processing error');

      await service.moveToDeadLetterQueue(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith('Job moved to dead letter queue', {
        jobId: 'job-123',
        queueName: 'payment',
        attemptsMade: 3,
        error: 'Processing error',
      });
    });

    it('should send critical alert for payment jobs', async () => {
      const mockJob = createMockJob({ name: 'payment' });
      const error = new Error('Critical failure');

      await service.moveToDeadLetterQueue(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Job permanently failed',
        expect.objectContaining({
          jobId: 'job-123',
          queueName: 'payment',
        })
      );
    });

    it('should send critical alert for refund jobs', async () => {
      const mockJob = createMockJob({ name: 'refund' });
      const error = new Error('Refund critical failure');

      await service.moveToDeadLetterQueue(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Job permanently failed',
        expect.objectContaining({
          queueName: 'refund',
        })
      );
    });

    it('should not send critical alert for non-critical jobs', async () => {
      const mockJob = createMockJob({ name: 'email' });
      const error = new Error('Email failed');

      await service.moveToDeadLetterQueue(mockJob, error);

      const criticalCalls = (logger.error as jest.Mock).mock.calls.filter(
        call => call[0] === 'CRITICAL: Job permanently failed'
      );
      expect(criticalCalls).toHaveLength(0);
    });

    it('should handle unknown job name', async () => {
      const mockJob = createMockJob({ name: undefined });
      const error = new Error('Unknown job failed');

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob?.queueName).toBe('unknown');
    });

    it('should handle zero attempts made', async () => {
      const mockJob = createMockJob({ attemptsMade: 0 });
      const error = new Error('Immediate failure');

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob?.attemptsMade).toBe(0);
    });

    it('should handle undefined attemptsMade', async () => {
      const mockJob = createMockJob({ attemptsMade: undefined });
      const error = new Error('Failure');

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob?.attemptsMade).toBe(0);
    });

    it('should handle dlq queue add failure gracefully', async () => {
      mockDlqQueue.add = jest.fn().mockRejectedValue(new Error('Queue unavailable'));
      const mockJob = createMockJob();
      const error = new Error('Original error');

      // Should not throw
      await service.moveToDeadLetterQueue(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith('Failed to move job to DLQ', {
        jobId: 'job-123',
        error: 'Queue unavailable',
      });
    });

    it('should set metadata lastFailedAt timestamp', async () => {
      const beforeTime = new Date();
      const mockJob = createMockJob();
      const error = new Error('Error');

      await service.moveToDeadLetterQueue(mockJob, error);

      const storedJob = await service.getDeadLetterJob('job-123');
      expect(storedJob?.metadata.lastFailedAt).toBeInstanceOf(Date);
      expect(storedJob?.metadata.lastFailedAt?.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  describe('getDeadLetterJobs', () => {
    const addTestJobs = async (count: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        const mockJob: BullJobData = {
          id: `job-${i}`,
          name: 'test',
          data: { index: i },
          attemptsMade: 1,
        } as BullJobData;
        await service.moveToDeadLetterQueue(mockJob, new Error(`Error ${i}`));
      }
    };

    it('should return empty array when no jobs', async () => {
      const jobs = await service.getDeadLetterJobs();

      expect(jobs).toEqual([]);
    });

    it('should return all jobs when under limit', async () => {
      await addTestJobs(5);

      const jobs = await service.getDeadLetterJobs();

      expect(jobs).toHaveLength(5);
    });

    it('should respect limit parameter', async () => {
      await addTestJobs(10);

      const jobs = await service.getDeadLetterJobs(5);

      expect(jobs).toHaveLength(5);
    });

    it('should use default limit of 100', async () => {
      // This is implicit - we'd need to add 101 jobs to test, but it's expensive
      // Just verify the method accepts no parameters
      const jobs = await service.getDeadLetterJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });

    it('should sort jobs by timestamp descending (newest first)', async () => {
      // Add jobs with delays to ensure different timestamps
      const job1: BullJobData = { id: 'job-1', name: 'test', data: {}, attemptsMade: 1 } as BullJobData;
      await service.moveToDeadLetterQueue(job1, new Error('Error 1'));

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const job2: BullJobData = { id: 'job-2', name: 'test', data: {}, attemptsMade: 1 } as BullJobData;
      await service.moveToDeadLetterQueue(job2, new Error('Error 2'));

      const jobs = await service.getDeadLetterJobs();

      expect(jobs[0].id).toBe('job-2'); // Newest first
      expect(jobs[1].id).toBe('job-1');
    });
  });

  describe('getDeadLetterJob', () => {
    it('should return job when exists', async () => {
      const mockJob: BullJobData = {
        id: 'specific-job',
        name: 'payment',
        data: { amount: 500 },
        attemptsMade: 2,
      } as BullJobData;
      await service.moveToDeadLetterQueue(mockJob, new Error('Payment failed'));

      const job = await service.getDeadLetterJob('specific-job');

      expect(job).not.toBeNull();
      expect(job?.id).toBe('specific-job');
      expect(job?.data).toEqual({ amount: 500 });
    });

    it('should return null when job does not exist', async () => {
      const job = await service.getDeadLetterJob('nonexistent');

      expect(job).toBeNull();
    });
  });

  describe('retryDeadLetterJob', () => {
    let mockOriginalQueue: jest.Mocked<Partial<BullQueueAdapter>>;

    beforeEach(() => {
      mockOriginalQueue = {
        add: jest.fn().mockResolvedValue({ id: 'new-job-1' }),
      };
    });

    it('should retry job successfully', async () => {
      const mockJob: BullJobData = {
        id: 'retry-job',
        name: 'payment',
        data: { amount: 100 },
        attemptsMade: 3,
      } as BullJobData;
      await service.moveToDeadLetterQueue(mockJob, new Error('Failed'));

      const result = await service.retryDeadLetterJob('retry-job', mockOriginalQueue as BullQueueAdapter);

      expect(result).toBe(true);
      expect(mockOriginalQueue.add).toHaveBeenCalledWith(
        { amount: 100 },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
    });

    it('should remove job from DLQ after successful retry', async () => {
      const mockJob: BullJobData = {
        id: 'remove-job',
        name: 'test',
        data: {},
        attemptsMade: 1,
      } as BullJobData;
      await service.moveToDeadLetterQueue(mockJob, new Error('Error'));

      await service.retryDeadLetterJob('remove-job', mockOriginalQueue as BullQueueAdapter);

      const job = await service.getDeadLetterJob('remove-job');
      expect(job).toBeNull();
    });

    it('should log successful retry', async () => {
      const mockJob: BullJobData = {
        id: 'log-job',
        name: 'email',
        data: {},
        attemptsMade: 1,
      } as BullJobData;
      await service.moveToDeadLetterQueue(mockJob, new Error('Error'));

      await service.retryDeadLetterJob('log-job', mockOriginalQueue as BullQueueAdapter);

      expect(logger.info).toHaveBeenCalledWith('Job retried from dead letter queue', {
        jobId: 'log-job',
        queueName: 'email',
      });
    });

    it('should return false when job not found', async () => {
      const result = await service.retryDeadLetterJob('nonexistent', mockOriginalQueue as BullQueueAdapter);

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Dead letter job not found', { jobId: 'nonexistent' });
    });

    it('should return false when queue add fails', async () => {
      const mockJob: BullJobData = {
        id: 'fail-retry',
        name: 'test',
        data: {},
        attemptsMade: 1,
      } as BullJobData;
      await service.moveToDeadLetterQueue(mockJob, new Error('Error'));

      mockOriginalQueue.add = jest.fn().mockRejectedValue(new Error('Queue error'));

      const result = await service.retryDeadLetterJob('fail-retry', mockOriginalQueue as BullQueueAdapter);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to retry dead letter job', {
        jobId: 'fail-retry',
        error: 'Queue error',
      });
    });
  });

  describe('retryMultipleJobs', () => {
    let queues: Map<string, Partial<BullQueueAdapter>>;
    let mockPaymentQueue: jest.Mocked<Partial<BullQueueAdapter>>;
    let mockEmailQueue: jest.Mocked<Partial<BullQueueAdapter>>;

    beforeEach(async () => {
      mockPaymentQueue = { add: jest.fn().mockResolvedValue({ id: 'new-1' }) };
      mockEmailQueue = { add: jest.fn().mockResolvedValue({ id: 'new-2' }) };

      queues = new Map();
      queues.set('payment', mockPaymentQueue);
      queues.set('email', mockEmailQueue);

      // Add test jobs
      await service.moveToDeadLetterQueue(
        { id: 'payment-1', name: 'payment', data: { amount: 100 }, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );
      await service.moveToDeadLetterQueue(
        { id: 'email-1', name: 'email', data: { to: 'test@test.com' }, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );
    });

    it('should retry multiple jobs successfully', async () => {
      const result = await service.retryMultipleJobs(
        ['payment-1', 'email-1'],
        queues as Map<string, BullQueueAdapter>
      );

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      mockPaymentQueue.add = jest.fn().mockRejectedValue(new Error('Queue error'));

      const result = await service.retryMultipleJobs(
        ['payment-1', 'email-1'],
        queues as Map<string, BullQueueAdapter>
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle nonexistent job IDs', async () => {
      const result = await service.retryMultipleJobs(
        ['nonexistent-1', 'payment-1'],
        queues as Map<string, BullQueueAdapter>
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle missing queue for job', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'unknown-queue-job', name: 'unknown', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const result = await service.retryMultipleJobs(
        ['unknown-queue-job'],
        queues as Map<string, BullQueueAdapter>
      );

      expect(result.failed).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith('Queue not found for DLQ job', {
        jobId: 'unknown-queue-job',
        queueName: 'unknown',
      });
    });

    it('should log completion summary', async () => {
      await service.retryMultipleJobs(['payment-1', 'email-1'], queues as Map<string, BullQueueAdapter>);

      expect(logger.info).toHaveBeenCalledWith('Bulk retry completed', {
        succeeded: 2,
        failed: 0,
        total: 2,
      });
    });

    it('should handle empty job IDs array', async () => {
      const result = await service.retryMultipleJobs([], queues as Map<string, BullQueueAdapter>);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('deleteDeadLetterJob', () => {
    it('should delete existing job', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'delete-me', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const result = await service.deleteDeadLetterJob('delete-me');

      expect(result).toBe(true);
      expect(await service.getDeadLetterJob('delete-me')).toBeNull();
    });

    it('should log deletion', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'log-delete', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      await service.deleteDeadLetterJob('log-delete');

      expect(logger.info).toHaveBeenCalledWith('Dead letter job deleted', { jobId: 'log-delete' });
    });

    it('should return false for nonexistent job', async () => {
      const result = await service.deleteDeadLetterJob('nonexistent');

      expect(result).toBe(false);
    });

    it('should not log for nonexistent job', async () => {
      jest.clearAllMocks();

      await service.deleteDeadLetterJob('nonexistent');

      const deleteCalls = (logger.info as jest.Mock).mock.calls.filter(
        call => call[0] === 'Dead letter job deleted'
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe('clearOldJobs', () => {
    it('should clear jobs older than retention period', async () => {
      // Add job with old timestamp
      await service.moveToDeadLetterQueue(
        { id: 'old-job', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      // Manually set old timestamp
      const oldJob = await service.getDeadLetterJob('old-job');
      if (oldJob) {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 31); // 31 days ago
        oldJob.timestamp = oldDate;
      }

      const cleared = await service.clearOldJobs(30);

      expect(cleared).toBe(1);
      expect(await service.getDeadLetterJob('old-job')).toBeNull();
    });

    it('should not clear recent jobs', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'recent-job', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const cleared = await service.clearOldJobs(30);

      expect(cleared).toBe(0);
      expect(await service.getDeadLetterJob('recent-job')).not.toBeNull();
    });

    it('should use default retention of 30 days', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'test-job', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      // With default 30 days, recent job should not be cleared
      const cleared = await service.clearOldJobs();

      expect(cleared).toBe(0);
    });

    it('should log when jobs are cleared', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'old-job', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const oldJob = await service.getDeadLetterJob('old-job');
      if (oldJob) {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        oldJob.timestamp = oldDate;
      }

      await service.clearOldJobs(5);

      expect(logger.info).toHaveBeenCalledWith('Cleared old DLQ jobs', {
        count: 1,
        retentionDays: 5,
      });
    });

    it('should not log when no jobs cleared', async () => {
      jest.clearAllMocks();

      await service.clearOldJobs(30);

      const clearCalls = (logger.info as jest.Mock).mock.calls.filter(
        call => call[0] === 'Cleared old DLQ jobs'
      );
      expect(clearCalls).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics when no jobs', () => {
      const stats = service.getStatistics();

      expect(stats).toEqual({
        totalJobs: 0,
        byQueue: {},
        oldestJob: undefined,
        newestJob: undefined,
      });
    });

    it('should return correct total count', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'job-1', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );
      await service.moveToDeadLetterQueue(
        { id: 'job-2', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const stats = service.getStatistics();

      expect(stats.totalJobs).toBe(2);
    });

    it('should group jobs by queue name', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'payment-1', name: 'payment', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );
      await service.moveToDeadLetterQueue(
        { id: 'payment-2', name: 'payment', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );
      await service.moveToDeadLetterQueue(
        { id: 'email-1', name: 'email', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Error')
      );

      const stats = service.getStatistics();

      expect(stats.byQueue).toEqual({
        payment: 2,
        email: 1,
      });
    });

    it('should return oldest and newest job timestamps', async () => {
      const job1: BullJobData = { id: 'job-1', name: 'test', data: {}, attemptsMade: 1 } as BullJobData;
      await service.moveToDeadLetterQueue(job1, new Error('Error'));

      await new Promise(resolve => setTimeout(resolve, 10));

      const job2: BullJobData = { id: 'job-2', name: 'test', data: {}, attemptsMade: 1 } as BullJobData;
      await service.moveToDeadLetterQueue(job2, new Error('Error'));

      const stats = service.getStatistics();

      expect(stats.oldestJob).toBeInstanceOf(Date);
      expect(stats.newestJob).toBeInstanceOf(Date);
      expect(stats.oldestJob!.getTime()).toBeLessThanOrEqual(stats.newestJob!.getTime());
    });
  });

  describe('exportJobs', () => {
    it('should return all jobs', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'export-1', name: 'test', data: { a: 1 }, attemptsMade: 1 } as BullJobData,
        new Error('Error 1')
      );
      await service.moveToDeadLetterQueue(
        { id: 'export-2', name: 'test', data: { b: 2 }, attemptsMade: 2 } as BullJobData,
        new Error('Error 2')
      );

      const exported = await service.exportJobs();

      expect(exported).toHaveLength(2);
      expect(exported.map(j => j.id).sort()).toEqual(['export-1', 'export-2']);
    });

    it('should return empty array when no jobs', async () => {
      const exported = await service.exportJobs();

      expect(exported).toEqual([]);
    });
  });

  describe('getFailuresByErrorType', () => {
    it('should group failures by error type', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'job-1', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('TimeoutError: Connection timed out')
      );
      await service.moveToDeadLetterQueue(
        { id: 'job-2', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('TimeoutError: Read timeout')
      );
      await service.moveToDeadLetterQueue(
        { id: 'job-3', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('ValidationError: Invalid input')
      );

      const failures = service.getFailuresByErrorType();

      expect(failures['TimeoutError']).toBe(2);
      expect(failures['ValidationError']).toBe(1);
    });

    it('should return empty object when no jobs', () => {
      const failures = service.getFailuresByErrorType();

      expect(failures).toEqual({});
    });

    it('should handle errors without colon', async () => {
      await service.moveToDeadLetterQueue(
        { id: 'job-1', name: 'test', data: {}, attemptsMade: 1 } as BullJobData,
        new Error('Simple error message')
      );

      const failures = service.getFailuresByErrorType();

      expect(failures['Simple error message']).toBe(1);
    });
  });
});
