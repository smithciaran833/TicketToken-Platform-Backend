/**
 * Unit Tests for Background Job Processor
 * 
 * Tests job processing, tenant context, retry logic, and dead letter queue.
 */

// Mock dependencies before imports
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { BackgroundJobProcessor, jobProcessor, JobHandler, Job, TenantContext } from '../../../src/jobs/background-job-processor';
import { DatabaseService } from '../../../src/services/databaseService';

describe('BackgroundJobProcessor', () => {
  let processor: BackgroundJobProcessor;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);

    processor = new BackgroundJobProcessor();
  });

  afterEach(() => {
    processor.stop();
    jest.useRealTimers();
  });

  describe('registerHandler', () => {
    it('should register a job handler', () => {
      const handler = jest.fn();
      processor.registerHandler('test-job', handler);

      expect((processor as any).handlers.has('test-job')).toBe(true);
    });

    it('should allow registering multiple handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      processor.registerHandler('job-type-1', handler1);
      processor.registerHandler('job-type-2', handler2);

      expect((processor as any).handlers.size).toBe(2);
    });

    it('should override handler for same job type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      processor.registerHandler('same-type', handler1);
      processor.registerHandler('same-type', handler2);

      expect((processor as any).handlers.get('same-type')).toBe(handler2);
    });
  });

  describe('start/stop', () => {
    it('should set isRunning to true when started', () => {
      processor.start();
      expect((processor as any).isRunning).toBe(true);
    });

    it('should not start twice if already running', () => {
      processor.start();
      processor.start(); // Second call

      expect((processor as any).isRunning).toBe(true);
    });

    it('should set isRunning to false when stopped', () => {
      processor.start();
      processor.stop();

      expect((processor as any).isRunning).toBe(false);
    });

    it('should clear timeouts when stopped', () => {
      processor.start();
      
      const pollTimeout = (processor as any).pollTimeout;
      
      processor.stop();

      expect((processor as any).pollTimeout).toBeUndefined();
    });
  });

  describe('enqueue', () => {
    it('should enqueue a job with valid tenant ID', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const jobId = await processor.enqueue(
        'payment-process',
        { orderId: 'order-123' },
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(jobId).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO background_jobs'),
        expect.arrayContaining([
          expect.any(String), // jobId
          'payment-process',
          expect.stringContaining('tenantId'),
          3, // maxAttempts
          null, // processAfter
          '550e8400-e29b-41d4-a716-446655440000', // tenantId
          expect.any(String), // correlationId
        ])
      );
    });

    it('should throw error for invalid tenant ID', async () => {
      await expect(
        processor.enqueue('test-job', {}, 'invalid-tenant-id')
      ).rejects.toThrow('Invalid tenant ID');
    });

    it('should include tenant ID in payload', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await processor.enqueue(
        'test-job',
        { data: 'test' },
        '550e8400-e29b-41d4-a716-446655440000'
      );

      const insertCall = mockPool.query.mock.calls[0];
      const payload = JSON.parse(insertCall[1][2]);

      expect(payload.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(payload.data).toBe('test');
    });

    it('should use custom maxAttempts if provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await processor.enqueue(
        'test-job',
        {},
        '550e8400-e29b-41d4-a716-446655440000',
        { maxAttempts: 5 }
      );

      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[1][3]).toBe(5);
    });

    it('should use processAfter if provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const futureDate = new Date('2026-01-15T00:00:00Z');

      await processor.enqueue(
        'test-job',
        {},
        '550e8400-e29b-41d4-a716-446655440000',
        { processAfter: futureDate }
      );

      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[1][4]).toEqual(futureDate);
    });

    it('should use provided correlationId', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await processor.enqueue(
        'test-job',
        {},
        '550e8400-e29b-41d4-a716-446655440000',
        { correlationId: 'custom-correlation-id' }
      );

      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[1][6]).toBe('custom-correlation-id');
    });

    it('should generate correlationId if not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await processor.enqueue(
        'test-job',
        {},
        '550e8400-e29b-41d4-a716-446655440000'
      );

      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[1][6]).toBeDefined();
    });
  });

  describe('Job Processing', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('should process a job with valid tenant context', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      processor.registerHandler('test-job', handler);

      const mockJob = {
        id: 'job-123',
        type: 'test-job',
        payload: { tenantId: validTenantId, data: 'test' },
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date(),
      };

      // Setup mock for fetching job
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to processing
        .mockResolvedValueOnce({}) // SET tenant context
        .mockResolvedValueOnce({}) // UPDATE to completed
        .mockResolvedValueOnce({}) // CLEAR tenant context
        .mockResolvedValueOnce({}); // COMMIT

      // Manually trigger processNextJob
      await (processor as any).processNextJob();

      expect(handler).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        [validTenantId]
      );
    });

    it('should reject job without tenant ID', async () => {
      const mockJob = {
        id: 'job-no-tenant',
        type: 'test-job',
        payload: { data: 'no tenant' }, // Missing tenantId
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to failed
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      // Should mark as failed
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining(['job-no-tenant'])
      );
    });

    it('should reject job with invalid tenant ID format', async () => {
      const mockJob = {
        id: 'job-invalid-tenant',
        type: 'test-job',
        payload: { tenantId: 'invalid-format' },
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to failed
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining(['job-invalid-tenant', 'Invalid tenant ID format'])
      );
    });

    it('should handle missing handler for job type', async () => {
      const mockJob = {
        id: 'job-no-handler',
        type: 'unknown-job-type',
        payload: { tenantId: validTenantId },
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to processing
        .mockResolvedValueOnce({}) // UPDATE to failed
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'failed\''),
        expect.arrayContaining(['job-no-handler', 'No handler for job type: unknown-job-type'])
      );
    });

    it('should skip processing when no pending jobs', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT job - empty
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      // Should only have BEGIN, SELECT, and COMMIT
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry Logic', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('should calculate retry delay with exponential backoff', () => {
      const delay0 = (processor as any).calculateRetryDelay(0);
      const delay1 = (processor as any).calculateRetryDelay(1);
      const delay2 = (processor as any).calculateRetryDelay(2);

      // Base delay is 60000ms
      expect(delay0).toBeGreaterThanOrEqual(54000); // 60000 - 10% jitter
      expect(delay0).toBeLessThanOrEqual(66000); // 60000 + 10% jitter

      // Should approximately double each time (with jitter)
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should cap retry delay at max value', () => {
      const delayHigh = (processor as any).calculateRetryDelay(20); // Very high attempt count

      // Max delay is 3600000ms (1 hour)
      expect(delayHigh).toBeLessThanOrEqual(3960000); // 3600000 + 10% jitter
    });

    it('should schedule retry on handler failure', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      processor.registerHandler('failing-job', handler);

      const mockJob = {
        id: 'job-failing',
        type: 'failing-job',
        payload: { tenantId: validTenantId },
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to processing
        .mockResolvedValueOnce({}) // SET tenant context
        .mockResolvedValueOnce({}) // UPDATE for retry
        .mockResolvedValueOnce({}) // CLEAR tenant context
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      // Should update with status = 'pending' and process_after
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'pending'"),
        expect.arrayContaining(['job-failing', 'Handler failed'])
      );
    });
  });

  describe('Dead Letter Queue', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('should move job to dead letter queue after max attempts', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Permanent failure'));
      processor.registerHandler('dl-job', handler);

      const mockJob = {
        id: 'job-max-attempts',
        type: 'dl-job',
        payload: { tenantId: validTenantId },
        status: 'pending',
        attempts: 2, // Will be 3rd attempt
        max_attempts: 3,
        created_at: new Date(),
        correlation_id: 'corr-123',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockJob] }) // SELECT job
        .mockResolvedValueOnce({}) // UPDATE to processing
        .mockResolvedValueOnce({}) // SET tenant context
        .mockResolvedValueOnce({}) // INSERT into dead_letter_queue
        .mockResolvedValueOnce({}) // UPDATE to dead_letter status
        .mockResolvedValueOnce({}) // CLEAR tenant context
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      // Should insert into dead_letter_queue
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dead_letter_queue'),
        expect.any(Array)
      );
    });

    it('should retry job from dead letter queue', async () => {
      const deadLetterJob = {
        id: 'dl-123',
        job_type: 'retry-job',
        payload: JSON.stringify({ data: 'test', tenantId: validTenantId }),
        tenant_id: validTenantId,
        correlation_id: 'corr-456',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [deadLetterJob] }) // SELECT dead letter
        .mockResolvedValueOnce({}) // INSERT new job
        .mockResolvedValueOnce({}) // UPDATE dead letter
        .mockResolvedValueOnce({}); // COMMIT

      const newJobId = await processor.retryFromDeadLetter('dl-123');

      expect(newJobId).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO background_jobs'),
        expect.any(Array)
      );
    });

    it('should throw error for non-existent dead letter job', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT - empty
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        processor.retryFromDeadLetter('non-existent')
      ).rejects.toThrow('Dead letter job not found');
    });

    it('should get dead letter statistics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { job_type: 'payment-job', count: '5', oldest: new Date('2026-01-01') },
          { job_type: 'notification-job', count: '3', oldest: new Date('2026-01-05') },
        ],
      });

      const stats = await processor.getDeadLetterStats();

      expect(stats.total).toBe(8);
      expect(stats.byType['payment-job']).toBe(5);
      expect(stats.byType['notification-job']).toBe(3);
      expect(stats.oldest).toEqual(new Date('2026-01-01'));
    });

    it('should filter dead letter stats by tenant', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ job_type: 'job', count: '2', oldest: new Date() }],
      });

      await processor.getDeadLetterStats(validTenantId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND tenant_id = $1'),
        [validTenantId]
      );
    });
  });

  describe('Stalled Job Recovery', () => {
    it('should recover stalled jobs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'stalled-1', type: 'job-type', tenant_id: 'tenant-1' },
          { id: 'stalled-2', type: 'job-type', tenant_id: 'tenant-2' },
        ],
      });

      await (processor as any).recoverStalledJobs();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'pending'")
      );
    });
  });

  describe('Singleton Export', () => {
    it('should export jobProcessor singleton', () => {
      expect(jobProcessor).toBeDefined();
      expect(jobProcessor).toBeInstanceOf(BackgroundJobProcessor);
    });
  });

  describe('Tenant ID Validation', () => {
    it('should accept valid UUID v4', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(
        processor.enqueue('job', {}, '550e8400-e29b-41d4-a716-446655440000')
      ).resolves.toBeDefined();
    });

    it('should reject non-UUID strings', async () => {
      await expect(
        processor.enqueue('job', {}, 'not-a-uuid')
      ).rejects.toThrow('Invalid tenant ID');
    });

    it('should reject empty string', async () => {
      await expect(
        processor.enqueue('job', {}, '')
      ).rejects.toThrow('Invalid tenant ID');
    });

    it('should reject null-like values', async () => {
      await expect(
        processor.enqueue('job', {}, null as any)
      ).rejects.toThrow('Invalid tenant ID');
    });

    it('should reject UUID v1 format', async () => {
      await expect(
        processor.enqueue('job', {}, '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
      ).rejects.toThrow('Invalid tenant ID');
    });
  });

  describe('Transaction Handling', () => {
    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // SELECT fails

      await expect(
        (processor as any).processNextJob()
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should always release client', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT
        .mockResolvedValueOnce({}); // COMMIT

      await (processor as any).processNextJob();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
