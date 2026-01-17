// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { BaseWorker } from '../../../src/workers/base.worker';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { logger } from '../../../src/utils/logger';

// Concrete implementation for testing
class TestWorker extends BaseWorker<{ value: string }, { result: string }> {
  protected name = 'test-worker';
  public executeMock = jest.fn();

  protected async execute(job: BullJobData<{ value: string }>): Promise<{ result: string }> {
    return this.executeMock(job);
  }
}

describe('BaseWorker', () => {
  let worker: TestWorker;
  let mockJob: BullJobData<{ value: string }>;

  beforeEach(() => {
    worker = new TestWorker();
    mockJob = {
      id: 'job-123',
      name: 'test-job',
      data: { value: 'test-data' },
      attemptsMade: 0,
      opts: { attempts: 5 },
    };

    worker.executeMock.mockResolvedValue({ result: 'success' });
  });

  describe('process', () => {
    it('should call execute and return result', async () => {
      const result = await worker.process(mockJob);

      expect(worker.executeMock).toHaveBeenCalledWith(mockJob);
      expect(result).toEqual({ result: 'success' });
    });

    it('should log job start with details', async () => {
      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job test-worker:',
        expect.objectContaining({
          jobId: 'job-123',
          attempt: 1,
          maxAttempts: 5,
        })
      );
    });

    it('should log job completion with duration', async () => {
      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Job test-worker completed:',
        expect.objectContaining({
          jobId: 'job-123',
          duration: expect.any(Number),
        })
      );
    });

    it('should calculate attempt number correctly', async () => {
      mockJob.attemptsMade = 2;

      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job test-worker:',
        expect.objectContaining({
          attempt: 3,
        })
      );
    });

    it('should use default maxAttempts when opts.attempts is missing', async () => {
      mockJob.opts = {};

      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job test-worker:',
        expect.objectContaining({
          maxAttempts: 3,
        })
      );
    });

    it('should use default maxAttempts when opts is undefined', async () => {
      mockJob.opts = undefined;

      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job test-worker:',
        expect.objectContaining({
          maxAttempts: 3,
        })
      );
    });

    it('should handle undefined attemptsMade', async () => {
      mockJob.attemptsMade = undefined;

      await worker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job test-worker:',
        expect.objectContaining({
          attempt: 1,
        })
      );
    });

    it('should throw error when execute fails', async () => {
      const error = new Error('Processing failed');
      worker.executeMock.mockRejectedValue(error);

      await expect(worker.process(mockJob)).rejects.toThrow('Processing failed');
    });

    it('should log error when execute fails', async () => {
      const error = new Error('Something went wrong');
      worker.executeMock.mockRejectedValue(error);

      await expect(worker.process(mockJob)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Job test-worker failed:',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Something went wrong',
        })
      );
    });

    it('should log non-Error objects when execute fails', async () => {
      worker.executeMock.mockRejectedValue('string error');

      await expect(worker.process(mockJob)).rejects.toBe('string error');

      expect(logger.error).toHaveBeenCalledWith(
        'Job test-worker failed:',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'string error',
        })
      );
    });

    it('should handle null error value', async () => {
      worker.executeMock.mockRejectedValue(null);

      await expect(worker.process(mockJob)).rejects.toBeNull();

      expect(logger.error).toHaveBeenCalledWith(
        'Job test-worker failed:',
        expect.objectContaining({
          error: null,
        })
      );
    });

    it('should measure processing duration accurately', async () => {
      worker.executeMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'delayed' };
      });

      await worker.process(mockJob);

      const infoCall = (logger.info as jest.Mock).mock.calls.find(
        call => call[0] === 'Job test-worker completed:'
      );
      expect(infoCall[1].duration).toBeGreaterThanOrEqual(50);
    });

    it('should return execute result unchanged', async () => {
      const complexResult = {
        result: 'complex',
        nested: { data: [1, 2, 3] },
        count: 42,
      };
      worker.executeMock.mockResolvedValue(complexResult);

      const result = await worker.process(mockJob);

      expect(result).toEqual(complexResult);
    });

    it('should handle execute returning undefined', async () => {
      worker.executeMock.mockResolvedValue(undefined);

      const result = await worker.process(mockJob);

      expect(result).toBeUndefined();
    });

    it('should handle execute returning null', async () => {
      worker.executeMock.mockResolvedValue(null);

      const result = await worker.process(mockJob);

      expect(result).toBeNull();
    });
  });

  describe('worker name', () => {
    it('should use worker name in logs', async () => {
      class CustomNameWorker extends BaseWorker {
        protected name = 'custom-processor';
        protected async execute(): Promise<any> {
          return { ok: true };
        }
      }

      const customWorker = new CustomNameWorker();
      await customWorker.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing job custom-processor:',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Job custom-processor completed:',
        expect.any(Object)
      );
    });
  });
});
