import { JobModel, IJob } from '../../../src/models/Job';
import Knex from 'knex';

describe('JobModel', () => {
  let mockDb: any;
  let jobModel: JobModel;

  beforeEach(() => {
    // Create a mock Knex instance with chainable query builder
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      del: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    // Mock the table function to return the mock query builder
    const tableMock = jest.fn(() => mockDb);
    mockDb = Object.assign(tableMock, mockDb);

    jobModel = new JobModel(mockDb as unknown as Knex);
  });

  describe('Constructor', () => {
    it('should initialize with provided db instance', () => {
      const model = new JobModel(mockDb as unknown as Knex);
      expect(model).toBeInstanceOf(JobModel);
    });

    it('should use default db if none provided', () => {
      // This will use the imported knex from config
      const model = new JobModel();
      expect(model).toBeInstanceOf(JobModel);
    });
  });

  describe('create', () => {
    it('should insert job and return created job', async () => {
      const jobData: IJob = {
        queue: 'payment-queue',
        type: 'process-payment',
        status: 'pending',
        data: { amount: 100 },
      };

      const expectedJob: IJob = {
        ...jobData,
        id: 'job-123',
        created_at: new Date(),
      };

      mockDb.returning.mockResolvedValue([expectedJob]);

      const result = await jobModel.create(jobData);

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.insert).toHaveBeenCalledWith(jobData);
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(expectedJob);
    });

    it('should handle job with scheduled_for date', async () => {
      const scheduledDate = new Date('2024-12-25');
      const jobData: IJob = {
        queue: 'email-queue',
        type: 'send-email',
        status: 'pending',
        scheduled_for: scheduledDate,
      };

      mockDb.returning.mockResolvedValue([{ ...jobData, id: 'job-456' }]);

      const result = await jobModel.create(jobData);

      expect(mockDb.insert).toHaveBeenCalledWith(jobData);
      expect(result.scheduled_for).toEqual(scheduledDate);
    });
  });

  describe('findById', () => {
    it('should return job when found', async () => {
      const expectedJob: IJob = {
        id: 'job-123',
        queue: 'test-queue',
        type: 'test-type',
        status: 'pending',
      };

      mockDb.first.mockResolvedValue(expectedJob);

      const result = await jobModel.findById('job-123');

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'job-123' });
      expect(mockDb.first).toHaveBeenCalled();
      expect(result).toEqual(expectedJob);
    });

    it('should return null when job not found', async () => {
      mockDb.first.mockResolvedValue(undefined);

      const result = await jobModel.findById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await jobModel.findById('job-999');

      expect(result).toBeNull();
    });
  });

  describe('findPending', () => {
    it('should find pending jobs with default limit', async () => {
      const now = new Date();
      const pendingJobs: IJob[] = [
        { id: '1', queue: 'test-queue', type: 'job1', status: 'pending' },
        { id: '2', queue: 'test-queue', type: 'job2', status: 'pending' },
      ];

      mockDb.limit.mockResolvedValue(pendingJobs);

      const result = await jobModel.findPending('test-queue');

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.where).toHaveBeenCalledWith({ queue: 'test-queue', status: 'pending' });
      expect(mockDb.where).toHaveBeenCalledWith('scheduled_for', '<=', expect.any(Date));
      expect(mockDb.orderBy).toHaveBeenCalledWith('created_at', 'asc');
      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual(pendingJobs);
    });

    it('should respect custom limit parameter', async () => {
      mockDb.limit.mockResolvedValue([]);

      await jobModel.findPending('test-queue', 25);

      expect(mockDb.limit).toHaveBeenCalledWith(25);
    });

    it('should filter by queue name', async () => {
      mockDb.limit.mockResolvedValue([]);

      await jobModel.findPending('payment-queue');

      expect(mockDb.where).toHaveBeenCalledWith({ 
        queue: 'payment-queue', 
        status: 'pending' 
      });
    });

    it('should only return jobs scheduled for now or earlier', async () => {
      mockDb.limit.mockResolvedValue([]);

      await jobModel.findPending('test-queue');

      // Verify scheduled_for filter is applied
      const whereCall = mockDb.where.mock.calls.find(
        (call: any[]) => call[0] === 'scheduled_for'
      );
      
      expect(whereCall).toBeDefined();
      expect(whereCall[1]).toBe('<=');
      expect(whereCall[2]).toBeInstanceOf(Date);
    });

    it('should return empty array when no pending jobs', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await jobModel.findPending('empty-queue');

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update job and return updated job', async () => {
      const updates: Partial<IJob> = {
        status: 'completed',
        completed_at: new Date(),
      };

      const updatedJob: IJob = {
        id: 'job-123',
        queue: 'test-queue',
        type: 'test-type',
        status: 'completed',
        completed_at: updates.completed_at,
        updated_at: expect.any(Date),
      };

      mockDb.returning.mockResolvedValue([updatedJob]);

      const result = await jobModel.update('job-123', updates);

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'job-123' });
      expect(mockDb.update).toHaveBeenCalledWith({
        ...updates,
        updated_at: expect.any(Date),
      });
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedJob);
    });

    it('should automatically set updated_at timestamp', async () => {
      const beforeUpdate = new Date();
      mockDb.returning.mockResolvedValue([{ id: 'job-123', status: 'failed' }]);

      await jobModel.update('job-123', { status: 'failed' });

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should return null when job not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await jobModel.update('nonexistent-id', { status: 'failed' });

      expect(result).toBeNull();
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { error: 'Connection timeout' };
      mockDb.returning.mockResolvedValue([{ id: 'job-123', ...partialUpdate }]);

      await jobModel.update('job-123', partialUpdate);

      expect(mockDb.update).toHaveBeenCalledWith({
        error: 'Connection timeout',
        updated_at: expect.any(Date),
      });
    });
  });

  describe('markAsProcessing', () => {
    it('should mark pending job as processing and return true', async () => {
      mockDb.update.mockResolvedValue(1); // 1 row affected

      const result = await jobModel.markAsProcessing('job-123');

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'job-123', status: 'pending' });
      expect(mockDb.update).toHaveBeenCalledWith({
        status: 'processing',
        started_at: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('should return false when job is not pending', async () => {
      mockDb.update.mockResolvedValue(0); // 0 rows affected

      const result = await jobModel.markAsProcessing('job-123');

      expect(result).toBe(false);
    });

    it('should return false when job does not exist', async () => {
      mockDb.update.mockResolvedValue(0);

      const result = await jobModel.markAsProcessing('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should set started_at timestamp', async () => {
      const beforeMark = new Date();
      mockDb.update.mockResolvedValue(1);

      await jobModel.markAsProcessing('job-123');

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.started_at).toBeInstanceOf(Date);
      expect(updateCall.started_at.getTime()).toBeGreaterThanOrEqual(beforeMark.getTime());
    });

    it('should only update jobs with pending status (conditional update)', async () => {
      mockDb.update.mockResolvedValue(1);

      await jobModel.markAsProcessing('job-123');

      // Verify the WHERE clause includes status check
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'job-123', status: 'pending' });
    });
  });

  describe('delete', () => {
    it('should delete job and return true', async () => {
      mockDb.del.mockResolvedValue(1); // 1 row deleted

      const result = await jobModel.delete('job-123');

      expect(mockDb).toHaveBeenCalledWith('jobs');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'job-123' });
      expect(mockDb.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when job does not exist', async () => {
      mockDb.del.mockResolvedValue(0); // 0 rows deleted

      const result = await jobModel.delete('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted (edge case)', async () => {
      mockDb.del.mockResolvedValue(2); // Unexpected multiple deletions

      const result = await jobModel.delete('job-123');

      expect(result).toBe(true);
    });
  });
});
