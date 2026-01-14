/**
 * Events Controller Unit Tests
 * 
 * Tests the events controller handlers for:
 * - createEvent: Event creation with authentication
 * - getEvent: Event retrieval with tenant isolation
 * - listEvents: Event listing with pagination
 * - updateEvent: Event updates with ownership
 * - deleteEvent: Event deletion
 * - publishEvent: Event publishing
 * - getVenueEvents: Events filtered by venue
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent,
  publishEvent,
  getVenueEvents
} from '../../../src/controllers/events.controller';

// Mock the error handler
jest.mock('../../../src/middleware/error-handler', () => ({
  createProblemError: jest.fn((status: number, code: string, detail: string) => {
    const error = new Error(detail) as any;
    error.statusCode = status;
    error.code = code;
    return error;
  })
}));

describe('Events Controller', () => {
  // Mock services and dependencies
  let mockEventService: any;
  let mockContainer: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock event service
    mockEventService = {
      createEvent: jest.fn(),
      getEvent: jest.fn(),
      listEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      publishEvent: jest.fn(),
      getVenueEvents: jest.fn()
    };

    // Setup mock container
    mockContainer = {
      resolve: jest.fn((name: string) => {
        if (name === 'eventService') return mockEventService;
        return null;
      })
    };

    // Setup mock request
    mockRequest = {
      params: {},
      body: {},
      query: {},
      headers: {
        authorization: 'Bearer test-token',
        'user-agent': 'test-agent'
      },
      ip: '127.0.0.1'
    };
    (mockRequest as any).user = { id: 'user-123' };
    (mockRequest as any).tenantId = 'tenant-123';
    (mockRequest as any).container = mockContainer;

    // Setup mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('createEvent', () => {
    const validEventData = {
      name: 'Test Concert',
      description: 'A great event',
      venue_id: 'venue-123',
      starts_at: '2026-06-15T20:00:00Z',
      ends_at: '2026-06-15T23:00:00Z',
      timezone: 'America/New_York'
    };

    it('should create an event successfully', async () => {
      const createdEvent = { id: 'event-123', ...validEventData };
      mockEventService.createEvent.mockResolvedValue(createdEvent);
      mockRequest.body = validEventData;

      await createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        validEventData,
        'Bearer test-token',
        'user-123',
        'tenant-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' }
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ event: createdEvent });
    });

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      (mockRequest as any).user = null;
      mockRequest.body = validEventData;

      await expect(
        createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Authentication required');
    });

    it('should throw TENANT_REQUIRED when tenant ID is missing', async () => {
      (mockRequest as any).tenantId = null;
      mockRequest.body = validEventData;

      await expect(
        createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Tenant ID required');
    });

    it('should create event with tiers', async () => {
      const eventWithTiers = {
        ...validEventData,
        tiers: [
          { name: 'VIP', price_cents: 10000, currency: 'USD', total_qty: 100 },
          { name: 'GA', price_cents: 5000, currency: 'USD', total_qty: 500 }
        ]
      };
      const createdEvent = { id: 'event-123', ...eventWithTiers };
      mockEventService.createEvent.mockResolvedValue(createdEvent);
      mockRequest.body = eventWithTiers;

      await createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        eventWithTiers,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
    });

    it('should propagate service errors', async () => {
      mockEventService.createEvent.mockRejectedValue(new Error('Venue not found'));
      mockRequest.body = validEventData;

      await expect(
        createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Venue not found');
    });
  });

  describe('getEvent', () => {
    it('should return event when found', async () => {
      const event = { id: 'event-123', name: 'Test Event' };
      mockEventService.getEvent.mockResolvedValue(event);
      (mockRequest.params as any) = { id: 'event-123' };

      await getEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.getEvent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ event });
    });

    it('should throw NOT_FOUND when event does not exist', async () => {
      mockEventService.getEvent.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };

      await expect(
        getEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Event not found');
    });

    it('should handle service errors', async () => {
      mockEventService.getEvent.mockRejectedValue(new Error('Database error'));
      (mockRequest.params as any) = { id: 'event-123' };

      await expect(
        getEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('listEvents', () => {
    it('should list events with default pagination', async () => {
      const result = {
        events: [{ id: 'event-1' }, { id: 'event-2' }],
        total: 2,
        limit: 20,
        offset: 0
      };
      mockEventService.listEvents.mockResolvedValue(result);
      (mockRequest.query as any) = {};

      await listEvents(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.listEvents).toHaveBeenCalledWith(
        'tenant-123',
        { status: undefined, limit: 20, offset: 0 }
      );
      expect(mockReply.send).toHaveBeenCalledWith(result);
    });

    it('should list events with custom pagination', async () => {
      const result = {
        events: [{ id: 'event-1' }],
        total: 50,
        limit: 10,
        offset: 20
      };
      mockEventService.listEvents.mockResolvedValue(result);
      (mockRequest.query as any) = { limit: 10, offset: 20 };

      await listEvents(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.listEvents).toHaveBeenCalledWith(
        'tenant-123',
        { status: undefined, limit: 10, offset: 20 }
      );
    });

    it('should filter by status', async () => {
      const result = { events: [], total: 0, limit: 20, offset: 0 };
      mockEventService.listEvents.mockResolvedValue(result);
      (mockRequest.query as any) = { status: 'PUBLISHED' };

      await listEvents(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.listEvents).toHaveBeenCalledWith(
        'tenant-123',
        { status: 'PUBLISHED', limit: 20, offset: 0 }
      );
    });
  });

  describe('updateEvent', () => {
    const updateData = { name: 'Updated Event Name' };

    it('should update event successfully', async () => {
      const updatedEvent = { id: 'event-123', name: 'Updated Event Name' };
      mockEventService.updateEvent.mockResolvedValue(updatedEvent);
      (mockRequest.params as any) = { id: 'event-123' };
      mockRequest.body = updateData;

      await updateEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.updateEvent).toHaveBeenCalledWith(
        'event-123',
        updateData,
        'Bearer test-token',
        'user-123',
        'tenant-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' }
      );
      expect(mockReply.send).toHaveBeenCalledWith({ event: updatedEvent });
    });

    it('should throw NOT_FOUND when event does not exist', async () => {
      mockEventService.updateEvent.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };
      mockRequest.body = updateData;

      await expect(
        updateEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Event not found');
    });

    it('should propagate conflict errors', async () => {
      const conflictError = new Error('Version conflict');
      (conflictError as any).code = 'CONFLICT';
      mockEventService.updateEvent.mockRejectedValue(conflictError);
      (mockRequest.params as any) = { id: 'event-123' };
      mockRequest.body = updateData;

      await expect(
        updateEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Version conflict');
    });
  });

  describe('deleteEvent', () => {
    it('should delete event successfully', async () => {
      mockEventService.deleteEvent.mockResolvedValue(undefined);
      (mockRequest.params as any) = { id: 'event-123' };

      await deleteEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.deleteEvent).toHaveBeenCalledWith(
        'event-123',
        'Bearer test-token',
        'user-123',
        'tenant-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' }
      );
      expect(mockReply.status).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should propagate errors when deletion fails', async () => {
      mockEventService.deleteEvent.mockRejectedValue(new Error('Cannot delete event with sold tickets'));
      (mockRequest.params as any) = { id: 'event-123' };

      await expect(
        deleteEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Cannot delete event with sold tickets');
    });
  });

  describe('publishEvent', () => {
    it('should publish event successfully', async () => {
      const publishedEvent = { id: 'event-123', status: 'PUBLISHED' };
      mockEventService.publishEvent.mockResolvedValue(publishedEvent);
      (mockRequest.params as any) = { id: 'event-123' };

      await publishEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.publishEvent).toHaveBeenCalledWith(
        'event-123',
        'user-123',
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ event: publishedEvent });
    });

    it('should throw NOT_FOUND when event does not exist', async () => {
      mockEventService.publishEvent.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };

      await expect(
        publishEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Event not found');
    });

    it('should propagate state transition errors', async () => {
      mockEventService.publishEvent.mockRejectedValue(new Error('Cannot publish from CANCELLED state'));
      (mockRequest.params as any) = { id: 'event-123' };

      await expect(
        publishEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Cannot publish from CANCELLED state');
    });
  });

  describe('getVenueEvents', () => {
    it('should return events for venue', async () => {
      const events = [
        { id: 'event-1', venue_id: 'venue-123' },
        { id: 'event-2', venue_id: 'venue-123' }
      ];
      mockEventService.getVenueEvents.mockResolvedValue(events);
      (mockRequest.params as any) = { venueId: 'venue-123' };

      await getVenueEvents(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.getVenueEvents).toHaveBeenCalledWith('venue-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ events });
    });

    it('should return empty array when venue has no events', async () => {
      mockEventService.getVenueEvents.mockResolvedValue([]);
      (mockRequest.params as any) = { venueId: 'venue-123' };

      await getVenueEvents(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ events: [] });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing authorization header gracefully', async () => {
      mockRequest.headers = {};
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.body = { name: 'Test Event' };
      const createdEvent = { id: 'event-123' };
      mockEventService.createEvent.mockResolvedValue(createdEvent);

      await createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        'user-123',
        'tenant-123',
        expect.any(Object)
      );
    });

    it('should handle missing user-agent header', async () => {
      mockRequest.headers = { authorization: 'Bearer test-token' };
      mockRequest.body = { name: 'Test Event' };
      const createdEvent = { id: 'event-123' };
      mockEventService.createEvent.mockResolvedValue(createdEvent);

      await createEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.any(Object),
        'Bearer test-token',
        'user-123',
        'tenant-123',
        { ip: '127.0.0.1', userAgent: undefined }
      );
    });

    it('should resolve eventService from container on each request', async () => {
      mockEventService.getEvent.mockResolvedValue({ id: 'event-123' });
      (mockRequest.params as any) = { id: 'event-123' };

      await getEvent(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockContainer.resolve).toHaveBeenCalledWith('eventService');
    });
  });
});
