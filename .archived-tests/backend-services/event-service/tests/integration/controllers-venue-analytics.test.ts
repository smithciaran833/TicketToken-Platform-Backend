/**
 * Venue Analytics Controller Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import * as venueAnalyticsController from '../../src/controllers/venue-analytics.controller';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Venue Analytics Controller', () => {
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
      body: overrides.body || {},
      headers: overrides.headers || { authorization: `Bearer ${generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' })}` },
      tenantId: TEST_TENANT_ID,
      container: (context.app as any).container,
      log: { error: jest.fn() },
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
    const eventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, TEST_TENANT_ID, overrides.venue_id || TEST_VENUE_ID, overrides.name || 'Test Event', `test-${eventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
    return { id: eventId };
  }

  async function createCapacityDirect(eventId: string, overrides: any = {}) {
    const capacityId = uuidv4();
    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, TEST_TENANT_ID, eventId, 'GA', overrides.total_capacity ?? 100, overrides.available_capacity ?? 100, overrides.reserved_capacity ?? 0, overrides.sold_count ?? 0, true]
    );
    return { id: capacityId };
  }

  describe('getVenueDashboard', () => {
    it('should return venue dashboard', async () => {
      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueDashboard(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.venue.id).toBe(TEST_VENUE_ID);
      expect(reply.sentData.stats).toBeDefined();
    });

    it('should count events for venue', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });

      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueDashboard(request, reply);

      expect(reply.sentData.events).toBe(2);
    });

    it('should aggregate capacity stats', async () => {
      const event = await createEventDirect({ name: 'Event 1' });
      await createCapacityDirect(event.id, { total_capacity: 100, sold_count: 50 });

      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueDashboard(request, reply);

      expect(reply.sentData.stats.total_capacity).toBe(100);
      expect(reply.sentData.stats.total_sold).toBe(50);
    });
  });

  describe('getVenueAnalytics', () => {
    it('should return venue analytics', async () => {
      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueAnalytics(request, reply);

      expect(reply.sentData.success).toBe(true);
      expect(reply.sentData.venueId).toBe(TEST_VENUE_ID);
      expect(reply.sentData.analytics).toBeDefined();
    });

    it('should return zero stats when no events', async () => {
      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueAnalytics(request, reply);

      expect(reply.sentData.analytics.total_events).toBe(0);
      expect(reply.sentData.analytics.total_tickets_sold).toBe(0);
    });

    it('should count events', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });

      const request = createMockRequest({ params: { venueId: TEST_VENUE_ID } });
      const reply = createMockReply();

      await venueAnalyticsController.getVenueAnalytics(request, reply);

      expect(reply.sentData.analytics.total_events).toBe(2);
    });
  });
});
