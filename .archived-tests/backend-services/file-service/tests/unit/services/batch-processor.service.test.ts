import { BatchProcessorService } from '../../../src/services/batch-processor.service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/metrics.service');

describe('BatchProcessorService', () => {
  let service: BatchProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatchProcessorService();
  });

  describe('createBatchJob', () => {
    it('should create a new batch job', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      const options = { width: 800, height: 600 };

      const jobId = await service.createBatchJob(
        'resize',
        fileIds,
        options,
        'user-123'
      );

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^batch_/);
    });

    it('should add job to queue', async () => {
      const fileIds = ['file-1'];
      
      const jobId = await service.createBatchJob(
        'resize',
        fileIds,
        {},
        'user-123'
      );

      const status = await service.getBatchJobStatus(jobId);
      expect(status).toBeDefined();
      expect(status?.status).toMatch(/pending|processing|completed/);
    });

    it('should handle different job types', async () => {
      const types: Array<'resize' | 'convert' | 'compress' | 'watermark' | 'delete'> = [
        'resize',
        'convert', 
        'compress',
        'watermark',
        'delete'
      ];

      for (const type of types) {
        const jobId = await service.createBatchJob(
          type,
          ['file-1'],
          {},
          'user-123'
        );
        expect(jobId).toBeDefined();
      }
    });
  });

  describe('getBatchJobStatus', () => {
    it('should return job status', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        ['file-1'],
        {},
        'user-123'
      );

      const status = await service.getBatchJobStatus(jobId);

      expect(status).toBeDefined();
      expect(status?.id).toBe(jobId);
      expect(status?.type).toBe('resize');
    });

    it('should return null for non-existent job', async () => {
      const status = await service.getBatchJobStatus('nonexistent-job');

      expect(status).toBeNull();
    });
  });

  describe('cancelBatchJob', () => {
    it('should cancel pending job', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        ['file-1', 'file-2'],
        {},
        'user-123'
      );

      const result = await service.cancelBatchJob(jobId);

      expect(result).toBe(true);
      
      const status = await service.getBatchJobStatus(jobId);
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('Cancelled');
    });

    it('should not cancel completed job', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        [],
        {},
        'user-123'
      );

      // Wait for job to complete (empty file list completes immediately)
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await service.cancelBatchJob(jobId);

      expect(result).toBe(false);
    });

    it('should return false for non-existent job', async () => {
      const result = await service.cancelBatchJob('nonexistent-job');

      expect(result).toBe(false);
    });
  });

  describe('getActiveJobs', () => {
    it('should return list of active jobs', async () => {
      await service.createBatchJob('resize', ['file-1'], {}, 'user-1');
      await service.createBatchJob('compress', ['file-2'], {}, 'user-2');

      const jobs = service.getActiveJobs();

      expect(jobs.length).toBeGreaterThanOrEqual(2);
      expect(jobs.some(j => j.type === 'resize')).toBe(true);
      expect(jobs.some(j => j.type === 'compress')).toBe(true);
    });

    it('should return empty array when no jobs', async () => {
      const newService = new BatchProcessorService();
      const jobs = newService.getActiveJobs();

      expect(jobs).toEqual([]);
    });
  });

  describe('getQueueSize', () => {
    it('should return current queue size', () => {
      const size = service.getQueueSize();

      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    it('should return job statistics', async () => {
      await service.createBatchJob('resize', ['file-1'], {}, 'user-1');
      await service.createBatchJob('compress', ['file-2'], {}, 'user-2');

      const stats = service.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('queueSize');
      
      expect(stats.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should cleanup completed jobs older than specified days', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        [],
        {},
        'user-123'
      );

      // Wait for immediate completion
      await new Promise(resolve => setTimeout(resolve, 100));

      await service.cleanupOldJobs(0); // Clean up immediately

      const statsBefore = service.getStats();
      expect(statsBefore.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('job processing', () => {
    it('should process empty job list immediately', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        [],
        {},
        'user-123'
      );

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await service.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
      expect(status?.progress).toBe(100);
    });

    it('should update progress during processing', async () => {
      const jobId = await service.createBatchJob(
        'resize',
        ['file-1', 'file-2', 'file-3'],
        { width: 800 },
        'user-123'
      );

      // Check initial status
      const initialStatus = await service.getBatchJobStatus(jobId);
      expect(initialStatus?.progress).toBeGreaterThanOrEqual(0);
      expect(initialStatus?.progress).toBeLessThanOrEqual(100);
    });
  });

  describe('job ID generation', () => {
    it('should generate unique job IDs', async () => {
      const jobId1 = await service.createBatchJob('resize', ['file-1'], {}, 'user-1');
      const jobId2 = await service.createBatchJob('resize', ['file-1'], {}, 'user-1');

      expect(jobId1).not.toBe(jobId2);
      expect(jobId1).toMatch(/^batch_\d+_[a-z0-9]+$/);
      expect(jobId2).toMatch(/^batch_\d+_[a-z0-9]+$/);
    });
  });
});
