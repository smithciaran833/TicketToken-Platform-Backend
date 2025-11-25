// Mock dependencies BEFORE imports
const mockJoiChain = {
  required: jest.fn().mockReturnThis(),
  optional: jest.fn().mockReturnThis(),
  default: jest.fn().mockReturnThis(),
  valid: jest.fn().mockReturnThis(),
  integer: jest.fn().mockReturnThis(),
  min: jest.fn().mockReturnThis(),
};

const mockValidate = jest.fn();

jest.mock('joi', () => ({
  __esModule: true,
  default: {
    object: jest.fn(() => ({
      validate: mockValidate,
      optional: jest.fn().mockReturnThis(),
    })),
    date: jest.fn(() => mockJoiChain),
    string: jest.fn(() => mockJoiChain),
    boolean: jest.fn(() => mockJoiChain),
    number: jest.fn(() => mockJoiChain),
  },
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock EventScheduleModel
jest.mock('../../../src/models', () => ({
  EventScheduleModel: jest.fn(),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as scheduleController from '../../../src/controllers/schedule.controller';
import { EventScheduleModel } from '../../../src/models';

describe('Schedule Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockEventService: any;
  let mockDb: any;
  let mockScheduleModel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockValidate.mockReturnValue({ error: null, value: {} });

    mockScheduleModel = {
      findByEventId: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateWithTenant: jest.fn(),
      findUpcomingSchedules: jest.fn(),
      getNextSchedule: jest.fn(),
    };

    (EventScheduleModel as jest.MockedClass<typeof EventScheduleModel>).mockImplementation(() => mockScheduleModel);

    mockEventService = {
      getEvent: jest.fn(),
    };

    mockDb = jest.fn();

    mockRequest = {
      params: {},
      body: {},
      headers: {},
      log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any,
      container: {
        cradle: {
          db: mockDb,
          eventService: mockEventService,
        },
      } as any,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getSchedules', () => {
    it('should return schedules for event', async () => {
      const mockSchedules = [
        { id: '1', event_id: 'event-1', starts_at: new Date() },
        { id: '2', event_id: 'event-1', starts_at: new Date() },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.findByEventId.mockResolvedValue(mockSchedules);

      await scheduleController.getSchedules(
        mockRequest as any,
        mockReply as any
      );

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockScheduleModel.findByEventId).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          event_id: 'event-1',
          schedules: mockSchedules,
        },
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { eventId: 'event-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await scheduleController.getSchedules(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event not found',
      });
    });
  });

  describe('createSchedule', () => {
    it('should create schedule', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        event_id: 'event-1',
        starts_at: new Date(),
      };
      const requestBody = {
        starts_at: new Date(),
        ends_at: new Date(),
        timezone: 'UTC',
      };

      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = requestBody;
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({ error: null, value: requestBody });
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.create.mockResolvedValue(mockSchedule);

      await scheduleController.createSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockScheduleModel.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        event_id: 'event-1',
        ...requestBody,
      });
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockSchedule,
      });
    });

    it('should return 422 for validation errors', async () => {
      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = { starts_at: 'invalid' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockValidate.mockReturnValue({
        error: { details: [{ message: 'Invalid date' }] },
        value: null,
      });

      await scheduleController.createSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ message: 'Invalid date' }],
      });
    });
  });

  describe('getSchedule', () => {
    it('should return schedule by id', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        event_id: 'event-1',
        tenant_id: 'tenant-1',
        starts_at: new Date(),
      };

      mockRequest.params = { eventId: 'event-1', scheduleId: 'schedule-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.findById.mockResolvedValue(mockSchedule);

      await scheduleController.getSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockScheduleModel.findById).toHaveBeenCalledWith('schedule-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockSchedule,
      });
    });

    it('should return 404 if schedule not found', async () => {
      mockRequest.params = { eventId: 'event-1', scheduleId: 'schedule-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.findById.mockResolvedValue(null);

      await scheduleController.getSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Schedule not found',
      });
    });
  });

  describe('updateSchedule', () => {
    it('should update schedule', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        event_id: 'event-1',
        tenant_id: 'tenant-1',
      };
      const mockUpdated = { ...mockSchedule, status: 'CONFIRMED' };

      mockRequest.params = { eventId: 'event-1', scheduleId: 'schedule-1' };
      mockRequest.body = { status: 'CONFIRMED' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.findById.mockResolvedValue(mockSchedule);
      mockScheduleModel.updateWithTenant.mockResolvedValue(mockUpdated);

      await scheduleController.updateSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockScheduleModel.updateWithTenant).toHaveBeenCalledWith(
        'schedule-1',
        'tenant-1',
        { status: 'CONFIRMED' }
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockUpdated,
      });
    });
  });

  describe('getUpcomingSchedules', () => {
    it('should return upcoming schedules', async () => {
      const mockSchedules = [
        { id: '1', starts_at: new Date(Date.now() + 86400000) },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.findUpcomingSchedules.mockResolvedValue(mockSchedules);

      await scheduleController.getUpcomingSchedules(
        mockRequest as any,
        mockReply as any
      );

      expect(mockScheduleModel.findUpcomingSchedules).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          event_id: 'event-1',
          schedules: mockSchedules,
        },
      });
    });
  });

  describe('getNextSchedule', () => {
    it('should return next schedule', async () => {
      const mockSchedule = { id: '1', starts_at: new Date(Date.now() + 86400000) };

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.getNextSchedule.mockResolvedValue(mockSchedule);

      await scheduleController.getNextSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockScheduleModel.getNextSchedule).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockSchedule,
      });
    });

    it('should return 404 if no upcoming schedules', async () => {
      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue({ id: 'event-1' });
      mockScheduleModel.getNextSchedule.mockResolvedValue(null);

      await scheduleController.getNextSchedule(
        mockRequest as any,
        mockReply as any
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'No upcoming schedules found',
      });
    });
  });
});
