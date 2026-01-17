import { ScheduleModel, ISchedule } from '../../../src/models/Schedule';
import Knex from 'knex';

describe('ScheduleModel', () => {
  let mockDb: any;
  let scheduleModel: ScheduleModel;

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
    };

    // Mock the table function to return the mock query builder
    const tableMock = jest.fn(() => mockDb);
    mockDb = Object.assign(tableMock, mockDb);

    scheduleModel = new ScheduleModel(mockDb as unknown as Knex);
  });

  describe('Constructor', () => {
    it('should initialize with provided db instance', () => {
      const model = new ScheduleModel(mockDb as unknown as Knex);
      expect(model).toBeInstanceOf(ScheduleModel);
    });

    it('should use default db if none provided', () => {
      const model = new ScheduleModel();
      expect(model).toBeInstanceOf(ScheduleModel);
    });
  });

  describe('create', () => {
    it('should insert schedule and return created record', async () => {
      const scheduleData: ISchedule = {
        name: 'daily-cleanup',
        cron_expression: '0 0 * * *',
        job_type: 'cleanup',
        active: true,
        job_data: { retention_days: 30 },
      };

      const expectedSchedule: ISchedule = {
        ...scheduleData,
        id: 'schedule-123',
        created_at: new Date(),
        next_run: new Date(Date.now() + 86400000), // tomorrow
      };

      mockDb.returning.mockResolvedValue([expectedSchedule]);

      const result = await scheduleModel.create(scheduleData);

      expect(mockDb).toHaveBeenCalledWith('schedules');
      expect(mockDb.insert).toHaveBeenCalledWith(scheduleData);
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(expectedSchedule);
    });

    it('should handle schedule with cron expression for every minute', async () => {
      const scheduleData: ISchedule = {
        name: 'heartbeat',
        cron_expression: '* * * * *',
        job_type: 'ping',
        active: true,
      };

      mockDb.returning.mockResolvedValue([{ ...scheduleData, id: 'schedule-456' }]);

      const result = await scheduleModel.create(scheduleData);

      expect(mockDb.insert).toHaveBeenCalledWith(scheduleData);
      expect(result.cron_expression).toBe('* * * * *');
    });

    it('should handle inactive schedule', async () => {
      const scheduleData: ISchedule = {
        name: 'paused-job',
        cron_expression: '0 12 * * 1',
        job_type: 'report',
        active: false,
      };

      mockDb.returning.mockResolvedValue([{ ...scheduleData, id: 'schedule-789' }]);

      const result = await scheduleModel.create(scheduleData);

      expect(result.active).toBe(false);
    });

    it('should handle schedule with job_data payload', async () => {
      const jobData = {
        recipients: ['admin@example.com'],
        template: 'weekly-report',
        filters: { status: 'completed' },
      };

      const scheduleData: ISchedule = {
        name: 'weekly-email',
        cron_expression: '0 9 * * 1',
        job_type: 'email',
        active: true,
        job_data: jobData,
      };

      mockDb.returning.mockResolvedValue([{ ...scheduleData, id: 'schedule-999' }]);

      const result = await scheduleModel.create(scheduleData);

      expect(result.job_data).toEqual(jobData);
    });

    it('should handle schedule with last_run and next_run dates', async () => {
      const lastRun = new Date('2024-01-15T10:00:00Z');
      const nextRun = new Date('2024-01-16T10:00:00Z');

      const scheduleData: ISchedule = {
        name: 'recurring-task',
        cron_expression: '0 10 * * *',
        job_type: 'sync',
        active: true,
        last_run: lastRun,
        next_run: nextRun,
      };

      mockDb.returning.mockResolvedValue([{ ...scheduleData, id: 'schedule-111' }]);

      const result = await scheduleModel.create(scheduleData);

      expect(result.last_run).toEqual(lastRun);
      expect(result.next_run).toEqual(nextRun);
    });
  });

  describe('findById', () => {
    it('should return schedule when found', async () => {
      const expectedSchedule: ISchedule = {
        id: 'schedule-123',
        name: 'daily-backup',
        cron_expression: '0 2 * * *',
        job_type: 'backup',
        active: true,
      };

      mockDb.first.mockResolvedValue(expectedSchedule);

      const result = await scheduleModel.findById('schedule-123');

      expect(mockDb).toHaveBeenCalledWith('schedules');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDb.first).toHaveBeenCalled();
      expect(result).toEqual(expectedSchedule);
    });

    it('should return null when schedule not found', async () => {
      mockDb.first.mockResolvedValue(undefined);

      const result = await scheduleModel.findById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await scheduleModel.findById('schedule-999');

      expect(result).toBeNull();
    });
  });

  describe('findActive', () => {
    it('should return only active schedules ordered by next_run', async () => {
      const activeSchedules: ISchedule[] = [
        {
          id: '1',
          name: 'job-1',
          cron_expression: '0 0 * * *',
          job_type: 'cleanup',
          active: true,
          next_run: new Date('2024-01-16T00:00:00Z'),
        },
        {
          id: '2',
          name: 'job-2',
          cron_expression: '0 12 * * *',
          job_type: 'report',
          active: true,
          next_run: new Date('2024-01-16T12:00:00Z'),
        },
        {
          id: '3',
          name: 'job-3',
          cron_expression: '* * * * *',
          job_type: 'heartbeat',
          active: true,
          next_run: new Date('2024-01-15T23:59:00Z'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(activeSchedules);

      const result = await scheduleModel.findActive();

      expect(mockDb).toHaveBeenCalledWith('schedules');
      expect(mockDb.where).toHaveBeenCalledWith({ active: true });
      expect(mockDb.orderBy).toHaveBeenCalledWith('next_run', 'asc');
      expect(result).toEqual(activeSchedules);
    });

    it('should filter out inactive schedules', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await scheduleModel.findActive();

      // Verify only active schedules are queried
      expect(mockDb.where).toHaveBeenCalledWith({ active: true });
      expect(mockDb.where).not.toHaveBeenCalledWith({ active: false });
    });

    it('should return empty array when no active schedules exist', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await scheduleModel.findActive();

      expect(result).toEqual([]);
    });

    it('should order results by next_run in ascending order (earliest first)', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await scheduleModel.findActive();

      expect(mockDb.orderBy).toHaveBeenCalledWith('next_run', 'asc');
    });

    it('should handle schedules without next_run date', async () => {
      const schedules: ISchedule[] = [
        {
          id: '1',
          name: 'job-1',
          cron_expression: '0 0 * * *',
          job_type: 'task',
          active: true,
          // next_run is undefined
        },
      ];

      mockDb.orderBy.mockResolvedValue(schedules);

      const result = await scheduleModel.findActive();

      expect(result).toEqual(schedules);
      expect(result[0].next_run).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update schedule and return updated record', async () => {
      const updates: Partial<ISchedule> = {
        active: false,
        cron_expression: '0 3 * * *',
      };

      const updatedSchedule: ISchedule = {
        id: 'schedule-123',
        name: 'daily-backup',
        cron_expression: '0 3 * * *',
        job_type: 'backup',
        active: false,
        updated_at: expect.any(Date),
      };

      mockDb.returning.mockResolvedValue([updatedSchedule]);

      const result = await scheduleModel.update('schedule-123', updates);

      expect(mockDb).toHaveBeenCalledWith('schedules');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDb.update).toHaveBeenCalledWith({
        ...updates,
        updated_at: expect.any(Date),
      });
      expect(mockDb.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedSchedule);
    });

    it('should automatically set updated_at timestamp', async () => {
      const beforeUpdate = new Date();
      mockDb.returning.mockResolvedValue([{ id: 'schedule-123', active: false }]);

      await scheduleModel.update('schedule-123', { active: false });

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should return null when schedule not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await scheduleModel.update('nonexistent-id', { active: false });

      expect(result).toBeNull();
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { last_run: new Date('2024-01-15T10:00:00Z') };
      mockDb.returning.mockResolvedValue([{ id: 'schedule-123', ...partialUpdate }]);

      await scheduleModel.update('schedule-123', partialUpdate);

      expect(mockDb.update).toHaveBeenCalledWith({
        last_run: partialUpdate.last_run,
        updated_at: expect.any(Date),
      });
    });

    it('should update cron expression', async () => {
      const updates = { cron_expression: '*/5 * * * *' };
      mockDb.returning.mockResolvedValue([{ id: 'schedule-123', ...updates }]);

      const result = await scheduleModel.update('schedule-123', updates);

      expect(result?.cron_expression).toBe('*/5 * * * *');
    });

    it('should update job_data payload', async () => {
      const newJobData = { threshold: 100, notify: true };
      const updates = { job_data: newJobData };
      mockDb.returning.mockResolvedValue([{ id: 'schedule-123', ...updates }]);

      const result = await scheduleModel.update('schedule-123', updates);

      expect(result?.job_data).toEqual(newJobData);
    });

    it('should update next_run timestamp', async () => {
      const nextRun = new Date('2024-12-25T00:00:00Z');
      const updates = { next_run: nextRun };
      mockDb.returning.mockResolvedValue([{ id: 'schedule-123', ...updates }]);

      const result = await scheduleModel.update('schedule-123', updates);

      expect(result?.next_run).toEqual(nextRun);
    });
  });

  describe('delete', () => {
    it('should delete schedule and return true', async () => {
      mockDb.del.mockResolvedValue(1);

      const result = await scheduleModel.delete('schedule-123');

      expect(mockDb).toHaveBeenCalledWith('schedules');
      expect(mockDb.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDb.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when schedule does not exist', async () => {
      mockDb.del.mockResolvedValue(0);

      const result = await scheduleModel.delete('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted (edge case)', async () => {
      mockDb.del.mockResolvedValue(2);

      const result = await scheduleModel.delete('schedule-123');

      expect(result).toBe(true);
    });
  });
});
