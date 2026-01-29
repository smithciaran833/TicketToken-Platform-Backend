/**
 * COMPONENT TEST: BackgroundJobProcessor
 *
 * Tests background job processing with tenant context
 */

import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JOB_BASE_RETRY_DELAY_MS = '1000';
process.env.JOB_MAX_RETRY_DELAY_MS = '5000';
process.env.JOB_STALLED_TIMEOUT_MS = '60000';

// Mock data stores
let mockJobs: any[] = [];
let mockDeadLetterQueue: any[] = [];
let mockOutboxEvents: any[] = [];

// Mock client
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

// Mock pool
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn().mockResolvedValue(mockClient);

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => ({
      query: mockPoolQuery,
      connect: mockPoolConnect,
    }),
  },
}));

// Mock queueService
const mockQueuePublish = jest.fn();
jest.mock('../../../src/services/queueService', () => ({
  queueService: {
    publish: mockQueuePublish,
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  BackgroundJobProcessor,
  jobProcessor,
  processOutboxEvents,
  Job,
  JobPayload,
  TenantContext,
} from '../../../src/jobs/background-job-processor';

describe('BackgroundJobProcessor Component Tests', () => {
  let processor: BackgroundJobProcessor;

  beforeEach(() => {
    // Reset mocks
    mockJobs = [];
    mockDeadLetterQueue = [];
    mockOutboxEvents = [];
    mockClientQuery.mockReset();
    mockPoolQuery.mockReset();
    mockQueuePublish.mockReset();
    mockQueuePublish.mockResolvedValue(undefined);
    mockClientRelease.mockReset();

    // Setup default query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      // Handle BEGIN/COMMIT/ROLLBACK
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return { rows: [] };
      }

      // Handle set_config
      if (query.includes('set_config')) {
        return { rows: [] };
      }

      // Handle SELECT from background_jobs
      if (query.includes('SELECT') && query.includes('background_jobs')) {
        const pendingJobs = mockJobs.filter(
          j => j.status === 'pending' && j.attempts < j.max_attempts
        );
        return { rows: pendingJobs.slice(0, 1) };
      }

      // Handle UPDATE background_jobs
      if (query.includes('UPDATE background_jobs')) {
        const jobId = params?.[0];
        const job = mockJobs.find(j => j.id === jobId);
        if (job) {
          if (query.includes("status = 'processing'")) {
            job.status = 'processing';
            job.attempts = (job.attempts || 0) + 1;
            job.started_at = new Date();
          } else if (query.includes("status = 'completed'")) {
            job.status = 'completed';
            job.completed_at = new Date();
          } else if (query.includes("status = 'failed'")) {
            job.status = 'failed';
            job.last_error = params?.[1];
          } else if (query.includes("status = 'pending'")) {
            job.status = 'pending';
            job.last_error = params?.[1];
          } else if (query.includes("status = 'dead_letter'")) {
            job.status = 'dead_letter';
            job.last_error = params?.[1];
          }
        }
        return { rows: [] };
      }

      // Handle INSERT into dead_letter_queue
      if (query.includes('INSERT INTO dead_letter_queue')) {
        mockDeadLetterQueue.push({
          id: params?.[0],
          original_job_id: params?.[1],
          job_type: params?.[2],
          payload: params?.[3],
          tenant_id: params?.[4],
          correlation_id: params?.[5],
          error: params?.[6],
          attempts: params?.[7],
        });
        return { rows: [] };
      }

      // Handle INSERT into background_jobs
      if (query.includes('INSERT INTO background_jobs')) {
        return { rows: [] };
      }

      // Handle SELECT from dead_letter_queue
      if (query.includes('SELECT') && query.includes('dead_letter_queue')) {
        const dlJob = mockDeadLetterQueue.find(j => j.id === params?.[0]);
        return { rows: dlJob ? [dlJob] : [] };
      }

      return { rows: [] };
    });

    mockPoolQuery.mockImplementation(async (query: string, params?: any[]) => {
      // Handle INSERT into background_jobs (enqueue)
      if (query.includes('INSERT INTO background_jobs')) {
        mockJobs.push({
          id: params?.[0],
          type: params?.[1],
          payload: JSON.parse(params?.[2]),
          status: 'pending',
          max_attempts: params?.[3],
          process_after: params?.[4],
          tenant_id: params?.[5],
          correlation_id: params?.[6],
          attempts: 0,
          created_at: new Date(),
        });
        return { rows: [] };
      }

      // Handle stalled job recovery
      if (query.includes('UPDATE background_jobs') && query.includes('stalled')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    processor = new BackgroundJobProcessor();
  });

  afterEach(() => {
    processor.stop();
  });

  // Helper to add mock job
  function addJob(job: Partial<any>): string {
    const id = job.id || uuidv4();
    const tenantId = job.tenant_id || uuidv4();
    mockJobs.push({
      id,
      type: job.type || 'test_job',
      payload: job.payload || { tenantId },
      status: job.status || 'pending',
      attempts: job.attempts || 0,
      max_attempts: job.max_attempts || 3,
      created_at: job.created_at || new Date(),
      process_after: job.process_after || null,
      correlation_id: job.correlation_id || uuidv4(),
      tenant_id: tenantId,
    });
    return id;
  }

  // ===========================================================================
  // HANDLER REGISTRATION
  // ===========================================================================
  describe('handler registration', () => {
    it('should register job handler', () => {
      const handler = jest.fn();
      processor.registerHandler('test_job', handler);

      expect((processor as any).handlers.has('test_job')).toBe(true);
    });

    it('should allow multiple handlers for different job types', () => {
      processor.registerHandler('job_a', jest.fn());
      processor.registerHandler('job_b', jest.fn());

      expect((processor as any).handlers.size).toBe(2);
    });
  });

  // ===========================================================================
  // JOB PROCESSING
  // ===========================================================================
  describe('job processing', () => {
    it('should process pending job with handler', async () => {
      const tenantId = uuidv4();
      const handler = jest.fn().mockResolvedValue(undefined);
      processor.registerHandler('test_job', handler);

      addJob({
        type: 'test_job',
        payload: { tenantId, data: 'test' },
        tenant_id: tenantId,
      });

      await (processor as any).processNextJob();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'test_job' }),
        expect.objectContaining({ tenantId })
      );
    });

    it('should mark job as completed on success', async () => {
      const tenantId = uuidv4();
      const handler = jest.fn().mockResolvedValue(undefined);
      processor.registerHandler('test_job', handler);

      const jobId = addJob({
        type: 'test_job',
        payload: { tenantId },
        tenant_id: tenantId,
      });

      await (processor as any).processNextJob();

      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('completed');
    });

    it('should set tenant context before handler execution', async () => {
      const tenantId = uuidv4();
      let contextSet = false;

      const handler = jest.fn().mockImplementation(async (job, context) => {
        // Check that setContext was provided
        expect(context.tenantId).toBe(tenantId);
        contextSet = true;
      });
      processor.registerHandler('test_job', handler);

      addJob({
        type: 'test_job',
        payload: { tenantId },
        tenant_id: tenantId,
      });

      await (processor as any).processNextJob();

      expect(contextSet).toBe(true);
    });
  });

  // ===========================================================================
  // TENANT VALIDATION
  // ===========================================================================
  describe('tenant validation', () => {
    it('should fail job with missing tenant ID', async () => {
      const handler = jest.fn();
      processor.registerHandler('test_job', handler);

      const jobId = addJob({
        type: 'test_job',
        payload: {}, // No tenantId
      });

      await (processor as any).processNextJob();

      expect(handler).not.toHaveBeenCalled();
      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('failed');
    });

    it('should fail job with invalid tenant ID format', async () => {
      const handler = jest.fn();
      processor.registerHandler('test_job', handler);

      const jobId = addJob({
        type: 'test_job',
        payload: { tenantId: 'invalid-uuid' },
      });

      await (processor as any).processNextJob();

      expect(handler).not.toHaveBeenCalled();
      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('failed');
    });
  });

  // ===========================================================================
  // ERROR HANDLING & RETRY
  // ===========================================================================
  describe('error handling and retry', () => {
    it('should retry failed job with exponential backoff', async () => {
      const tenantId = uuidv4();
      const handler = jest.fn().mockRejectedValue(new Error('Temporary error'));
      processor.registerHandler('test_job', handler);

      const jobId = addJob({
        type: 'test_job',
        payload: { tenantId },
        tenant_id: tenantId,
        attempts: 0,
        max_attempts: 3,
      });

      await (processor as any).processNextJob();

      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('pending');
      expect(job?.last_error).toContain('Temporary error');
    });

    it('should move to dead letter after max attempts', async () => {
      const tenantId = uuidv4();
      const handler = jest.fn().mockRejectedValue(new Error('Permanent error'));
      processor.registerHandler('test_job', handler);

      const jobId = addJob({
        type: 'test_job',
        payload: { tenantId },
        tenant_id: tenantId,
        attempts: 2, // Will be 3 after this attempt (max)
        max_attempts: 3,
      });

      await (processor as any).processNextJob();

      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('dead_letter');
      expect(mockDeadLetterQueue.length).toBe(1);
    });
  });

  // ===========================================================================
  // NO HANDLER
  // ===========================================================================
  describe('no handler', () => {
    it('should fail job with no registered handler', async () => {
      const tenantId = uuidv4();
      // Don't register handler

      const jobId = addJob({
        type: 'unknown_job',
        payload: { tenantId },
        tenant_id: tenantId,
      });

      await (processor as any).processNextJob();

      const job = mockJobs.find(j => j.id === jobId);
      expect(job?.status).toBe('failed');
      expect(job?.last_error).toContain('No handler');
    });
  });

  // ===========================================================================
  // ENQUEUE
  // ===========================================================================
  describe('enqueue()', () => {
    it('should enqueue job with tenant ID', async () => {
      const tenantId = uuidv4();

      const jobId = await processor.enqueue(
        'test_job',
        { data: 'test' },
        tenantId
      );

      expect(jobId).toBeDefined();
      expect(mockJobs.length).toBe(1);
      expect(mockJobs[0].payload.tenantId).toBe(tenantId);
    });

    it('should generate correlation ID if not provided', async () => {
      const tenantId = uuidv4();

      await processor.enqueue('test_job', {}, tenantId);

      expect(mockJobs[0].correlation_id).toBeDefined();
    });

    it('should use provided correlation ID', async () => {
      const tenantId = uuidv4();
      const correlationId = uuidv4();

      await processor.enqueue('test_job', {}, tenantId, { correlationId });

      expect(mockJobs[0].correlation_id).toBe(correlationId);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(
        processor.enqueue('test_job', {}, 'invalid-uuid')
      ).rejects.toThrow('Invalid tenant ID');
    });

    it('should support processAfter option', async () => {
      const tenantId = uuidv4();
      const processAfter = new Date(Date.now() + 60000);

      await processor.enqueue('test_job', {}, tenantId, { processAfter });

      expect(mockJobs[0].process_after).toBe(processAfter);
    });

    it('should support maxAttempts option', async () => {
      const tenantId = uuidv4();

      await processor.enqueue('test_job', {}, tenantId, { maxAttempts: 5 });

      expect(mockJobs[0].max_attempts).toBe(5);
    });
  });

  // ===========================================================================
  // RETRY FROM DEAD LETTER
  // ===========================================================================
  describe('retryFromDeadLetter()', () => {
    it('should create new job from dead letter', async () => {
      const dlId = uuidv4();
      const tenantId = uuidv4();

      mockDeadLetterQueue.push({
        id: dlId,
        job_type: 'test_job',
        payload: JSON.stringify({ tenantId }),
        tenant_id: tenantId,
        correlation_id: uuidv4(),
      });

      const newJobId = await processor.retryFromDeadLetter(dlId);

      expect(newJobId).toBeDefined();
    });

    it('should throw if dead letter not found', async () => {
      await expect(
        processor.retryFromDeadLetter(uuidv4())
      ).rejects.toThrow('Dead letter job not found');
    });
  });

  // ===========================================================================
  // START/STOP
  // ===========================================================================
  describe('start/stop', () => {
    it('should start polling', () => {
      processor.start();
      expect((processor as any).isRunning).toBe(true);
    });

    it('should stop polling', () => {
      processor.start();
      processor.stop();
      expect((processor as any).isRunning).toBe(false);
    });

    it('should not start twice', () => {
      processor.start();
      processor.start();
      expect((processor as any).isRunning).toBe(true);
    });
  });

  // ===========================================================================
  // CALCULATE RETRY DELAY
  // ===========================================================================
  describe('calculateRetryDelay()', () => {
    it('should calculate exponential backoff', () => {
      const delay0 = (processor as any).calculateRetryDelay(0);
      const delay1 = (processor as any).calculateRetryDelay(1);
      const delay2 = (processor as any).calculateRetryDelay(2);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should cap at max delay', () => {
      const delay = (processor as any).calculateRetryDelay(100);
      expect(delay).toBeLessThanOrEqual(5500); // Max + 10% jitter
    });
  });
});

// ===========================================================================
// PROCESS OUTBOX EVENTS
// ===========================================================================
describe('processOutboxEvents', () => {
  beforeEach(() => {
    mockOutboxEvents = [];
    mockClientQuery.mockReset();
    mockQueuePublish.mockReset();
    mockQueuePublish.mockResolvedValue(undefined);
    mockClientRelease.mockReset();

    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return { rows: [] };
      }

      if (query.includes('set_config')) {
        return { rows: [] };
      }

      if (query.includes('SELECT') && query.includes('outbox')) {
        return { rows: mockOutboxEvents.filter(e => !e.processed) };
      }

      if (query.includes('UPDATE outbox')) {
        const eventId = params?.[0];
        const event = mockOutboxEvents.find(e => e.id === eventId);
        if (event) {
          if (query.includes('processed = true')) {
            event.processed = true;
          }
        }
        return { rows: [] };
      }

      return { rows: [] };
    });
  });

  it('should process pending outbox events', async () => {
    const tenantId = uuidv4();
    const eventId = uuidv4();

    mockOutboxEvents.push({
      id: eventId,
      tenant_id: tenantId,
      event_type: 'payment.completed',
      aggregate_type: 'payment',
      aggregate_id: uuidv4(),
      payload: { tenantId, amount: 1000 },
      processed: false,
      attempts: 0,
    });

    await processOutboxEvents();

    expect(mockQueuePublish).toHaveBeenCalledWith(
      'payment-events',
      expect.objectContaining({
        event_type: 'payment.completed',
        tenant_id: tenantId,
      })
    );
  });

  it('should skip events with invalid tenant ID', async () => {
    mockOutboxEvents.push({
      id: uuidv4(),
      tenant_id: null,
      event_type: 'payment.completed',
      payload: {},
      processed: false,
      attempts: 0,
    });

    await processOutboxEvents();

    expect(mockQueuePublish).not.toHaveBeenCalled();
  });
});
