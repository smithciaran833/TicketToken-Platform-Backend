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

jest.mock('../../../src/queues/factories/queue.factory', () => ({
  QueueFactory: {
    getQueue: jest.fn(),
  },
}));

jest.mock('../../../src/config/constants', () => ({
  JOB_TYPES: {
    PAYMENT: 'payment',
    REFUND: 'refund',
    MINT: 'mint',
  },
  QUEUE_NAMES: {
    MONEY: 'money',
    COMMUNICATION: 'communication',
    BACKGROUND: 'background',
  },
}));

import { RecoveryService } from '../../../src/services/recovery.service';
import { getPool } from '../../../src/config/database.config';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { logger } from '../../../src/utils/logger';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let mockPool: any;
  let mockQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    mockPool = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    (QueueFactory.getQueue as jest.Mock).mockReturnValue(mockQueue);

    service = new RecoveryService();
  });

  describe('recoverPendingJobs', () => {
    it('should recover pending jobs from database', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          queue_name: 'money',
          job_type: 'payment',
          data: { amount: 100 },
          priority: 10,
          attempts: 2,
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: 'job-2',
          queue_name: 'communication',
          job_type: 'email',
          data: { to: 'user@example.com' },
          priority: 5,
          attempts: 1,
          status: 'processing',
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockJobs });

      await service.recoverPendingJobs();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM critical_jobs')
      );
      expect(logger.info).toHaveBeenCalledWith('Starting job recovery process...');
      expect(logger.info).toHaveBeenCalledWith('Found 2 jobs to recover');
      expect(logger.info).toHaveBeenCalledWith('Job recovery completed');
    });

    it('should handle no jobs to recover', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.recoverPendingJobs();

      expect(logger.info).toHaveBeenCalledWith('No jobs to recover');
      expect(QueueFactory.getQueue).not.toHaveBeenCalled();
    });

    it('should recover jobs with correct remaining attempts', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 3, // Has made 3 attempts
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        { amount: 100 },
        {
          jobId: 'job-1',
          priority: 10,
          attempts: 7, // 10 - 3 = 7 remaining
        }
      );
      expect(logger.info).toHaveBeenCalledWith('Recovered job job-123 to money');
    });

    it('should handle individual job recovery failures', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          queue_name: 'money',
          job_type: 'payment',
          data: { amount: 100 },
          priority: 10,
          attempts: 2,
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: 'job-2',
          queue_name: 'communication',
          job_type: 'email',
          data: { to: 'user@example.com' },
          priority: 5,
          attempts: 1,
          status: 'pending',
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockJobs });
      mockQueue.add
        .mockResolvedValueOnce({ id: 'job-1' })
        .mockRejectedValueOnce(new Error('Queue error'));

      await service.recoverPendingJobs();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to recover job job-2:',
        expect.any(Error)
      );
      expect(logger.info).toHaveBeenCalledWith('Job recovery completed');
    });

    it('should handle database query errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await service.recoverPendingJobs();

      expect(logger.error).toHaveBeenCalledWith(
        'Recovery process failed:',
        expect.any(Error)
      );
    });

    it('should query for jobs from last 24 hours', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.recoverPendingJobs();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '24 hours'")
      );
    });

    it('should query for pending and processing jobs', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.recoverPendingJobs();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'processing')")
      );
    });

    it('should order jobs by priority and creation time', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.recoverPendingJobs();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority DESC, created_at ASC')
      );
    });
  });

  describe('Queue Determination', () => {
    it('should recover job to money queue', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('money');
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should recover job to communication queue', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'communication',
        job_type: 'email',
        data: { to: 'user@example.com' },
        priority: 5,
        attempts: 1,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('communication');
    });

    it('should recover job to background queue', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'background',
        job_type: 'analytics',
        data: { eventType: 'page_view' },
        priority: 1,
        attempts: 0,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(QueueFactory.getQueue).toHaveBeenCalledWith('background');
    });

    it('should handle unknown queue gracefully', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'unknown-queue',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });
      (QueueFactory.getQueue as jest.Mock).mockReturnValue(null);

      await service.recoverPendingJobs();

      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown queue for job job-1: unknown-queue'
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle null queue from factory', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });
      (QueueFactory.getQueue as jest.Mock).mockReturnValue(null);

      await service.recoverPendingJobs();

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Job Data Handling', () => {
    it('should preserve job priority', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 8,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({ priority: 8 })
      );
    });

    it('should use original job ID', async () => {
      const mockJob = {
        id: 'original-job-id',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({ jobId: 'original-job-id' })
      );
    });

    it('should pass through job data correctly', async () => {
      const jobData = {
        amount: 150,
        userId: 'user-123',
        orderId: 'order-456',
      };

      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: jobData,
        priority: 10,
        attempts: 2,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        jobData,
        expect.any(Object)
      );
    });

    it('should handle jobs with zero attempts', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 0,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({ attempts: 10 }) // 10 - 0 = 10
      );
    });

    it('should handle jobs with max attempts', async () => {
      const mockJob = {
        id: 'job-1',
        queue_name: 'money',
        job_type: 'payment',
        data: { amount: 100 },
        priority: 10,
        attempts: 9,
        status: 'pending',
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockJob] });

      await service.recoverPendingJobs();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment',
        expect.any(Object),
        expect.objectContaining({ attempts: 1 }) // 10 - 9 = 1
      );
    });
  });
});
