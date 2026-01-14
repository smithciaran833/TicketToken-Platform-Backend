import { EventCapacityModel } from '../../../src/models/event-capacity.model';
import { Knex } from 'knex';

describe('Event Capacity Model', () => {
  let mockDb: any;
  let capacityModel: EventCapacityModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
      sum: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      increment: jest.fn().mockResolvedValue(1),
      decrement: jest.fn().mockResolvedValue(1),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    capacityModel = new EventCapacityModel(mockDb as any);
  });

  describe('findByEventId', () => {
    it('should find capacity by event id', async () => {
      const mockCapacity = [
        { id: '1', event_id: 'event-123', section_name: 'Section A' },
        { id: '2', event_id: 'event-123', section_name: 'Section B' }
      ];
      mockQueryBuilder.orderBy.mockResolvedValue(mockCapacity);

      const result = await capacityModel.findByEventId('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        event_id: 'event-123', 
        is_active: true 
      });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('section_name', 'asc');
      expect(result).toEqual(mockCapacity);
    });
  });

  describe('findByScheduleId', () => {
    it('should find capacity by schedule id', async () => {
      const mockCapacity = [
        { id: '1', schedule_id: 'schedule-123', section_name: 'VIP' }
      ];
      mockQueryBuilder.orderBy.mockResolvedValue(mockCapacity);

      const result = await capacityModel.findByScheduleId('schedule-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        schedule_id: 'schedule-123', 
        is_active: true 
      });
      expect(result).toEqual(mockCapacity);
    });
  });

  describe('getTotalCapacity', () => {
    it('should get total capacity for event', async () => {
      mockQueryBuilder.first.mockResolvedValue({ total: '500' });

      const result = await capacityModel.getTotalCapacity('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        event_id: 'event-123', 
        is_active: true 
      });
      expect(mockQueryBuilder.sum).toHaveBeenCalledWith('total_capacity as total');
      expect(result).toBe(500);
    });

    it('should get total capacity for event and schedule', async () => {
      mockQueryBuilder.first.mockResolvedValue({ total: '200' });

      const result = await capacityModel.getTotalCapacity('event-123', 'schedule-456');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ schedule_id: 'schedule-456' });
      expect(result).toBe(200);
    });

    it('should return 0 when no capacity found', async () => {
      mockQueryBuilder.first.mockResolvedValue({ total: null });

      const result = await capacityModel.getTotalCapacity('event-123');

      expect(result).toBe(0);
    });
  });

  describe('getAvailableCapacity', () => {
    it('should get available capacity for event', async () => {
      mockQueryBuilder.first.mockResolvedValue({ available: '150' });

      const result = await capacityModel.getAvailableCapacity('event-123');

      expect(mockQueryBuilder.sum).toHaveBeenCalledWith('available_capacity as available');
      expect(result).toBe(150);
    });

    it('should get available capacity for event and schedule', async () => {
      mockQueryBuilder.first.mockResolvedValue({ available: '75' });

      const result = await capacityModel.getAvailableCapacity('event-123', 'schedule-456');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ schedule_id: 'schedule-456' });
      expect(result).toBe(75);
    });
  });

  describe('updateSoldCount', () => {
    it('should increment sold count', async () => {
      await capacityModel.updateSoldCount('capacity-123', 5);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'capacity-123' });
      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('sold_count', 5);
    });
  });

  describe('updatePendingCount', () => {
    it('should increment pending count', async () => {
      await capacityModel.updatePendingCount('capacity-123', 3);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'capacity-123' });
      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('pending_count', 3);
    });
  });

  describe('decrementPendingCount', () => {
    it('should decrement pending count', async () => {
      await capacityModel.decrementPendingCount('capacity-123', 2);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'capacity-123' });
      expect(mockQueryBuilder.decrement).toHaveBeenCalledWith('pending_count', 2);
    });
  });
});
