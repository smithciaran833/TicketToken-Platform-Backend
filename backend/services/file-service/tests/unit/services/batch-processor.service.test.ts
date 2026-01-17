import { BatchProcessorService } from '../../../src/services/batch-processor.service';
import { logger } from '../../../src/utils/logger';
import { cacheService } from '../../../src/services/cache.service';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/metrics.service');
jest.mock('../../../src/services/cache.service');
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/processors/image/watermark.processor', () => ({
  watermarkProcessor: {
    addTextWatermark: jest.fn().mockResolvedValue(Buffer.from('watermarked'))
  }
}));

describe('BatchProcessorService', () => {
  let batchProcessorService: BatchProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    (cacheService.set as jest.Mock).mockResolvedValue(undefined);
    (cacheService.get as jest.Mock).mockResolvedValue(null);
    (cacheService.delete as jest.Mock).mockResolvedValue(undefined);

    batchProcessorService = new BatchProcessorService();
  });

  describe('createBatchJob', () => {
    it('should create a batch job successfully', async () => {
      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1', 'file2'],
        { width: 800, height: 600 },
        'user-123',
        'tenant-123'
      );

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^batch_/);
      expect(cacheService.set).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Created batch job'));
    });

    it('should add job to active jobs', async () => {
      await batchProcessorService.createBatchJob(
        'compress',
        ['file1'],
        { quality: 70 },
        'user-123',
        'tenant-123'
      );

      const stats = batchProcessorService.getStats();
      // Job is added to activeJobs, may be pending or processing
      expect(stats.total).toBeGreaterThan(0);
    });

    it('should start processing automatically', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        storagePath: '/storage/test.jpg'
      });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('image data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        { width: 100, height: 100 },
        'user-123',
        'tenant-123'
      );

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fileModel.findById).toHaveBeenCalled();
    });
  });

  describe('getBatchJobStatus', () => {
    it('should return job status from memory', async () => {
      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        {},
        'user-123',
        'tenant-123'
      );

      const status = await batchProcessorService.getBatchJobStatus(jobId);

      expect(status).toBeDefined();
      expect(status?.id).toBe(jobId);
    });

    it('should return null for non-existent job', async () => {
      const status = await batchProcessorService.getBatchJobStatus('invalid-job-id');

      expect(status).toBeNull();
    });

    it('should fallback to cache when not in memory', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'resize' as const,
        status: 'completed' as const,
        progress: 100
      };

      (cacheService.get as jest.Mock).mockResolvedValue(mockJob);

      const status = await batchProcessorService.getBatchJobStatus('job-123');

      expect(status).toEqual(mockJob);
      expect(cacheService.get).toHaveBeenCalled();
    });
  });

  describe('processJob - resize', () => {
    it('should resize images successfully', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        storagePath: '/storage/image.jpg'
      });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('image data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        { width: 800, height: 600, quality: 85 },
        'user-123',
        'tenant-123'
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
    });
  });

  describe('processJob - convert', () => {
    it('should convert image format successfully', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        storagePath: '/storage/image.jpg'
      });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('image data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'convert',
        ['file1'],
        { format: 'png' },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
    });
  });

  describe('processJob - compress', () => {
    it('should compress images successfully', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        storagePath: '/storage/image.jpg'
      });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('large image data'.repeat(1000)));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'compress',
        ['file1'],
        { quality: 70 },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
    });
  });

  describe('processJob - watermark', () => {
    it('should add watermark to images successfully', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        storagePath: '/storage/image.jpg'
      });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('image data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'watermark',
        ['file1'],
        { text: 'CONFIDENTIAL', opacity: 0.5, position: 'center' },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
    });
  });

  describe('processJob - delete', () => {
    it('should delete files successfully', async () => {
      (fileModel.softDelete as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'delete',
        ['file1', 'file2'],
        {},
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
      expect(fileModel.softDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelBatchJob', () => {
    it('should cancel pending job', async () => {
      // Create a job with many files so it stays in queue longer
      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        {},
        'user-123',
        'tenant-123'
      );

      const cancelled = await batchProcessorService.cancelBatchJob(jobId);

      // After cancel, job is removed from activeJobs
      // So we just verify cancel returned true
      expect(cancelled).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cancelled batch job'));
    });

    it('should not cancel completed job', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/test.jpg' });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        { width: 100 },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const cancelled = await batchProcessorService.cancelBatchJob(jobId);

      expect(cancelled).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return false for non-existent job', async () => {
      const cancelled = await batchProcessorService.cancelBatchJob('invalid-job');

      expect(cancelled).toBe(false);
    });
  });

  describe('getActiveJobs', () => {
    it('should return list of active jobs', async () => {
      await batchProcessorService.createBatchJob('resize', ['file1'], {}, 'user-123', 'tenant-123');
      await batchProcessorService.createBatchJob('compress', ['file2'], {}, 'user-123', 'tenant-123');

      const jobs = batchProcessorService.getActiveJobs();

      expect(jobs.length).toBe(2);
      expect(jobs[0]!.type).toMatch(/resize|compress/);
    });

    it('should return empty array when no jobs', () => {
      const jobs = batchProcessorService.getActiveJobs();

      expect(jobs).toEqual([]);
    });
  });

  describe('getQueueSize', () => {
    it('should return queue size', async () => {
      await batchProcessorService.createBatchJob('resize', ['file1'], {}, 'user-123', 'tenant-123');

      const size = batchProcessorService.getQueueSize();

      expect(typeof size).toBe('number');
    });
  });

  describe('getStats', () => {
    it('should return batch processing statistics', async () => {
      await batchProcessorService.createBatchJob('resize', ['file1'], {}, 'user-123', 'tenant-123');

      const stats = batchProcessorService.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('queueSize');
    });
  });

  describe('cleanupOldJobs', () => {
    it('should clean up old completed jobs', async () => {
      // Create a job and wait for it to complete
      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/test.jpg' });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        { width: 100 },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify job is completed
      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');

      // Manually set completedAt to an old date to simulate old job
      if (status) {
        status.completedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      }

      await batchProcessorService.cleanupOldJobs(7); // Clean jobs older than 7 days

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });

    it('should not clean up recent jobs', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/test.jpg' });
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      await batchProcessorService.createBatchJob('resize', ['file1'], { width: 100 }, 'user-123', 'tenant-123');

      await new Promise(resolve => setTimeout(resolve, 200));

      await batchProcessorService.cleanupOldJobs(7);

      const stats = batchProcessorService.getStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle file not found errors', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue(null);

      await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        {},
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle storage download errors', async () => {
      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/test.jpg' });
      (storageService.download as jest.Mock).mockRejectedValue(new Error('Download failed'));

      await batchProcessorService.createBatchJob(
        'resize',
        ['file1'],
        {},
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(logger.error).toHaveBeenCalled();
    });

    it('should continue processing after individual file errors', async () => {
      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'file1', storagePath: '/storage/test1.jpg' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'file3', storagePath: '/storage/test3.jpg' });

      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('data'));
      (storageService.upload as jest.Mock).mockResolvedValue(undefined);

      const jobId = await batchProcessorService.createBatchJob(
        'resize',
        ['file1', 'file2', 'file3'],
        { width: 100 },
        'user-123',
        'tenant-123'
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      const status = await batchProcessorService.getBatchJobStatus(jobId);
      expect(status?.status).toBe('completed');
      expect(status?.progress).toBe(100);
    });
  });
});
