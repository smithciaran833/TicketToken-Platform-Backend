/**
 * Events Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as eventsController from '../../src/controllers/events.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Events Controller', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      params: overrides.params || {},
      query: overrides.query || {},
      body: overrides.body || {},
      headers: overrides.headers || { authorization: `Bearer ${generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' })}` },
      user: overrides.user !== undefined ? overrides.user : { id: TEST_USER_ID },
      tenantId: overrides.tenantId !== undefined ? overrides.tenantId : TEST_TENANT_ID,
      container: (context.app as any).container,
      ip: '127.0.0.1',
      log: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
    };
  }

  function createMockReply(): any {
    const reply: any = {
      statusCode: 200,
      sentData: null,
      status: jest.fn((code: number) => { reply.statusCode = code; return reply; }),
      send: jest.fn((data: any) => { reply.sentData = data; return reply; }),
    };
    return reply;
  }

  async function createEventDirect(overrides: any = {}) {
    const eventId = overrides.id || uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, TEST_VENUE_ID, overrides.name || 'Test Event', `test-${eventId.slice(0, 8)}`, overrides.status || 'DRAFT', 'single', TEST_USER_ID]
    );
    return { id: eventId };
  }

  describe('getEvent', () => {
    it('should return event when found', async () => {
      const event = await createEventDirect({ name: 'My Event' });
      const request = createMockRequest({ params: { id: event.id } });
      const reply = createMockReply();

      await eventsController.getEvent(request, reply);

      expect(reply.sentData.event).toBeDefined();
      expect(reply.sentData.event.id).toBe(event.id);
    });

    it('should return 404 when event not found', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await eventsController.getEvent(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('listEvents', () => {
    it('should return events for tenant', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });

      const request = createMockRequest({ query: {} });
      const reply = createMockReply();

      await eventsController.listEvents(request, reply);

      expect(reply.statusCode).toBe(200);
    });
  });

  describe('getVenueEvents', () => {
    it('should return events for venue', async () => {
      await createEventDirect({ name: 'Venue Event 1' });
      await createEventDirect({ name: 'Venue Event 2' });

      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await eventsController.getVenueEvents(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.sentData.events.length).toBe(2);
    });
  });

  describe('createEvent', () => {
    it('should require userId', async () => {
      const request = createMockRequest({ body: { name: 'New Event', venue_id: TEST_VENUE_ID }, user: null });
      const reply = createMockReply();

      await eventsController.createEvent(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should require tenantId', async () => {
      const request = createMockRequest({ body: { name: 'New Event', venue_id: TEST_VENUE_ID }, tenantId: null });
      const reply = createMockReply();

      await eventsController.createEvent(request, reply);

      expect(reply.statusCode).toBe(400);
    });
  });

  describe('deleteEvent', () => {
    it('should return 404 for non-existent event', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await eventsController.deleteEvent(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('publishEvent', () => {
    it('should return 404 for non-existent event', async () => {
      const request = createMockRequest({ params: { id: uuidv4() } });
      const reply = createMockReply();

      await eventsController.publishEvent(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });
});
