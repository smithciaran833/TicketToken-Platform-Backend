// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  createRedisConnection: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

jest.mock('../../../src/services/venue-service.client', () => ({
  VenueServiceClient: jest.fn().mockImplementation(() => ({
    getVenue: jest.fn(),
    validateVenueAccess: jest.fn(),
  })),
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as eventsController from '../../../src/controllers/events.controller';
import { EventService } from '../../../src/services/event.service';

// Mock EventService
jest.mock('../../../src/services/event.service');

describe('Events Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockEventService: jest.Mocked<EventService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      body: {},
      query: {},
      headers: {},
      ip: '127.0.0.1',
      log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Mock EventService instance
    mockEventService = {
      createEvent: jest.fn(),
      getEvent: jest.fn(),
      listEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      publishEvent: jest.fn(),
      getVenueEvents: jest.fn(),
    } as any;

    (EventService as jest.MockedClass<typeof EventService>).mockImplementation(() => mockEventService);
  });

  describe('createEvent', () => {
    it('should create event successfully', async () => {
      const mockEvent = { id: 'event-1', name: 'Test Event' };
      const requestBody = { name: 'Test Event', venue_id: 'venue-1' };

      mockRequest.body = requestBody;
      mockRequest.headers = { authorization: 'Bearer token' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.createEvent.mockResolvedValue(mockEvent as any);

      await eventsController.createEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        requestBody,
        'Bearer token',
        'user-1',
        'tenant-1',
        expect.objectContaining({ ip: '127.0.0.1' })
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ event: mockEvent });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.body = { name: 'Test', venue_id: 'venue-1' };
      (mockRequest as any).user = null;
      (mockRequest as any).tenantId = 'tenant-1';

      await eventsController.createEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 400 if tenant ID missing', async () => {
      mockRequest.body = { name: 'Test', venue_id: 'venue-1' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = null;

      await eventsController.createEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Tenant ID required' });
    });

    it('should handle validation errors', async () => {
      const validationError: any = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.details = [{ field: 'name', message: 'Required' }];

      mockRequest.body = { venue_id: 'venue-1' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.createEvent.mockRejectedValue(validationError);

      await eventsController.createEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should handle forbidden errors', async () => {
      const forbiddenError: any = new Error('No access to venue');
      forbiddenError.name = 'ForbiddenError';

      mockRequest.body = { name: 'Test', venue_id: 'venue-1' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.createEvent.mockRejectedValue(forbiddenError);

      await eventsController.createEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getEvent', () => {
    it('should return event by id', async () => {
      const mockEvent = { id: 'event-1', name: 'Test Event' };

      mockRequest.params = { id: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockResolvedValue(mockEvent as any);

      await eventsController.getEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ event: mockEvent });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getEvent.mockRejectedValue(new Error('Event not found'));

      await eventsController.getEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Event not found' });
    });
  });

  describe('listEvents', () => {
    it('should list events with default pagination', async () => {
      const mockResult = {
        events: [{ id: '1', name: 'Event 1' }],
        pagination: { limit: 20, offset: 0, total: 1 },
      };

      mockRequest.query = {};
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.listEvents.mockResolvedValue(mockResult as any);

      await eventsController.listEvents(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.listEvents).toHaveBeenCalledWith('tenant-1', {
        status: undefined,
        limit: 20,
        offset: 0,
      });
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should list events with custom pagination', async () => {
      const mockResult = {
        events: [],
        pagination: { limit: 10, offset: 20, total: 0 },
      };

      mockRequest.query = { status: 'PUBLISHED', limit: 10, offset: 20 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.listEvents.mockResolvedValue(mockResult as any);

      await eventsController.listEvents(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.listEvents).toHaveBeenCalledWith('tenant-1', {
        status: 'PUBLISHED',
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('updateEvent', () => {
    it('should update event', async () => {
      const mockEvent = { id: 'event-1', name: 'Updated Event' };

      mockRequest.params = { id: 'event-1' };
      mockRequest.body = { name: 'Updated Event' };
      mockRequest.headers = { authorization: 'Bearer token' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.updateEvent.mockResolvedValue(mockEvent as any);

      await eventsController.updateEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.updateEvent).toHaveBeenCalledWith(
        'event-1',
        { name: 'Updated Event' },
        'Bearer token',
        'user-1',
        'tenant-1',
        expect.any(Object)
      );
      expect(mockReply.send).toHaveBeenCalledWith({ event: mockEvent });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999' };
      mockRequest.body = { name: 'Updated' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.updateEvent.mockRejectedValue(new Error('Event not found'));

      await eventsController.updateEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 for forbidden access', async () => {
      const forbiddenError: any = new Error('No access');
      forbiddenError.name = 'ForbiddenError';

      mockRequest.params = { id: 'event-1' };
      mockRequest.body = { name: 'Updated' };
      (mockRequest as any).user = { id: 'user-2' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.updateEvent.mockRejectedValue(forbiddenError);

      await eventsController.updateEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('deleteEvent', () => {
    it('should delete event', async () => {
      mockRequest.params = { id: 'event-1' };
      mockRequest.headers = { authorization: 'Bearer token' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.deleteEvent.mockResolvedValue(undefined);

      await eventsController.deleteEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.deleteEvent).toHaveBeenCalledWith(
        'event-1',
        'Bearer token',
        'user-1',
        'tenant-1',
        expect.any(Object)
      );
      expect(mockReply.status).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { id: 'event-999' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.deleteEvent.mockRejectedValue(new Error('Event not found'));

      await eventsController.deleteEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('publishEvent', () => {
    it('should publish event', async () => {
      const mockEvent = { id: 'event-1', status: 'PUBLISHED' };

      mockRequest.params = { id: 'event-1' };
      (mockRequest as any).user = { id: 'user-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.publishEvent.mockResolvedValue(mockEvent as any);

      await eventsController.publishEvent(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.publishEvent).toHaveBeenCalledWith('event-1', 'user-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ event: mockEvent });
    });
  });

  describe('getVenueEvents', () => {
    it('should return events for venue', async () => {
      const mockEvents = [{ id: '1', venue_id: 'venue-1' }];

      mockRequest.params = { venueId: 'venue-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockEventService.getVenueEvents.mockResolvedValue(mockEvents as any);

      await eventsController.getVenueEvents(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockEventService.getVenueEvents).toHaveBeenCalledWith('venue-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ events: mockEvents });
    });
  });
});
