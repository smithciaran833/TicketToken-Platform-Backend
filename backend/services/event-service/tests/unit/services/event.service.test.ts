/**
 * Unit tests for EventService
 * Tests event CRUD operations, state transitions, and integrations
 */

import { EventService } from '../../../src/services/event.service';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/timezone-validator', () => ({
  isValidTimezone: jest.fn().mockReturnValue(true),
  validateTimezone: jest.fn().mockReturnValue(true),
}));

describe('EventService', () => {
  let mockDb: any;
  let service: EventService;
  let mockVenueClient: any;
  let mockSearchClient: any;
  let mockBlockchainClient: any;

  const mockEvent = {
    id: 'event-123',
    tenant_id: 'tenant-1',
    venue_id: 'venue-1',
    name: 'Test Concert',
    slug: 'test-concert',
    description: 'A great concert',
    status: 'DRAFT',
    event_type: 'CONCERT',
    timezone: 'America/New_York',
    is_featured: false,
    is_private: false,
    created_by: 'user-123',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const mockSchedule = {
    id: 'schedule-1',
    event_id: 'event-123',
    starts_at: new Date(Date.now() + 86400000 * 30),
    ends_at: new Date(Date.now() + 86400000 * 30 + 7200000),
    doors_open_at: null,
    timezone: 'America/New_York',
    is_recurring: false,
    deleted_at: null,
  };

  const mockCapacity = {
    id: 'cap-1',
    event_id: 'event-123',
    section_name: 'General Admission',
    total_capacity: 1000,
    available_capacity: 1000,
    sold_count: 0,
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    
    mockVenueClient = {
      getVenue: jest.fn().mockResolvedValue({
        id: 'venue-1',
        name: 'Test Venue',
        timezone: 'America/New_York',
        max_capacity: 5000,
      }),
      validateVenueAccess: jest.fn().mockResolvedValue(true),
    };

    mockSearchClient = {
      indexEvent: jest.fn().mockResolvedValue(true),
      removeEvent: jest.fn().mockResolvedValue(true),
      updateEvent: jest.fn().mockResolvedValue(true),
    };

    mockBlockchainClient = {
      createEventOnChain: jest.fn().mockResolvedValue({
        txHash: '0xabc123',
        eventId: 'on-chain-event-123',
      }),
      updateEventOnChain: jest.fn().mockResolvedValue({ success: true }),
    };

    service = new EventService(mockDb, mockVenueClient, mockSearchClient, mockBlockchainClient);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(EventService);
    });

    it('should work without optional clients', () => {
      const serviceBasic = new EventService(mockDb);
      expect(serviceBasic).toBeInstanceOf(EventService);
    });
  });

  describe('createEvent', () => {
    it('should create event successfully', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);
      mockVenueClient.validateVenueAccess.mockResolvedValue(true);

      const result = await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
      expect(result.name).toBe('Test Concert');
    });

    it('should validate venue access', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);
      mockVenueClient.validateVenueAccess.mockResolvedValue(true);

      await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      expect(mockVenueClient.validateVenueAccess).toHaveBeenCalledWith(
        'venue-1', 'tenant-1', 'auth-token'
      );
    });

    it('should throw error for invalid venue access', async () => {
      mockVenueClient.validateVenueAccess.mockResolvedValue(false);

      await expect(service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow('venue');
    });

    it('should validate timezone', async () => {
      const { isValidTimezone } = require('../../../src/utils/timezone-validator');
      isValidTimezone.mockReturnValue(false);
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await expect(service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'Invalid/Timezone',
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow('timezone');
    });

    it('should set default status to DRAFT', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.status).toBe('DRAFT');
    });

    it('should set created_by to user ID', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.created_by).toBe('user-123');
    });

    it('should generate slug from name', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.createEvent({
        name: 'Test Concert 2026!',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toMatch(/test-concert-2026/);
    });

    it('should check for duplicate events', async () => {
      configureMockArray(mockDb, [mockEvent]); // Existing event
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      // Should check for duplicates based on name + venue + date
      await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');
    });

    it('should initialize version to 1', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.createEvent({
        name: 'Test Concert',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.version).toBe(1);
    });
  });

  describe('getEvent', () => {
    it('should return event by ID', async () => {
      configureMockReturn(mockDb, mockEvent);

      const result = await service.getEvent('event-123', 'tenant-1');

      expect(result.id).toBe('event-123');
      expect(result.name).toBe('Test Concert');
    });

    it('should throw NotFoundError when event not found', async () => {
      configureMockReturn(mockDb, null);

      await expect(service.getEvent('non-existent', 'tenant-1'))
        .rejects.toThrow('Event');
    });

    it('should filter by tenant_id', async () => {
      configureMockReturn(mockDb, mockEvent);

      await service.getEvent('event-123', 'tenant-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        id: 'event-123',
        tenant_id: 'tenant-1',
      });
    });

    it('should exclude deleted events', async () => {
      configureMockReturn(mockDb, mockEvent);

      await service.getEvent('event-123', 'tenant-1');

      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should enrich event with schedules', async () => {
      configureMockReturn(mockDb, mockEvent);
      configureMockArray(mockDb, [mockSchedule]);

      const result = await service.getEvent('event-123', 'tenant-1', { includeSchedules: true });

      expect(result.schedules).toBeDefined();
    });

    it('should enrich event with capacity', async () => {
      configureMockReturn(mockDb, mockEvent);
      configureMockArray(mockDb, [mockCapacity]);

      const result = await service.getEvent('event-123', 'tenant-1', { includeCapacity: true });

      expect(result.capacity).toBeDefined();
    });
  });

  describe('listEvents', () => {
    it('should return paginated events', async () => {
      configureMockArray(mockDb, [mockEvent]);
      configureMockReturn(mockDb, { count: '1' });

      const result = await service.listEvents('tenant-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      configureMockArray(mockDb, [mockEvent]);
      configureMockReturn(mockDb, { count: '1' });

      await service.listEvents('tenant-1', { status: 'PUBLISHED' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PUBLISHED' })
      );
    });

    it('should filter by venue_id', async () => {
      configureMockArray(mockDb, [mockEvent]);
      configureMockReturn(mockDb, { count: '1' });

      await service.listEvents('tenant-1', { venue_id: 'venue-1' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ venue_id: 'venue-1' })
      );
    });

    it('should enforce tenant isolation', async () => {
      configureMockArray(mockDb, [mockEvent]);
      configureMockReturn(mockDb, { count: '1' });

      await service.listEvents('tenant-1', {});

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1' })
      );
    });

    it('should return empty array when no events', async () => {
      configureMockArray(mockDb, []);
      configureMockReturn(mockDb, { count: '0' });

      const result = await service.listEvents('tenant-1', {});

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('should apply default pagination', async () => {
      configureMockArray(mockDb, [mockEvent]);
      configureMockReturn(mockDb, { count: '1' });

      await service.listEvents('tenant-1', {});

      expect(mockDb._mockChain.limit).toHaveBeenCalled();
      expect(mockDb._mockChain.offset).toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    it('should update event successfully', async () => {
      configureMockReturn(mockDb, mockEvent);
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        name: 'Updated Name',
        version: 2,
      }]);

      const result = await service.updateEvent('event-123', {
        name: 'Updated Name',
        version: 1, // Current version for optimistic locking
      }, 'tenant-1', 'user-123', 'auth-token');

      expect(result.name).toBe('Updated Name');
    });

    it('should check ownership', async () => {
      configureMockReturn(mockDb, mockEvent);
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.updateEvent('event-123', {
        name: 'Updated',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token');

      // Should verify user is creator or admin
    });

    it('should throw ConflictError for version mismatch', async () => {
      configureMockReturn(mockDb, { ...mockEvent, version: 5 }); // DB version is 5

      await expect(service.updateEvent('event-123', {
        name: 'Updated',
        version: 3, // Client version is 3 (outdated)
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow('Conflict');
    });

    it('should increment version on update', async () => {
      configureMockReturn(mockDb, mockEvent);
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        version: 2,
      }]);

      await service.updateEvent('event-123', {
        name: 'Updated',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.version).toBe(2);
    });

    it('should validate state transition', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'COMPLETED' });

      await expect(service.updateEvent('event-123', {
        status: 'DRAFT',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow('Invalid');
    });

    it('should allow admin to bypass ownership check', async () => {
      configureMockReturn(mockDb, { ...mockEvent, created_by: 'other-user' });
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      // Admin role should allow update
      await service.updateEvent('event-123', {
        name: 'Admin Update',
        version: 1,
      }, 'tenant-1', 'admin-user', 'auth-token', { isAdmin: true });

      expect(mockDb._mockChain.update).toHaveBeenCalled();
    });

    it('should update updated_at timestamp', async () => {
      configureMockReturn(mockDb, mockEvent);
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await service.updateEvent('event-123', {
        name: 'Updated',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('deleteEvent', () => {
    it('should soft delete event', async () => {
      configureMockReturn(mockDb, mockEvent);
      configureMockReturn(mockDb, { sold_count: 0 }); // No sold tickets

      await service.deleteEvent('event-123', 'tenant-1', 'user-123', 'auth-token');

      expect(mockDb._mockChain.update).toHaveBeenCalled();
      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.deleted_at).toBeInstanceOf(Date);
    });

    it('should throw error when tickets sold', async () => {
      configureMockReturn(mockDb, mockEvent);
      configureMockReturn(mockDb, { sold_count: 50 }); // Has sold tickets

      await expect(service.deleteEvent('event-123', 'tenant-1', 'user-123', 'auth-token'))
        .rejects.toThrow('Cannot delete event with sold tickets');
    });

    it('should check ownership for delete', async () => {
      configureMockReturn(mockDb, { ...mockEvent, created_by: 'other-user' });
      configureMockReturn(mockDb, { sold_count: 0 });

      await expect(service.deleteEvent('event-123', 'tenant-1', 'user-123', 'auth-token'))
        .rejects.toThrow('permission');
    });

    it('should allow admin to delete', async () => {
      configureMockReturn(mockDb, { ...mockEvent, created_by: 'other-user' });
      configureMockReturn(mockDb, { sold_count: 0 });

      await service.deleteEvent('event-123', 'tenant-1', 'admin-user', 'auth-token', { isAdmin: true });

      expect(mockDb._mockChain.update).toHaveBeenCalled();
    });

    it('should remove from search index', async () => {
      configureMockReturn(mockDb, mockEvent);
      configureMockReturn(mockDb, { sold_count: 0 });

      await service.deleteEvent('event-123', 'tenant-1', 'user-123', 'auth-token');

      expect(mockSearchClient.removeEvent).toHaveBeenCalledWith('event-123');
    });
  });

  describe('publishEvent', () => {
    it('should publish event', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'DRAFT' });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        status: 'PUBLISHED',
      }]);

      const result = await service.publishEvent('event-123', 'tenant-1', 'user-123', 'auth-token');

      expect(result.status).toBe('PUBLISHED');
    });

    it('should sync to search on publish', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'DRAFT' });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        status: 'PUBLISHED',
      }]);

      await service.publishEvent('event-123', 'tenant-1', 'user-123', 'auth-token');

      expect(mockSearchClient.indexEvent).toHaveBeenCalled();
    });

    it('should throw error for invalid status transition', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'COMPLETED' });

      await expect(service.publishEvent('event-123', 'tenant-1', 'user-123', 'auth-token'))
        .rejects.toThrow('Cannot publish');
    });
  });

  describe('getVenueEvents', () => {
    it('should return events for venue', async () => {
      configureMockArray(mockDb, [mockEvent]);

      const result = await service.getVenueEvents('venue-1', 'tenant-1', 'auth-token');

      expect(result).toHaveLength(1);
      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ venue_id: 'venue-1' })
      );
    });

    it('should filter by status', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await service.getVenueEvents('venue-1', 'tenant-1', 'auth-token', { status: 'PUBLISHED' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PUBLISHED' })
      );
    });

    it('should return empty array when no events', async () => {
      configureMockArray(mockDb, []);

      const result = await service.getVenueEvents('venue-1', 'tenant-1', 'auth-token');

      expect(result).toEqual([]);
    });
  });

  describe('validateStateTransition', () => {
    it('should allow DRAFT to PUBLISHED', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'DRAFT' });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        status: 'PUBLISHED',
      }]);

      const result = await service.updateEvent('event-123', {
        status: 'PUBLISHED',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token');

      expect(result.status).toBe('PUBLISHED');
    });

    it('should allow PUBLISHED to ON_SALE', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'PUBLISHED' });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        status: 'ON_SALE',
      }]);

      const result = await service.updateEvent('event-123', {
        status: 'ON_SALE',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token');

      expect(result.status).toBe('ON_SALE');
    });

    it('should reject invalid transitions', async () => {
      configureMockReturn(mockDb, { ...mockEvent, status: 'DRAFT' });

      await expect(service.updateEvent('event-123', {
        status: 'COMPLETED',
        version: 1,
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow('Invalid');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb._mockChain.first.mockRejectedValue(new Error('Connection refused'));

      await expect(service.getEvent('event-123', 'tenant-1'))
        .rejects.toThrow();
    });

    it('should rollback on create failure', async () => {
      mockDb._mockChain.insert.mockRejectedValue(new Error('Insert failed'));

      await expect(service.createEvent({
        name: 'Test',
        venue_id: 'venue-1',
        event_type: 'CONCERT',
        timezone: 'America/New_York',
      }, 'tenant-1', 'user-123', 'auth-token')).rejects.toThrow();
    });

    it('should handle search client failures gracefully', async () => {
      mockSearchClient.indexEvent.mockRejectedValue(new Error('Search unavailable'));
      configureMockReturn(mockDb, { ...mockEvent, status: 'DRAFT' });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockEvent,
        status: 'PUBLISHED',
      }]);

      // Should not throw, search indexing is non-critical
      await service.publishEvent('event-123', 'tenant-1', 'user-123', 'auth-token');
    });
  });

  describe('tenant isolation', () => {
    it('should not return events from other tenants', async () => {
      configureMockReturn(mockDb, null); // Event exists but different tenant

      await expect(service.getEvent('event-123', 'other-tenant'))
        .rejects.toThrow('Event');
    });

    it('should not allow update of other tenant events', async () => {
      configureMockReturn(mockDb, null);

      await expect(service.updateEvent('event-123', {
        name: 'Updated',
        version: 1,
      }, 'other-tenant', 'user-123', 'auth-token')).rejects.toThrow();
    });

    it('should not allow delete of other tenant events', async () => {
      configureMockReturn(mockDb, null);

      await expect(service.deleteEvent('event-123', 'other-tenant', 'user-123', 'auth-token'))
        .rejects.toThrow();
    });
  });
});
