// Mock BEFORE any imports
const mockVenueServiceClient = {
  validateVenueAccess: jest.fn().mockResolvedValue(true),
  getVenue: jest.fn().mockResolvedValue({ id: 'venue-1', max_capacity: 1000 }),
};

jest.mock('../../../src/services/venue-service.client', () => ({
  VenueServiceClient: jest.fn().mockImplementation(() => mockVenueServiceClient),
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { EventService } from '../../../src/services/event.service';
import { NotFoundError } from '../../../src/types';

describe('Event Service', () => {
  let eventService: EventService;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    mockDb.transaction = jest.fn((callback) => callback(mockDb));

    // Reset mock implementations
    mockVenueServiceClient.validateVenueAccess.mockResolvedValue(true);
    mockVenueServiceClient.getVenue.mockResolvedValue({ id: 'venue-1', max_capacity: 1000 });

    // FIXED: Pass venueServiceClient to constructor
    eventService = new EventService(mockDb as any, mockVenueServiceClient as any);
  });

  describe('getEvent', () => {
    it('should get event by id', async () => {
      const mockEvent = {
        id: 'event-1',
        name: 'Test Event',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1'
      };

      mockQueryBuilder.first.mockResolvedValue(mockEvent);
      mockQueryBuilder.select.mockResolvedValue([]);

      const result = await eventService.getEvent('event-1', 'tenant-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('event-1');
    });

    it('should throw NotFoundError if not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        eventService.getEvent('event-999', 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listEvents', () => {
    it('should list all events for tenant', async () => {
      const mockEvents = [
        { id: '1', name: 'Event 1' },
        { id: '2', name: 'Event 2' },
      ];

      mockQueryBuilder.select.mockResolvedValue(mockEvents);
      mockQueryBuilder.first.mockResolvedValue({ count: '2' });

      const result = await eventService.listEvents('tenant-1');

      expect(result.events).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('createEvent', () => {
    it('should create event', async () => {
      const eventData = {
        name: 'New Event',
        venue_id: 'venue-1',
      };
      const mockCreated = { id: 'event-1', ...eventData, tenant_id: 'tenant-1' };

      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);
      mockQueryBuilder.select.mockResolvedValue([]);

      const result = await eventService.createEvent(eventData, 'auth-token', 'user-1', 'tenant-1');

      expect(mockVenueServiceClient.validateVenueAccess).toHaveBeenCalledWith('venue-1', 'auth-token');
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(result.id).toBe('event-1');
    });

    it('should throw error if no venue access', async () => {
      mockVenueServiceClient.validateVenueAccess.mockResolvedValue(false);

      await expect(
        eventService.createEvent({ venue_id: 'venue-1', name: 'Test' }, 'auth-token', 'user-1', 'tenant-1')
      ).rejects.toThrow();
    });
  });

  describe('updateEvent', () => {
    it('should update event', async () => {
      const existing = {
        id: 'event-1',
        name: 'Old Name',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        created_by: 'user-1'
      };
      const updated = { ...existing, name: 'New Name' };

      // Mock the first call (in updateEvent itself)
      mockQueryBuilder.first
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      
      mockQueryBuilder.returning.mockResolvedValue([updated]);
      mockQueryBuilder.select.mockResolvedValue([]);

      const result = await eventService.updateEvent('event-1', { name: 'New Name' }, 'auth-token', 'user-1', 'tenant-1');

      expect(mockVenueServiceClient.validateVenueAccess).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundError if event not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        eventService.updateEvent('event-999', { name: 'Test' }, 'auth-token', 'user-1', 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteEvent', () => {
    it('should soft delete event', async () => {
      const existing = {
        id: 'event-1',
        tenant_id: 'tenant-1',
        created_by: 'user-1',
        venue_id: 'venue-1'
      };

      mockQueryBuilder.first.mockResolvedValue(existing);
      mockQueryBuilder.update.mockResolvedValue(1);

      await eventService.deleteEvent('event-1', 'auth-token', 'user-1', 'tenant-1');

      expect(mockVenueServiceClient.validateVenueAccess).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalled();
    });
  });

  describe('publishEvent', () => {
    it('should publish event', async () => {
      const existing = {
        id: 'event-1',
        status: 'DRAFT',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        created_by: 'user-1',
        name: 'Test Event'
      };
      const published = { ...existing, status: 'PUBLISHED' };

      // FIXED: Mock all the database calls properly
      // First call in publishEvent to find the event
      // Second call in publishEvent after update
      // Third call in getEvent (called at the end of publishEvent)
      mockQueryBuilder.first
        .mockResolvedValueOnce(existing)   // publishEvent - find event
        .mockResolvedValueOnce(published); // getEvent - find event

      mockQueryBuilder.update.mockResolvedValue(1);
      mockQueryBuilder.select.mockResolvedValue([]); // For schedules and capacities in getEvent

      const result = await eventService.publishEvent('event-1', 'user-1', 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result.status).toBe('PUBLISHED');
    });
  });

  describe('getVenueEvents', () => {
    it('should get events for venue', async () => {
      const mockEvents = [{ id: '1', venue_id: 'venue-1' }];
      mockQueryBuilder.select.mockResolvedValue(mockEvents);

      const result = await eventService.getVenueEvents('venue-1', 'tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        tenant_id: 'tenant-1'
      });
      expect(result).toEqual(mockEvents);
    });
  });
});
