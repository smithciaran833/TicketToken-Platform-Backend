/**
 * Schedule Controller Unit Tests
 * 
 * Tests the schedule controller handlers for:
 * - getSchedules: Get all schedules for an event
 * - createSchedule: Create new schedule
 * - getSchedule: Get specific schedule
 * - updateSchedule: Update schedule
 * - getUpcomingSchedules: Get future schedules
 * - getNextSchedule: Get next upcoming schedule
 */

import {
  getSchedules,
  createSchedule,
  getSchedule,
  updateSchedule,
  getUpcomingSchedules,
  getNextSchedule
} from '../../../src/controllers/schedule.controller';

// Mock dependencies
jest.mock('../../../src/models', () => ({
  EventScheduleModel: jest.fn().mockImplementation(() => ({
    findByEventId: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    updateWithTenant: jest.fn(),
    findUpcomingSchedules: jest.fn(),
    getNextSchedule: jest.fn()
  }))
}));

import { EventScheduleModel } from '../../../src/models';

describe('Schedule Controller', () => {
  let mockScheduleModel: any;
  let mockEventService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockScheduleModel = {
      findByEventId: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateWithTenant: jest.fn(),
      findUpcomingSchedules: jest.fn(),
      getNextSchedule: jest.fn()
    };

    mockEventService = {
      getEvent: jest.fn().mockResolvedValue({ id: 'event-123' })
    };

    (EventScheduleModel as jest.Mock).mockImplementation(() => mockScheduleModel);

    mockRequest = {
      params: { eventId: 'event-123' },
      body: {},
      container: {
        cradle: {
          db: {},
          eventService: mockEventService
        }
      },
      log: { error: jest.fn() }
    };
    (mockRequest as any).tenantId = 'tenant-123';

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getSchedules', () => {
    it('should return schedules for an event', async () => {
      const schedules = [
        { id: 'sched-1', starts_at: new Date('2026-06-15T20:00:00Z') },
        { id: 'sched-2', starts_at: new Date('2026-06-16T20:00:00Z') }
      ];
      mockScheduleModel.findByEventId.mockResolvedValue(schedules);

      await getSchedules(mockRequest, mockReply);

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockScheduleModel.findByEventId).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { event_id: 'event-123', schedules }
      });
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await getSchedules(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event not found'
      });
    });
  });

  describe('createSchedule', () => {
    const validScheduleData = {
      starts_at: new Date('2026-06-15T20:00:00Z'),
      ends_at: new Date('2026-06-15T23:00:00Z'),
      timezone: 'America/New_York'
    };

    it('should create schedule successfully', async () => {
      const createdSchedule = { id: 'sched-123', ...validScheduleData };
      mockScheduleModel.create.mockResolvedValue(createdSchedule);
      mockRequest.body = validScheduleData;

      await createSchedule(mockRequest, mockReply);

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockScheduleModel.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-123',
        event_id: 'event-123',
        ...validScheduleData
      });
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: createdSchedule
      });
    });

    it('should return 422 on validation error', async () => {
      mockRequest.body = { starts_at: 'invalid-date' };

      await createSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Validation failed'
      }));
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));
      mockRequest.body = validScheduleData;

      await createSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getSchedule', () => {
    it('should return schedule when found', async () => {
      const schedule = {
        id: 'sched-123',
        event_id: 'event-123',
        tenant_id: 'tenant-123',
        starts_at: new Date()
      };
      mockScheduleModel.findById.mockResolvedValue(schedule);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'sched-123' };

      await getSchedule(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: schedule
      });
    });

    it('should return 404 when schedule not found', async () => {
      mockScheduleModel.findById.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'nonexistent' };

      await getSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Schedule not found'
      });
    });

    it('should return 404 when schedule belongs to different event', async () => {
      const schedule = {
        id: 'sched-123',
        event_id: 'other-event',
        tenant_id: 'tenant-123'
      };
      mockScheduleModel.findById.mockResolvedValue(schedule);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'sched-123' };

      await getSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 when schedule belongs to different tenant', async () => {
      const schedule = {
        id: 'sched-123',
        event_id: 'event-123',
        tenant_id: 'other-tenant'
      };
      mockScheduleModel.findById.mockResolvedValue(schedule);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'sched-123' };

      await getSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateSchedule', () => {
    it('should update schedule successfully', async () => {
      const schedule = {
        id: 'sched-123',
        event_id: 'event-123',
        tenant_id: 'tenant-123'
      };
      const updatedSchedule = { ...schedule, status: 'CONFIRMED' };
      mockScheduleModel.findById.mockResolvedValue(schedule);
      mockScheduleModel.updateWithTenant.mockResolvedValue(updatedSchedule);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'sched-123' };
      mockRequest.body = { status: 'CONFIRMED' };

      await updateSchedule(mockRequest, mockReply);

      expect(mockScheduleModel.updateWithTenant).toHaveBeenCalledWith(
        'sched-123',
        'tenant-123',
        { status: 'CONFIRMED' }
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: updatedSchedule
      });
    });

    it('should return 404 when schedule not found', async () => {
      mockScheduleModel.findById.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', scheduleId: 'nonexistent' };
      mockRequest.body = { status: 'CONFIRMED' };

      await updateSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getUpcomingSchedules', () => {
    it('should return upcoming schedules', async () => {
      const schedules = [
        { id: 'sched-1', starts_at: new Date('2026-06-15T20:00:00Z') }
      ];
      mockScheduleModel.findUpcomingSchedules.mockResolvedValue(schedules);

      await getUpcomingSchedules(mockRequest, mockReply);

      expect(mockScheduleModel.findUpcomingSchedules).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { event_id: 'event-123', schedules }
      });
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await getUpcomingSchedules(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getNextSchedule', () => {
    it('should return next schedule', async () => {
      const schedule = { id: 'sched-1', starts_at: new Date('2026-06-15T20:00:00Z') };
      mockScheduleModel.getNextSchedule.mockResolvedValue(schedule);

      await getNextSchedule(mockRequest, mockReply);

      expect(mockScheduleModel.getNextSchedule).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: schedule
      });
    });

    it('should return 404 when no upcoming schedules', async () => {
      mockScheduleModel.getNextSchedule.mockResolvedValue(null);

      await getNextSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'No upcoming schedules found'
      });
    });

    it('should return 404 when event not found', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await getNextSchedule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});
