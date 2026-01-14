import { PersistenceService } from '../../../src/services/persistence.service';
import { PERSISTENCE_TIERS } from '../../../src/config/constants';

describe('PersistenceService', () => {
  describe('Tier 1 (Critical)', () => {
    let service: PersistenceService;

    beforeAll(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_1);
    });

    it('should initialize for Tier 1', () => {
      expect(service).toBeDefined();
    });

    it('should save jobs to PostgreSQL', async () => {
      const mockJob = {
        id: 'test-job-1',
        queue: { name: 'money' },
        name: 'payment-process',
        data: { amount: 100 },
        opts: { priority: 5 }
      } as any;

      await expect(service.saveJob(mockJob)).resolves.not.toThrow();
    });

    it('should mark jobs as complete', async () => {
      await expect(service.markComplete('test-job-1', { success: true }))
        .resolves.not.toThrow();
    });

    it('should mark jobs as failed', async () => {
      await expect(service.markFailed('test-job-1', new Error('Test error')))
        .resolves.not.toThrow();
    });

    it('should recover jobs from PostgreSQL', async () => {
      const jobs = await service.recoverJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });
  });

  describe('Tier 2 (Medium)', () => {
    let service: PersistenceService;

    beforeAll(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_2);
    });

    it('should initialize for Tier 2', () => {
      expect(service).toBeDefined();
    });

    it('should save jobs to Redis', async () => {
      const mockJob = {
        id: 'test-job-2',
        queue: { name: 'communication' },
        name: 'send-email',
        data: { to: 'test@example.com' },
        opts: { priority: 5 }
      } as any;

      await expect(service.saveJob(mockJob)).resolves.not.toThrow();
    });

    it('should not recover jobs (Tier 2 only Redis)', async () => {
      const jobs = await service.recoverJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('Tier 3 (Background)', () => {
    let service: PersistenceService;

    beforeAll(() => {
      service = new PersistenceService(PERSISTENCE_TIERS.TIER_3);
    });

    it('should initialize for Tier 3', () => {
      expect(service).toBeDefined();
    });

    it('should handle jobs in memory only', async () => {
      const mockJob = {
        id: 'test-job-3',
        queue: { name: 'background' },
        name: 'analytics-event',
        data: { event: 'page_view' },
        opts: { priority: 5 }
      } as any;

      // Should not throw, but won't persist
      await expect(service.saveJob(mockJob)).resolves.not.toThrow();
    });

    it('should not recover jobs (Tier 3 memory only)', async () => {
      const jobs = await service.recoverJobs();
      expect(jobs).toEqual([]);
    });
  });
});
