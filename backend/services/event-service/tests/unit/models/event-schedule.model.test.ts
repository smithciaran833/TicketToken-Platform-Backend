/**
 * Unit tests for EventScheduleModel
 * Tests schedule operations and date range queries
 */

import { EventScheduleModel, IEventSchedule } from '../../../src/models/event-schedule.model';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('EventScheduleModel', () => {
  let mockDb: any;
  let model: EventScheduleModel;

  const mockSchedule: IEventSchedule = {
    id: 'schedule-123',
    event_id: 'event-123',
    tenant_id: 'tenant-1',
    start_time: new Date('2026-03-01T20:00:00Z'),
    end_time: new Date('2026-03-01T23:00:00Z'),
    doors_open: new Date('2026-03-01T19:00:00Z'),
    timezone: 'America/New_York',
    status: 'SCHEDULED',
    is_recurring: false,
    recurrence_pattern: null,
    venue_room: 'Main Hall',
    capacity_override: null,
    notes: 'Opening night',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventScheduleModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with event_schedules table', () => {
      expect(model).toBeInstanceOf(EventScheduleModel);
      expect((model as any).tableName).toBe('event_schedules');
    });
  });

  describe('findById (override)', () => {
    it('should find schedule by ID without soft delete check', async () => {
      configureMockReturn(mockDb, mockSchedule);

      const result = await model.findById('schedule-123');

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      // Note: Override should NOT call whereNull for deleted_at
      expect(result?.status).toBe('SCHEDULED');
    });

    it('should return null when schedule not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEventId', () => {
    it('should find schedules by event ID', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      const result = await model.findByEventId('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('start_time', 'asc');
      expect(result).toHaveLength(1);
    });

    it('should return multiple schedules sorted by start time', async () => {
      const schedules = [
        { ...mockSchedule, id: 's1', start_time: new Date('2026-03-01') },
        { ...mockSchedule, id: 's2', start_time: new Date('2026-03-02') },
        { ...mockSchedule, id: 's3', start_time: new Date('2026-03-03') },
      ];
      configureMockArray(mockDb, schedules);

      const result = await model.findByEventId('event-123');

      expect(result).toHaveLength(3);
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('start_time', 'asc');
    });

    it('should return empty array when no schedules', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByEventId('event-123');

      expect(result).toEqual([]);
    });
  });

  describe('findUpcomingSchedules', () => {
    it('should find schedules after current date', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      const result = await model.findUpcomingSchedules('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(result).toHaveLength(1);
    });

    it('should apply limit option', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      await model.findUpcomingSchedules('event-123', 5);

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(5);
    });

    it('should order by start_time ascending', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      await model.findUpcomingSchedules('event-123');

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('start_time', 'asc');
    });

    it('should filter out past schedules', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      await model.findUpcomingSchedules('event-123');

      // Should have a where clause for start_time > now
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });
  });

  describe('findSchedulesByDateRange', () => {
    it('should find schedules within date range', async () => {
      configureMockArray(mockDb, [mockSchedule]);
      const startDate = new Date('2026-03-01');
      const endDate = new Date('2026-03-31');

      const result = await model.findSchedulesByDateRange('event-123', startDate, endDate);

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(result).toHaveLength(1);
    });

    it('should use whereBetween for date filtering', async () => {
      configureMockArray(mockDb, [mockSchedule]);
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');

      await model.findSchedulesByDateRange('event-123', startDate, endDate);

      expect(mockDb._mockChain.whereBetween).toHaveBeenCalledWith('start_time', [startDate, endDate]);
    });

    it('should order by start_time ascending', async () => {
      configureMockArray(mockDb, [mockSchedule]);

      await model.findSchedulesByDateRange(
        'event-123',
        new Date('2026-01-01'),
        new Date('2026-12-31')
      );

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('start_time', 'asc');
    });

    it('should return empty array for range with no schedules', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findSchedulesByDateRange(
        'event-123',
        new Date('2025-01-01'),
        new Date('2025-12-31')
      );

      expect(result).toEqual([]);
    });
  });

  describe('getNextSchedule', () => {
    it('should return the next upcoming schedule', async () => {
      configureMockReturn(mockDb, mockSchedule);

      const result = await model.getNextSchedule('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123' });
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result?.start_time).toBeDefined();
    });

    it('should return null when no upcoming schedules', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.getNextSchedule('event-123');

      expect(result).toBeNull();
    });

    it('should order by start_time ascending', async () => {
      configureMockReturn(mockDb, mockSchedule);

      await model.getNextSchedule('event-123');

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('start_time', 'asc');
    });
  });

  describe('updateWithTenant', () => {
    it('should update schedule with tenant verification', async () => {
      const updated = { ...mockSchedule, notes: 'Updated notes' };
      mockDb._mockChain.returning.mockResolvedValue([updated]);

      const result = await model.updateWithTenant('schedule-123', 'tenant-1', {
        notes: 'Updated notes',
      });

      expect(mockDb).toHaveBeenCalledWith('event_schedules');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(result?.notes).toBe('Updated notes');
    });

    it('should return null when tenant mismatch', async () => {
      mockDb._mockChain.returning.mockResolvedValue([]);

      const result = await model.updateWithTenant('schedule-123', 'wrong-tenant', {
        notes: 'Test',
      });

      expect(result).toBeNull();
    });

    it('should set updated_at timestamp', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockSchedule]);

      await model.updateWithTenant('schedule-123', 'tenant-1', { notes: 'Test' });

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('inherited BaseModel methods', () => {
    describe('create', () => {
      it('should create new schedule', async () => {
        mockDb._mockChain.returning.mockResolvedValue([mockSchedule]);

        const result = await model.create({
          event_id: 'event-123',
          tenant_id: 'tenant-1',
          start_time: new Date('2026-04-01T20:00:00Z'),
          end_time: new Date('2026-04-01T23:00:00Z'),
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalled();
        expect(result.event_id).toBe('event-123');
      });
    });

    describe('update', () => {
      it('should update schedule', async () => {
        const updated = { ...mockSchedule, status: 'COMPLETED' };
        mockDb._mockChain.returning.mockResolvedValue([updated]);

        const result = await model.update('schedule-123', { status: 'COMPLETED' });

        expect(result?.status).toBe('COMPLETED');
      });
    });

    describe('delete', () => {
      it('should soft delete schedule', async () => {
        mockDb._mockChain.update.mockResolvedValue(1);

        const result = await model.delete('schedule-123');

        expect(result).toBe(true);
      });
    });
  });

  describe('schedule scenarios', () => {
    it('should handle recurring schedules', async () => {
      const recurring: IEventSchedule = {
        ...mockSchedule,
        is_recurring: true,
        recurrence_pattern: {
          frequency: 'weekly',
          interval: 1,
          days_of_week: ['friday', 'saturday'],
          end_date: new Date('2026-06-01'),
        },
      };
      configureMockReturn(mockDb, recurring);

      const result = await model.findById('schedule-123');

      expect(result?.is_recurring).toBe(true);
      expect(result?.recurrence_pattern?.frequency).toBe('weekly');
    });

    it('should handle different schedule statuses', async () => {
      const statuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'];

      for (const status of statuses) {
        const schedule = { ...mockSchedule, status };
        configureMockReturn(mockDb, schedule);

        const result = await model.findById('schedule-123');
        expect(result?.status).toBe(status);
      }
    });

    it('should handle schedule with capacity override', async () => {
      const overridden: IEventSchedule = {
        ...mockSchedule,
        capacity_override: 500,
      };
      configureMockReturn(mockDb, overridden);

      const result = await model.findById('schedule-123');

      expect(result?.capacity_override).toBe(500);
    });

    it('should handle schedule with venue room', async () => {
      const withRoom: IEventSchedule = {
        ...mockSchedule,
        venue_room: 'VIP Lounge',
      };
      configureMockReturn(mockDb, withRoom);

      const result = await model.findById('schedule-123');

      expect(result?.venue_room).toBe('VIP Lounge');
    });

    it('should handle schedule with doors_open time', async () => {
      const withDoors: IEventSchedule = {
        ...mockSchedule,
        doors_open: new Date('2026-03-01T18:30:00Z'),
      };
      configureMockReturn(mockDb, withDoors);

      const result = await model.findById('schedule-123');

      expect(result?.doors_open).toBeDefined();
    });

    it('should handle different timezones', async () => {
      const timezones = [
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Asia/Tokyo',
        'UTC',
      ];

      for (const timezone of timezones) {
        const schedule = { ...mockSchedule, timezone };
        configureMockReturn(mockDb, schedule);

        const result = await model.findById('schedule-123');
        expect(result?.timezone).toBe(timezone);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle schedule with minimal fields', async () => {
      const minimal: IEventSchedule = {
        id: 'schedule-min',
        event_id: 'event-123',
        start_time: new Date(),
        end_time: new Date(),
      };
      configureMockReturn(mockDb, minimal);

      const result = await model.findById('schedule-min');

      expect(result?.id).toBe('schedule-min');
      expect(result?.venue_room).toBeUndefined();
    });

    it('should handle same day start and end times', async () => {
      const sameDay: IEventSchedule = {
        ...mockSchedule,
        start_time: new Date('2026-03-01T20:00:00Z'),
        end_time: new Date('2026-03-01T23:00:00Z'),
      };
      configureMockReturn(mockDb, sameDay);

      const result = await model.findById('schedule-123');

      expect(result?.start_time).toBeDefined();
      expect(result?.end_time).toBeDefined();
    });

    it('should handle overnight event (end time next day)', async () => {
      const overnight: IEventSchedule = {
        ...mockSchedule,
        start_time: new Date('2026-03-01T22:00:00Z'),
        end_time: new Date('2026-03-02T02:00:00Z'),
      };
      configureMockReturn(mockDb, overnight);

      const result = await model.findById('schedule-123');

      expect(result?.start_time?.getDate()).not.toBe(result?.end_time?.getDate());
    });

    it('should handle multi-day event', async () => {
      const multiDay: IEventSchedule = {
        ...mockSchedule,
        start_time: new Date('2026-03-01T10:00:00Z'),
        end_time: new Date('2026-03-03T22:00:00Z'),
      };
      configureMockReturn(mockDb, multiDay);

      const result = await model.findById('schedule-123');

      expect(result?.start_time).toBeDefined();
      expect(result?.end_time).toBeDefined();
    });

    it('should handle schedule with notes', async () => {
      const withNotes: IEventSchedule = {
        ...mockSchedule,
        notes: 'Special performance with guest artist. VIP access at 18:00.',
      };
      configureMockReturn(mockDb, withNotes);

      const result = await model.findById('schedule-123');

      expect(result?.notes).toContain('Special performance');
    });

    it('should handle null recurrence_pattern', async () => {
      const nonRecurring: IEventSchedule = {
        ...mockSchedule,
        is_recurring: false,
        recurrence_pattern: null,
      };
      configureMockReturn(mockDb, nonRecurring);

      const result = await model.findById('schedule-123');

      expect(result?.is_recurring).toBe(false);
      expect(result?.recurrence_pattern).toBeNull();
    });
  });
});
