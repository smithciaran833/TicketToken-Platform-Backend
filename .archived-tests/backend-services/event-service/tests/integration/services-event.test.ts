/**
 * EventService Integration Tests
 * Tests: createEvent, getEvent, listEvents, updateEvent, deleteEvent, publishEvent, getVenueEvents
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, db, pool, redis } from './setup';
import { EventService } from '../../src/services/event.service';
import { VenueServiceClient } from '../../src/services/venue-service.client';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

// Mock VenueServiceClient since we can't hit real venue service
class MockVenueServiceClient {
  async validateVenueAccess(_venueId: string, _authToken: string): Promise<boolean> {
    return true;
  }
  async getVenue(_venueId: string, _authToken: string): Promise<any> {
    return { id: TEST_VENUE_ID, name: 'Test Venue', max_capacity: 1000, timezone: 'America/New_York' };
  }
}

describe('EventService', () => {
  let context: TestContext;
  let service: EventService;
  let mockVenueClient: MockVenueServiceClient;

  beforeAll(async () => {
    context = await setupTestApp();
    mockVenueClient = new MockVenueServiceClient();
    service = new EventService(db, mockVenueClient as unknown as VenueServiceClient, redis);
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  async function createEventDirect(overrides: any = {}) {
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, overrides.name || 'Test Event',
       `test-${eventId.slice(0, 8)}`, overrides.status || 'DRAFT', 'single',
       overrides.created_by || TEST_USER_ID]
    );
    return eventId;
  }

  describe('createEvent', () => {
    it('should create event with minimal data', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const result = await service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'New Concert',
        description: 'A great show',
        event_date: futureDate.toISOString()
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);

      expect(result.name).toBe('New Concert');
      expect(result.status).toBe('DRAFT');
      expect(result.venue_id).toBe(TEST_VENUE_ID);
    });

    it('should create event with capacity', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const result = await service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'Capacity Event',
        capacity: 500,
        event_date: futureDate.toISOString()
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);

      expect(result.capacity).toBe(500);
    });

    it('should reject invalid status', async () => {
      await expect(service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'Bad Status',
        status: 'INVALID_STATUS'
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID)).rejects.toThrow('Invalid status');
    });

    it('should create with valid status', async () => {
      const result = await service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'Published Event',
        status: 'PUBLISHED'
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);

      expect(result.status).toBe('PUBLISHED');
    });

    it('should detect duplicate event', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'Duplicate Test',
        event_date: futureDate.toISOString()
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);

      await expect(service.createEvent({
        venue_id: TEST_VENUE_ID,
        name: 'Duplicate Test',
        event_date: futureDate.toISOString()
      }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID)).rejects.toThrow('already exists');
    });
  });

  describe('getEvent', () => {
    it('should return event with relations', async () => {
      const eventId = await createEventDirect({ name: 'Get Test' });

      const result = await service.getEvent(eventId, TEST_TENANT_ID);
      expect(result.id).toBe(eventId);
      expect(result.name).toBe('Get Test');
    });

    it('should throw NotFoundError for non-existent', async () => {
      await expect(service.getEvent(uuidv4(), TEST_TENANT_ID))
        .rejects.toThrow('Event');
    });

    it('should throw for deleted event', async () => {
      const eventId = await createEventDirect();
      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [eventId]);

      await expect(service.getEvent(eventId, TEST_TENANT_ID))
        .rejects.toThrow('Event');
    });

    it('should respect tenant isolation', async () => {
      const eventId = await createEventDirect();
      const otherTenant = uuidv4();

      await expect(service.getEvent(eventId, otherTenant))
        .rejects.toThrow('Event');
    });
  });

  describe('listEvents', () => {
    it('should return paginated events', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });
      await createEventDirect({ name: 'Event 3' });

      const result = await service.listEvents(TEST_TENANT_ID, { limit: 2 });
      expect(result.events.length).toBe(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.limit).toBe(2);
    });

    it('should filter by status', async () => {
      await createEventDirect({ name: 'Draft', status: 'DRAFT' });
      await createEventDirect({ name: 'Published', status: 'PUBLISHED' });

      const result = await service.listEvents(TEST_TENANT_ID, { status: 'PUBLISHED' });
      expect(result.events.length).toBe(1);
      expect(result.events[0].name).toBe('Published');
    });

    it('should exclude deleted events', async () => {
      const eventId = await createEventDirect({ name: 'Deleted' });
      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [eventId]);
      await createEventDirect({ name: 'Active' });

      const result = await service.listEvents(TEST_TENANT_ID);
      expect(result.events.length).toBe(1);
      expect(result.events[0].name).toBe('Active');
    });

    it('should support offset pagination', async () => {
      await createEventDirect({ name: 'E1' });
      await createEventDirect({ name: 'E2' });
      await createEventDirect({ name: 'E3' });

      const page1 = await service.listEvents(TEST_TENANT_ID, { limit: 2, offset: 0 });
      const page2 = await service.listEvents(TEST_TENANT_ID, { limit: 2, offset: 2 });

      expect(page1.events.length).toBe(2);
      expect(page2.events.length).toBe(1);
    });
  });

  describe('updateEvent', () => {
    it('should update event fields', async () => {
      const eventId = await createEventDirect({ name: 'Original', created_by: TEST_USER_ID });

      const result = await service.updateEvent(eventId, { name: 'Updated' }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundError for non-existent', async () => {
      await expect(service.updateEvent(uuidv4(), { name: 'X' }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID))
        .rejects.toThrow('Event');
    });

    it('should throw ForbiddenError for non-creator', async () => {
      const otherUser = uuidv4();
      const eventId = await createEventDirect({ created_by: otherUser });

      await expect(service.updateEvent(eventId, { name: 'X' }, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID))
        .rejects.toThrow('permission');
    });
  });

  describe('deleteEvent', () => {
    it('should soft delete event', async () => {
      const eventId = await createEventDirect({ created_by: TEST_USER_ID });

      await service.deleteEvent(eventId, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID);

      const result = await pool.query('SELECT deleted_at, status FROM events WHERE id = $1', [eventId]);
      expect(result.rows[0].deleted_at).not.toBeNull();
      expect(result.rows[0].status).toBe('CANCELLED');
    });

    it('should throw NotFoundError for non-existent', async () => {
      await expect(service.deleteEvent(uuidv4(), 'Bearer token', TEST_USER_ID, TEST_TENANT_ID))
        .rejects.toThrow('Event');
    });

    it('should throw ForbiddenError for non-creator', async () => {
      const otherUser = uuidv4();
      const eventId = await createEventDirect({ created_by: otherUser });

      await expect(service.deleteEvent(eventId, 'Bearer token', TEST_USER_ID, TEST_TENANT_ID))
        .rejects.toThrow('permission');
    });
  });

  describe('publishEvent', () => {
    it('should change status to PUBLISHED', async () => {
      const eventId = await createEventDirect({ status: 'DRAFT' });

      const result = await service.publishEvent(eventId, TEST_USER_ID, TEST_TENANT_ID);
      expect(result.status).toBe('PUBLISHED');
    });

    it('should throw NotFoundError for non-existent', async () => {
      await expect(service.publishEvent(uuidv4(), TEST_USER_ID, TEST_TENANT_ID))
        .rejects.toThrow('Event');
    });
  });

  describe('getVenueEvents', () => {
    it('should return events for venue', async () => {
      await createEventDirect({ name: 'Venue Event 1' });
      await createEventDirect({ name: 'Venue Event 2' });

      const result = await service.getVenueEvents(TEST_VENUE_ID, TEST_TENANT_ID);
      expect(result.length).toBe(2);
    });

    it('should exclude deleted events', async () => {
      const eventId = await createEventDirect({ name: 'Deleted' });
      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [eventId]);
      await createEventDirect({ name: 'Active' });

      const result = await service.getVenueEvents(TEST_VENUE_ID, TEST_TENANT_ID);
      expect(result.length).toBe(1);
    });

    it('should return empty for venue with no events', async () => {
      const result = await service.getVenueEvents(uuidv4(), TEST_TENANT_ID);
      expect(result).toEqual([]);
    });
  });
});
