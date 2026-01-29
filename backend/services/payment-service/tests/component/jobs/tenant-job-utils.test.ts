/**
 * COMPONENT TEST: TenantJobUtils
 *
 * Tests tenant-aware job utilities
 */

import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock data
let mockTenants: any[] = [];
let mockDLQEntries: any[] = [];
let mockBackgroundJobs: any[] = [];

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
  createTenantJobContext,
  withTenantJobContext,
  getActiveTenants,
  executeForAllTenants,
  getTenantQueueName,
  parseTenantFromQueueName,
  moveToTenantDLQ,
  getTenantDLQEntries,
  retryFromTenantDLQ,
  createRecurringJob,
  UUID_PATTERN,
} from '../../../src/jobs/tenant-job-utils';

describe('TenantJobUtils Component Tests', () => {
  beforeEach(() => {
    mockTenants = [];
    mockDLQEntries = [];
    mockBackgroundJobs = [];
    mockClientQuery.mockReset();
    mockPoolQuery.mockReset();
    mockClientRelease.mockReset();

    // Default pool query behavior
    mockPoolQuery.mockImplementation(async (query: string, params?: any[]) => {
      // Get active tenants
      if (query.includes('SELECT') && query.includes('tenants')) {
        return { rows: mockTenants.map(t => ({ tenant_id: t.id })) };
      }

      // Insert into DLQ
      if (query.includes('INSERT INTO dead_letter_queue')) {
        mockDLQEntries.push({
          id: params?.[0],
          original_job_id: params?.[1],
          job_type: params?.[2],
          payload: params?.[3],
          tenant_id: params?.[4],
          correlation_id: params?.[5],
          error: params?.[6],
        });
        return { rows: [] };
      }

      // Select from DLQ
      if (query.includes('SELECT') && query.includes('dead_letter_queue')) {
        const tenantId = params?.[0];
        return { rows: mockDLQEntries.filter(e => e.tenant_id === tenantId) };
      }

      return { rows: [] };
    });

    // Default client query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return { rows: [] };
      }

      if (query.includes('set_config')) {
        return { rows: [] };
      }

      // Select DLQ entry for retry
      if (query.includes('SELECT') && query.includes('dead_letter_queue')) {
        const dlqId = params?.[0];
        const tenantId = params?.[1];
        const entry = mockDLQEntries.find(e => e.id === dlqId && e.tenant_id === tenantId);
        return { rows: entry ? [entry] : [] };
      }

      // Insert background job
      if (query.includes('INSERT INTO background_jobs')) {
        mockBackgroundJobs.push({
          id: params?.[0],
          type: params?.[1],
          payload: params?.[2],
          tenant_id: params?.[3],
          correlation_id: params?.[4],
        });
        return { rows: [] };
      }

      // Update DLQ entry
      if (query.includes('UPDATE dead_letter_queue')) {
        const dlqId = params?.[0];
        const entry = mockDLQEntries.find(e => e.id === dlqId);
        if (entry) {
          entry.retried = true;
          entry.new_job_id = params?.[1];
        }
        return { rows: [] };
      }

      return { rows: [] };
    });
  });

  // Helper to add tenant
  function addTenant(tenant?: Partial<any>): string {
    const id = tenant?.id || uuidv4();
    mockTenants.push({ id, status: 'active', ...tenant });
    return id;
  }

  // ===========================================================================
  // UUID PATTERN
  // ===========================================================================
  describe('UUID_PATTERN', () => {
    it('should match valid UUID v4', () => {
      expect(UUID_PATTERN.test(uuidv4())).toBe(true);
    });

    it('should not match invalid UUID', () => {
      expect(UUID_PATTERN.test('not-a-uuid')).toBe(false);
      expect(UUID_PATTERN.test('')).toBe(false);
    });
  });

  // ===========================================================================
  // CREATE TENANT JOB CONTEXT
  // ===========================================================================
  describe('createTenantJobContext()', () => {
    it('should create context with valid tenant ID', async () => {
      const tenantId = uuidv4();

      const ctx = await createTenantJobContext(tenantId);

      expect(ctx.tenantId).toBe(tenantId);
      expect(ctx.correlationId).toBeDefined();
      expect(ctx.client).toBeDefined();

      await ctx.clearContext();
    });

    it('should set RLS context on creation', async () => {
      const tenantId = uuidv4();

      await createTenantJobContext(tenantId);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        [tenantId]
      );
    });

    it('should use provided correlation ID', async () => {
      const tenantId = uuidv4();
      const correlationId = uuidv4();

      const ctx = await createTenantJobContext(tenantId, correlationId);

      expect(ctx.correlationId).toBe(correlationId);

      await ctx.clearContext();
    });

    it('should throw on invalid tenant ID', async () => {
      await expect(createTenantJobContext('invalid')).rejects.toThrow('Invalid tenant ID');
    });
  });

  // ===========================================================================
  // WITH TENANT JOB CONTEXT
  // ===========================================================================
  describe('withTenantJobContext()', () => {
    it('should execute function with context', async () => {
      const tenantId = uuidv4();
      const result = await withTenantJobContext(tenantId, async (ctx) => {
        expect(ctx.tenantId).toBe(tenantId);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should clean up context after execution', async () => {
      const tenantId = uuidv4();

      await withTenantJobContext(tenantId, async () => {});

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should clean up context on error', async () => {
      const tenantId = uuidv4();

      await expect(
        withTenantJobContext(tenantId, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // GET ACTIVE TENANTS
  // ===========================================================================
  describe('getActiveTenants()', () => {
    it('should return list of active tenant IDs', async () => {
      const tenantId1 = addTenant();
      const tenantId2 = addTenant();

      const tenants = await getActiveTenants();

      expect(tenants).toContain(tenantId1);
      expect(tenants).toContain(tenantId2);
    });

    it('should return empty array when no tenants', async () => {
      const tenants = await getActiveTenants();
      expect(tenants).toEqual([]);
    });
  });

  // ===========================================================================
  // EXECUTE FOR ALL TENANTS
  // ===========================================================================
  describe('executeForAllTenants()', () => {
    it('should execute job for each tenant', async () => {
      const tenantId1 = addTenant();
      const tenantId2 = addTenant();

      const jobFn = jest.fn().mockResolvedValue('done');

      const results = await executeForAllTenants(
        { jobType: 'test_job' },
        jobFn
      );

      expect(jobFn).toHaveBeenCalledTimes(2);
      expect(results.get(tenantId1)?.success).toBe(true);
      expect(results.get(tenantId2)?.success).toBe(true);
    });

    it('should handle job failures per tenant', async () => {
      const tenantId1 = addTenant();
      const tenantId2 = addTenant();

      let callCount = 0;
      const jobFn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Tenant 1 failed');
        return 'done';
      });

      const results = await executeForAllTenants(
        { jobType: 'test_job' },
        jobFn
      );

      // One should fail, one should succeed
      const successes = Array.from(results.values()).filter(r => r.success);
      const failures = Array.from(results.values()).filter(r => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
    });

    it('should return empty map when no tenants', async () => {
      const results = await executeForAllTenants(
        { jobType: 'test_job' },
        jest.fn()
      );

      expect(results.size).toBe(0);
    });
  });

  // ===========================================================================
  // TENANT QUEUE NAME
  // ===========================================================================
  describe('getTenantQueueName()', () => {
    it('should create tenant-scoped queue name', () => {
      const tenantId = uuidv4();
      const queueName = getTenantQueueName('payments', tenantId);

      expect(queueName).toContain('payments');
      expect(queueName).toContain(tenantId.slice(0, 8));
    });

    it('should return base name with useGlobalQueue option', () => {
      const tenantId = uuidv4();
      const queueName = getTenantQueueName('payments', tenantId, { useGlobalQueue: true });

      expect(queueName).toBe('payments');
    });
  });

  // ===========================================================================
  // PARSE TENANT FROM QUEUE NAME
  // ===========================================================================
  describe('parseTenantFromQueueName()', () => {
    it('should parse tenant prefix from queue name', () => {
      const prefix = parseTenantFromQueueName('payments:abc12345');
      expect(prefix).toBe('abc12345');
    });

    it('should return null for non-tenant queue', () => {
      const prefix = parseTenantFromQueueName('payments');
      expect(prefix).toBeNull();
    });
  });

  // ===========================================================================
  // MOVE TO TENANT DLQ
  // ===========================================================================
  describe('moveToTenantDLQ()', () => {
    it('should insert into DLQ with tenant ID', async () => {
      const tenantId = uuidv4();
      const jobId = uuidv4();

      const dlqId = await moveToTenantDLQ(
        jobId,
        'test_job',
        { data: 'test' },
        tenantId,
        'Job failed',
        'corr-123'
      );

      expect(dlqId).toBeDefined();
      expect(mockDLQEntries.length).toBe(1);
      expect(mockDLQEntries[0].tenant_id).toBe(tenantId);
    });

    it('should throw on invalid tenant ID', async () => {
      await expect(
        moveToTenantDLQ('job-1', 'test', {}, 'invalid', 'error')
      ).rejects.toThrow('Invalid tenant ID');
    });
  });

  // ===========================================================================
  // GET TENANT DLQ ENTRIES
  // ===========================================================================
  describe('getTenantDLQEntries()', () => {
    it('should return DLQ entries for tenant', async () => {
      const tenantId = uuidv4();
      mockDLQEntries.push({
        id: uuidv4(),
        tenant_id: tenantId,
        job_type: 'test',
      });

      const entries = await getTenantDLQEntries(tenantId);

      expect(entries.length).toBe(1);
    });

    it('should throw on invalid tenant ID', async () => {
      await expect(getTenantDLQEntries('invalid')).rejects.toThrow('Invalid tenant ID');
    });
  });

  // ===========================================================================
  // RETRY FROM TENANT DLQ
  // ===========================================================================
  describe('retryFromTenantDLQ()', () => {
    it('should create new job from DLQ entry', async () => {
      const tenantId = uuidv4();
      const dlqId = uuidv4();

      mockDLQEntries.push({
        id: dlqId,
        tenant_id: tenantId,
        job_type: 'test_job',
        payload: JSON.stringify({ data: 'test' }),
        correlation_id: 'corr-123',
      });

      const newJobId = await retryFromTenantDLQ(dlqId, tenantId);

      expect(newJobId).toBeDefined();
      expect(mockBackgroundJobs.length).toBe(1);
    });

    it('should throw if DLQ entry not found', async () => {
      const tenantId = uuidv4();

      await expect(
        retryFromTenantDLQ(uuidv4(), tenantId)
      ).rejects.toThrow('DLQ entry not found');
    });

    it('should throw if tenant mismatch', async () => {
      const tenantId = uuidv4();
      const otherTenantId = uuidv4();
      const dlqId = uuidv4();

      mockDLQEntries.push({
        id: dlqId,
        tenant_id: tenantId,
        job_type: 'test',
      });

      await expect(
        retryFromTenantDLQ(dlqId, otherTenantId)
      ).rejects.toThrow('DLQ entry not found');
    });
  });

  // ===========================================================================
  // CREATE RECURRING JOB
  // ===========================================================================
  describe('createRecurringJob()', () => {
    it('should create start/stop interface', () => {
      const job = createRecurringJob(
        { jobType: 'test', timeoutMs: 1000 },
        jest.fn()
      );

      expect(job.start).toBeDefined();
      expect(job.stop).toBeDefined();
    });

    it('should start and stop without error', () => {
      const job = createRecurringJob(
        { jobType: 'test', timeoutMs: 60000 },
        jest.fn()
      );

      expect(() => job.start()).not.toThrow();
      expect(() => job.stop()).not.toThrow();
    });
  });
});
