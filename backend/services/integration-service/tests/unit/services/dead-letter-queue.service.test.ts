// Mock logger BEFORE imports
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    debug: jest.fn(),
  },
}));

import { deadLetterQueueService, DeadLetterJob } from '../../../src/services/dead-letter-queue.service';

describe('DeadLetterQueueService', () => {
  // Helper to create a test job
  const createTestJob = (overrides: Partial<Omit<DeadLetterJob, 'id' | 'status'>> = {}): Omit<DeadLetterJob, 'id' | 'status'> => ({
    originalJobId: 'job-123',
    operation: 'sync',
    provider: 'stripe',
    venueId: 'venue-123',
    payload: { data: 'test' },
    error: {
      message: 'Test error',
      stack: 'Error stack trace',
      timestamp: new Date(),
    },
    attempts: 3,
    firstAttempt: new Date('2025-01-01'),
    lastAttempt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the internal map by clearing all discarded jobs and others
    const allJobs = deadLetterQueueService.getAllJobs();
    for (const job of allJobs) {
      deadLetterQueueService.discardJob(job.id);
    }
    deadLetterQueueService.clearDiscarded();
  });

  describe('addJob', () => {
    it('should add a job with generated id and failed status', async () => {
      const jobData = createTestJob();

      const id = await deadLetterQueueService.addJob(jobData);

      expect(id).toMatch(/^dlq-\d+-[a-z0-9]+$/);

      const job = deadLetterQueueService.getJob(id);
      expect(job).toBeDefined();
      expect(job!.status).toBe('failed');
      expect(job!.originalJobId).toBe('job-123');
      expect(job!.operation).toBe('sync');
      expect(job!.provider).toBe('stripe');
    });

    it('should log error when job is added', async () => {
      const jobData = createTestJob({ operation: 'webhook', provider: 'square' });

      await deadLetterQueueService.addJob(jobData);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Job added to dead letter queue',
        expect.objectContaining({
          originalJobId: 'job-123',
          operation: 'webhook',
          provider: 'square',
          error: 'Test error',
          attempts: 3,
        })
      );
    });

    it('should preserve all job data', async () => {
      const jobData = createTestJob({
        payload: { complex: { nested: 'data' } },
        metadata: { custom: 'value' },
      });

      const id = await deadLetterQueueService.addJob(jobData);
      const job = deadLetterQueueService.getJob(id);

      expect(job!.payload).toEqual({ complex: { nested: 'data' } });
      expect(job!.metadata).toEqual({ custom: 'value' });
    });
  });

  describe('getJob', () => {
    it('should return job by id', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());

      const job = deadLetterQueueService.getJob(id);

      expect(job).toBeDefined();
      expect(job!.id).toBe(id);
    });

    it('should return undefined for non-existent id', () => {
      const job = deadLetterQueueService.getJob('non-existent-id');

      expect(job).toBeUndefined();
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs', () => {
      const jobs = deadLetterQueueService.getAllJobs();

      expect(jobs).toEqual([]);
    });

    it('should return all jobs', async () => {
      await deadLetterQueueService.addJob(createTestJob({ operation: 'op1' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'op2' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'op3' }));

      const jobs = deadLetterQueueService.getAllJobs();

      expect(jobs).toHaveLength(3);
    });
  });

  describe('getJobsByStatus', () => {
    it('should return jobs filtered by status', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob({ operation: 'op1' }));
      const id2 = await deadLetterQueueService.addJob(createTestJob({ operation: 'op2' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'op3' }));

      deadLetterQueueService.markForReview(id1);
      deadLetterQueueService.discardJob(id2);

      const failedJobs = deadLetterQueueService.getJobsByStatus('failed');
      const reviewingJobs = deadLetterQueueService.getJobsByStatus('reviewing');
      const discardedJobs = deadLetterQueueService.getJobsByStatus('discarded');

      expect(failedJobs).toHaveLength(1);
      expect(reviewingJobs).toHaveLength(1);
      expect(discardedJobs).toHaveLength(1);
    });
  });

  describe('getJobsByProvider', () => {
    it('should return jobs filtered by provider', async () => {
      await deadLetterQueueService.addJob(createTestJob({ provider: 'stripe' }));
      await deadLetterQueueService.addJob(createTestJob({ provider: 'stripe' }));
      await deadLetterQueueService.addJob(createTestJob({ provider: 'square' }));

      const stripeJobs = deadLetterQueueService.getJobsByProvider('stripe');
      const squareJobs = deadLetterQueueService.getJobsByProvider('square');
      const mailchimpJobs = deadLetterQueueService.getJobsByProvider('mailchimp');

      expect(stripeJobs).toHaveLength(2);
      expect(squareJobs).toHaveLength(1);
      expect(mailchimpJobs).toHaveLength(0);
    });
  });

  describe('getJobsByOperation', () => {
    it('should return jobs filtered by operation', async () => {
      await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'webhook' }));

      const syncJobs = deadLetterQueueService.getJobsByOperation('sync');
      const webhookJobs = deadLetterQueueService.getJobsByOperation('webhook');

      expect(syncJobs).toHaveLength(2);
      expect(webhookJobs).toHaveLength(1);
    });
  });

  describe('getJobsByVenue', () => {
    it('should return jobs filtered by venueId', async () => {
      await deadLetterQueueService.addJob(createTestJob({ venueId: 'venue-1' }));
      await deadLetterQueueService.addJob(createTestJob({ venueId: 'venue-1' }));
      await deadLetterQueueService.addJob(createTestJob({ venueId: 'venue-2' }));

      const venue1Jobs = deadLetterQueueService.getJobsByVenue('venue-1');
      const venue2Jobs = deadLetterQueueService.getJobsByVenue('venue-2');

      expect(venue1Jobs).toHaveLength(2);
      expect(venue2Jobs).toHaveLength(1);
    });
  });

  describe('markForReview', () => {
    it('should change job status to reviewing', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());

      const result = deadLetterQueueService.markForReview(id);

      expect(result).toBe(true);
      const job = deadLetterQueueService.getJob(id);
      expect(job!.status).toBe('reviewing');
    });

    it('should log info when marking for review', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob({ operation: 'test-op' }));

      deadLetterQueueService.markForReview(id);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Dead letter job marked for review',
        { id, operation: 'test-op' }
      );
    });

    it('should return false for non-existent job', () => {
      const result = deadLetterQueueService.markForReview('non-existent');

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith('Dead letter job not found: non-existent');
    });
  });

  describe('requeueJob', () => {
    it('should change job status to requeued', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());

      const result = await deadLetterQueueService.requeueJob(id);

      expect(result).toBe(true);
      const job = deadLetterQueueService.getJob(id);
      expect(job!.status).toBe('requeued');
    });

    it('should log info when requeuing', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));

      await deadLetterQueueService.requeueJob(id);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Dead letter job requeued',
        expect.objectContaining({
          id,
          originalJobId: 'job-123',
          operation: 'sync',
        })
      );
    });

    it('should return false for non-existent job', async () => {
      const result = await deadLetterQueueService.requeueJob('non-existent');

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith('Dead letter job not found: non-existent');
    });
  });

  describe('discardJob', () => {
    it('should change job status to discarded', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());

      const result = deadLetterQueueService.discardJob(id);

      expect(result).toBe(true);
      const job = deadLetterQueueService.getJob(id);
      expect(job!.status).toBe('discarded');
    });

    it('should add discard reason to metadata', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());

      deadLetterQueueService.discardJob(id, 'Invalid payload');

      const job = deadLetterQueueService.getJob(id);
      expect(job!.metadata).toMatchObject({
        discardReason: 'Invalid payload',
        discardedAt: expect.any(Date),
      });
    });

    it('should preserve existing metadata when adding reason', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob({
        metadata: { existing: 'data' },
      }));

      deadLetterQueueService.discardJob(id, 'Test reason');

      const job = deadLetterQueueService.getJob(id);
      expect(job!.metadata).toMatchObject({
        existing: 'data',
        discardReason: 'Test reason',
      });
    });

    it('should log info when discarding', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));

      deadLetterQueueService.discardJob(id, 'Manual discard');

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Dead letter job discarded',
        { id, operation: 'sync', reason: 'Manual discard' }
      );
    });

    it('should return false for non-existent job', () => {
      const result = deadLetterQueueService.discardJob('non-existent');

      expect(result).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith('Dead letter job not found: non-existent');
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no jobs', () => {
      const stats = deadLetterQueueService.getStats();

      expect(stats).toEqual({
        total: 0,
        byStatus: {},
        byProvider: {},
        byOperation: {},
        recentFailures: 0,
      });
    });

    it('should count jobs by status', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());
      const id2 = await deadLetterQueueService.addJob(createTestJob());
      await deadLetterQueueService.addJob(createTestJob());

      deadLetterQueueService.markForReview(id1);
      deadLetterQueueService.discardJob(id2);

      const stats = deadLetterQueueService.getStats();

      expect(stats.byStatus).toEqual({
        failed: 1,
        reviewing: 1,
        discarded: 1,
      });
    });

    it('should count jobs by provider', async () => {
      await deadLetterQueueService.addJob(createTestJob({ provider: 'stripe' }));
      await deadLetterQueueService.addJob(createTestJob({ provider: 'stripe' }));
      await deadLetterQueueService.addJob(createTestJob({ provider: 'square' }));
      await deadLetterQueueService.addJob(createTestJob({ provider: undefined }));

      const stats = deadLetterQueueService.getStats();

      expect(stats.byProvider).toEqual({
        stripe: 2,
        square: 1,
      });
    });

    it('should count jobs by operation', async () => {
      await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'sync' }));
      await deadLetterQueueService.addJob(createTestJob({ operation: 'webhook' }));

      const stats = deadLetterQueueService.getStats();

      expect(stats.byOperation).toEqual({
        sync: 2,
        webhook: 1,
      });
    });

    it('should track oldest job', async () => {
      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2025-01-15');

      await deadLetterQueueService.addJob(createTestJob({ firstAttempt: newDate }));
      await deadLetterQueueService.addJob(createTestJob({ firstAttempt: oldDate }));

      const stats = deadLetterQueueService.getStats();

      expect(stats.oldestJob).toEqual(oldDate);
    });

    it('should count recent failures (last 24 hours)', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

      await deadLetterQueueService.addJob(createTestJob({ lastAttempt: now }));
      await deadLetterQueueService.addJob(createTestJob({ lastAttempt: yesterday }));
      await deadLetterQueueService.addJob(createTestJob({ lastAttempt: twoDaysAgo }));

      const stats = deadLetterQueueService.getStats();

      expect(stats.recentFailures).toBe(2);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should remove discarded jobs older than 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

      const id = await deadLetterQueueService.addJob(createTestJob({ lastAttempt: oldDate }));
      deadLetterQueueService.discardJob(id);

      const cleaned = deadLetterQueueService.cleanupOldJobs();

      expect(cleaned).toBe(1);
      expect(deadLetterQueueService.getJob(id)).toBeUndefined();
    });

    it('should not remove discarded jobs newer than 30 days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 25); // 25 days ago

      const id = await deadLetterQueueService.addJob(createTestJob({ lastAttempt: recentDate }));
      deadLetterQueueService.discardJob(id);

      const cleaned = deadLetterQueueService.cleanupOldJobs();

      expect(cleaned).toBe(0);
      expect(deadLetterQueueService.getJob(id)).toBeDefined();
    });

    it('should not remove non-discarded jobs regardless of age', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      const id = await deadLetterQueueService.addJob(createTestJob({ lastAttempt: oldDate }));
      // Leave as 'failed' status

      const cleaned = deadLetterQueueService.cleanupOldJobs();

      expect(cleaned).toBe(0);
      expect(deadLetterQueueService.getJob(id)).toBeDefined();
    });

    it('should log when jobs are cleaned', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      const id = await deadLetterQueueService.addJob(createTestJob({ lastAttempt: oldDate }));
      deadLetterQueueService.discardJob(id);
      jest.clearAllMocks();

      deadLetterQueueService.cleanupOldJobs();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Cleaned up 1 old dead letter jobs');
    });
  });

  describe('getJobsNeedingAttention', () => {
    it('should return failed jobs from last 7 days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      await deadLetterQueueService.addJob(createTestJob({ lastAttempt: recentDate }));

      const jobs = deadLetterQueueService.getJobsNeedingAttention();

      expect(jobs).toHaveLength(1);
    });

    it('should return reviewing jobs from last 7 days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3);

      const id = await deadLetterQueueService.addJob(createTestJob({ lastAttempt: recentDate }));
      deadLetterQueueService.markForReview(id);

      const jobs = deadLetterQueueService.getJobsNeedingAttention();

      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('reviewing');
    });

    it('should not return discarded or requeued jobs', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());
      const id2 = await deadLetterQueueService.addJob(createTestJob());

      deadLetterQueueService.discardJob(id1);
      await deadLetterQueueService.requeueJob(id2);

      const jobs = deadLetterQueueService.getJobsNeedingAttention();

      expect(jobs).toHaveLength(0);
    });

    it('should not return jobs older than 7 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      await deadLetterQueueService.addJob(createTestJob({ lastAttempt: oldDate }));

      const jobs = deadLetterQueueService.getJobsNeedingAttention();

      expect(jobs).toHaveLength(0);
    });
  });

  describe('exportJobs', () => {
    beforeEach(async () => {
      // Add variety of jobs
      const id1 = await deadLetterQueueService.addJob(createTestJob({
        provider: 'stripe',
        operation: 'sync',
        venueId: 'venue-1',
        lastAttempt: new Date('2025-01-10'),
      }));
      const id2 = await deadLetterQueueService.addJob(createTestJob({
        provider: 'square',
        operation: 'webhook',
        venueId: 'venue-2',
        lastAttempt: new Date('2025-01-15'),
      }));
      await deadLetterQueueService.addJob(createTestJob({
        provider: 'stripe',
        operation: 'webhook',
        venueId: 'venue-1',
        lastAttempt: new Date('2025-01-20'),
      }));

      deadLetterQueueService.discardJob(id1);
      deadLetterQueueService.markForReview(id2);
    });

    it('should return all jobs when no filters', () => {
      const jobs = deadLetterQueueService.exportJobs();

      expect(jobs).toHaveLength(3);
    });

    it('should filter by status', () => {
      const jobs = deadLetterQueueService.exportJobs({ status: 'failed' });

      expect(jobs).toHaveLength(1);
    });

    it('should filter by provider', () => {
      const jobs = deadLetterQueueService.exportJobs({ provider: 'stripe' });

      expect(jobs).toHaveLength(2);
    });

    it('should filter by operation', () => {
      const jobs = deadLetterQueueService.exportJobs({ operation: 'webhook' });

      expect(jobs).toHaveLength(2);
    });

    it('should filter by venueId', () => {
      const jobs = deadLetterQueueService.exportJobs({ venueId: 'venue-1' });

      expect(jobs).toHaveLength(2);
    });

    it('should filter by date range', () => {
      const jobs = deadLetterQueueService.exportJobs({
        startDate: new Date('2025-01-12'),
        endDate: new Date('2025-01-18'),
      });

      expect(jobs).toHaveLength(1);
    });

    it('should combine multiple filters', () => {
      const jobs = deadLetterQueueService.exportJobs({
        provider: 'stripe',
        venueId: 'venue-1',
      });

      expect(jobs).toHaveLength(2);
    });
  });

  describe('bulkRequeue', () => {
    it('should requeue multiple jobs', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());
      const id2 = await deadLetterQueueService.addJob(createTestJob());

      const result = await deadLetterQueueService.bulkRequeue([id1, id2]);

      expect(result).toEqual({ success: 2, failed: 0 });
      expect(deadLetterQueueService.getJob(id1)!.status).toBe('requeued');
      expect(deadLetterQueueService.getJob(id2)!.status).toBe('requeued');
    });

    it('should handle mixed success and failure', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());

      const result = await deadLetterQueueService.bulkRequeue([id1, 'non-existent']);

      expect(result).toEqual({ success: 1, failed: 1 });
    });

    it('should log completion', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());
      jest.clearAllMocks();

      await deadLetterQueueService.bulkRequeue([id1, 'bad-id']);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Bulk requeue completed',
        { success: 1, failed: 1, total: 2 }
      );
    });
  });

  describe('clearDiscarded', () => {
    it('should remove all discarded jobs', async () => {
      const id1 = await deadLetterQueueService.addJob(createTestJob());
      const id2 = await deadLetterQueueService.addJob(createTestJob());
      await deadLetterQueueService.addJob(createTestJob()); // Keep as failed

      deadLetterQueueService.discardJob(id1);
      deadLetterQueueService.discardJob(id2);

      const cleared = deadLetterQueueService.clearDiscarded();

      expect(cleared).toBe(2);
      expect(deadLetterQueueService.getAllJobs()).toHaveLength(1);
    });

    it('should log cleared count', async () => {
      const id = await deadLetterQueueService.addJob(createTestJob());
      deadLetterQueueService.discardJob(id);
      jest.clearAllMocks();

      deadLetterQueueService.clearDiscarded();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Cleared 1 discarded jobs from DLQ');
    });
  });

  describe('getFailurePatterns', () => {
    beforeEach(async () => {
      // Add jobs with various errors and providers
      await deadLetterQueueService.addJob(createTestJob({
        provider: 'stripe',
        operation: 'sync',
        error: { message: 'Connection timeout', timestamp: new Date() },
      }));
      await deadLetterQueueService.addJob(createTestJob({
        provider: 'stripe',
        operation: 'sync',
        error: { message: 'Connection timeout', timestamp: new Date() },
      }));
      await deadLetterQueueService.addJob(createTestJob({
        provider: 'square',
        operation: 'webhook',
        error: { message: 'Invalid API key', timestamp: new Date() },
      }));
    });

    it('should return common errors sorted by count', () => {
      const patterns = deadLetterQueueService.getFailurePatterns();

      expect(patterns.commonErrors).toHaveLength(2);
      expect(patterns.commonErrors[0]).toEqual({
        error: 'Connection timeout',
        count: 2,
      });
      expect(patterns.commonErrors[1]).toEqual({
        error: 'Invalid API key',
        count: 1,
      });
    });

    it('should calculate provider failure rates', () => {
      const patterns = deadLetterQueueService.getFailurePatterns();

      expect(patterns.providerIssues).toHaveLength(2);
      // All jobs are 'failed' status, so 100% failure rate
      expect(patterns.providerIssues[0].failureRate).toBe(100);
    });

    it('should calculate operation failure rates', () => {
      const patterns = deadLetterQueueService.getFailurePatterns();

      expect(patterns.operationIssues).toHaveLength(2);
      expect(patterns.operationIssues.find(o => o.operation === 'sync')).toBeDefined();
      expect(patterns.operationIssues.find(o => o.operation === 'webhook')).toBeDefined();
    });

    it('should limit common errors to top 10', async () => {
      // Add 15 different error messages
      for (let i = 0; i < 15; i++) {
        await deadLetterQueueService.addJob(createTestJob({
          error: { message: `Error ${i}`, timestamp: new Date() },
        }));
      }

      const patterns = deadLetterQueueService.getFailurePatterns();

      expect(patterns.commonErrors.length).toBeLessThanOrEqual(10);
    });
  });
});
