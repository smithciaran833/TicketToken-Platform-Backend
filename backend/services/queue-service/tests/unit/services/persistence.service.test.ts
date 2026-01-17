// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../../src/config/constants', () => ({
  PERSISTENCE_TIERS: {
    TIER_1: 'tier-1',
    TIER_2: 'tier-2',
    TIER_3: 'tier-3',
  },
}));

import { PersistenceService } from '../../../src/services/persistence.service';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';
import { PERSISTENCE_TIERS } from '../../../src/config/constants';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
  });

  describe('Tier 1 (Critical Jobs)', () => {
    beforeEach(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_1);
    });

    describe('saveJob', () => {
      it('should save critical job to PostgreSQL', async () => {
        const job = {
          id: 'job-123',
          name: 'payment',
          data: {
            amount: 100,
            userId: 'user-456',
            idempotencyKey: 'idp-789',
          },
        };

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.saveJob(job as any);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO critical_jobs'),
          expect.arrayContaining([
            'job-123',
            'payment',
            'payment',
            expect.any(String),
            5,
            'idp-789',
          ])
        );
        expect(logger.info).toHaveBeenCalledWith(
          'Tier 1 job saved to PostgreSQL: job-123'
        );
      });

      it('should handle numeric job ID', async () => {
        const job = {
          id: 12345,
          name: 'refund',
          data: { amount: 50 },
        };

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.saveJob(job as any);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['12345'])
        );
      });

      it('should serialize job data as JSON', async () => {
        const job = {
          id: 'job-123',
          name: 'payment',
          data: {
            amount: 100,
            metadata: { key: 'value' },
          },
        };

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.saveJob(job as any);

        const callArgs = (mockPool.query as jest.Mock).mock.calls[0][1];
        const serializedData = callArgs[3];
        expect(typeof serializedData).toBe('string');
        expect(JSON.parse(serializedData)).toEqual(job.data);
      });

      it('should handle job without idempotency key', async () => {
        const job = {
          id: 'job-123',
          name: 'payment',
          data: { amount: 100 },
        };

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.saveJob(job as any);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            'job-123',
            'payment',
            'payment',
            expect.any(String),
            5,
            null,
          ])
        );
      });

      it('should use ON CONFLICT to update existing jobs', async () => {
        const job = {
          id: 'job-123',
          name: 'payment',
          data: { amount: 100 },
        };

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.saveJob(job as any);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (id) DO UPDATE'),
          expect.any(Array)
        );
      });

      it('should throw error on database failure', async () => {
        const job = {
          id: 'job-123',
          name: 'payment',
          data: { amount: 100 },
        };

        mockPool.query.mockRejectedValue(new Error('Database error'));

        await expect(service.saveJob(job as any)).rejects.toThrow('Database error');
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to persist Tier 1 job job-123:',
          expect.any(Error)
        );
      });
    });

    describe('markComplete', () => {
      it('should mark job as completed', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markComplete('job-123', { success: true });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'completed'"),
          ['job-123']
        );
      });

      it('should handle numeric job ID', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markComplete(12345, { success: true });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          ['12345']
        );
      });

      it('should update timestamp', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markComplete('job-123', {});

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('updated_at = CURRENT_TIMESTAMP'),
          expect.any(Array)
        );
      });
    });

    describe('markFailed', () => {
      it('should mark job as failed', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markFailed('job-123', new Error('Job failed'));

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("SET status = 'failed'"),
          ['job-123']
        );
      });

      it('should handle numeric job ID', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markFailed(12345, new Error('Failed'));

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          ['12345']
        );
      });

      it('should update timestamp', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.markFailed('job-123', new Error('Failed'));

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('updated_at = CURRENT_TIMESTAMP'),
          expect.any(Array)
        );
      });
    });

    describe('recoverJobs', () => {
      it('should recover pending and processing jobs', async () => {
        mockPool.query.mockResolvedValue({
          rows: [
            {
              id: 'job-1',
              queue_name: 'money',
              job_type: 'payment',
              data: { amount: 100 },
              priority: 10,
              idempotency_key: 'idp-1',
            },
            {
              id: 'job-2',
              queue_name: 'communication',
              job_type: 'email',
              data: { to: 'user@example.com' },
              priority: 5,
              idempotency_key: null,
            },
          ],
        });

        const jobs = await service.recoverJobs();

        expect(jobs).toHaveLength(2);
        expect(jobs[0]).toEqual({
          id: 'job-1',
          queue: 'money',
          name: 'payment',
          data: { amount: 100 },
          opts: {
            priority: 10,
            jobId: 'idp-1',
          },
        });
      });

      it('should query for jobs from last 24 hours', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.recoverJobs();

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("INTERVAL '24 hours'")
        );
      });

      it('should query for pending and processing status', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.recoverJobs();

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("status IN ('pending', 'processing')")
        );
      });

      it('should order by priority and creation time', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await service.recoverJobs();

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY priority DESC, created_at ASC')
        );
      });

      it('should log recovery count', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
        });

        await service.recoverJobs();

        expect(logger.info).toHaveBeenCalledWith(
          'Recovering 3 Tier 1 jobs from PostgreSQL'
        );
      });

      it('should return empty array when no jobs to recover', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const jobs = await service.recoverJobs();

        expect(jobs).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith(
          'Recovering 0 Tier 1 jobs from PostgreSQL'
        );
      });
    });
  });

  describe('Tier 2 (Non-Critical Jobs)', () => {
    beforeEach(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_2);
    });

    describe('saveJob', () => {
      it('should not save to PostgreSQL for Tier 2', async () => {
        const job = {
          id: 'job-123',
          name: 'email',
          data: { to: 'user@example.com' },
        };

        await service.saveJob(job as any);

        expect(mockPool.query).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
      });
    });

    describe('markComplete', () => {
      it('should not update PostgreSQL for Tier 2', async () => {
        await service.markComplete('job-123', {});

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('markFailed', () => {
      it('should not update PostgreSQL for Tier 2', async () => {
        await service.markFailed('job-123', new Error('Failed'));

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('recoverJobs', () => {
      it('should return empty array for Tier 2', async () => {
        const jobs = await service.recoverJobs();

        expect(jobs).toEqual([]);
        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });
  });

  describe('Tier 3 (Background Jobs)', () => {
    beforeEach(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_3);
    });

    describe('saveJob', () => {
      it('should not save to PostgreSQL for Tier 3', async () => {
        const job = {
          id: 'job-123',
          name: 'analytics',
          data: { event: 'page_view' },
        };

        await service.saveJob(job as any);

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('markComplete', () => {
      it('should not update PostgreSQL for Tier 3', async () => {
        await service.markComplete('job-123', {});

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('markFailed', () => {
      it('should not update PostgreSQL for Tier 3', async () => {
        await service.markFailed('job-123', new Error('Failed'));

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('recoverJobs', () => {
      it('should return empty array for Tier 3', async () => {
        const jobs = await service.recoverJobs();

        expect(jobs).toEqual([]);
        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });
  });
});
