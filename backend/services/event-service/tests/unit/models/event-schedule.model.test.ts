import { EventScheduleModel } from '../../../src/models/event-schedule.model';
import { Knex } from 'knex';

describe('Event Schedule Model', () => {
  let mockDb: any;
  let scheduleModel: EventScheduleModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereBetween: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      orderBy: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    scheduleModel = new EventScheduleModel(mockDb as any);
  });

  describe('findById', () => {
    it('should find schedule by id', async () => {
      const mockSchedule = { id: '1', event_id: 'event-123' };
      mockQueryBuilder.first.mockResolvedValue(mockSchedule);

      const result = await scheduleModel.findById('1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '1' });
      expect(result).toEqual(mockSchedule);
    });
  });

  describe('findByEventId', () => {
    it('should find schedules by event id', async () => {
      const mockSchedules = [{ id: '1', event_id: 'event-123' }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockSchedules);

      const result = await scheduleModel.findByEventId('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(result).toEqual(mockSchedules);
    });

    it('should filter by tenant id if provided', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await scheduleModel.findByEventId('event-123', 'tenant-456');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ tenant_id: 'tenant-456' });
    });
  });

  describe('findUpcomingSchedules', () => {
    it('should find upcoming schedules', async () => {
      const mockSchedules = [{ id: '1', starts_at: new Date('2025-12-31') }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockSchedules);

      const result = await scheduleModel.findUpcomingSchedules('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith('status', ['SCHEDULED', 'CONFIRMED']);
      expect(result).toEqual(mockSchedules);
    });
  });

  describe('findSchedulesByDateRange', () => {
    it('should find schedules in date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const mockSchedules = [{ id: '1' }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockSchedules);

      const result = await scheduleModel.findSchedulesByDateRange(startDate, endDate);

      expect(mockQueryBuilder.whereBetween).toHaveBeenCalledWith('starts_at', [startDate, endDate]);
      expect(result).toEqual(mockSchedules);
    });
  });

  describe('getNextSchedule', () => {
    it('should get next schedule for event', async () => {
      const mockSchedule = { id: '1', starts_at: new Date('2025-12-31') };
      mockQueryBuilder.first.mockResolvedValue(mockSchedule);

      const result = await scheduleModel.getNextSchedule('event-123');

      expect(mockQueryBuilder.whereIn).toHaveBeenCalledWith('status', ['SCHEDULED', 'CONFIRMED']);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('starts_at', 'asc');
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toEqual(mockSchedule);
    });
  });

  describe('updateWithTenant', () => {
    it('should update schedule with tenant check', async () => {
      const updated = { id: '1', tenant_id: 'tenant-123', status: 'CONFIRMED' };
      mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await scheduleModel.updateWithTenant('1', 'tenant-123', { status: 'CONFIRMED' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '1', tenant_id: 'tenant-123' });
      expect(result).toEqual(updated);
    });
  });
});
