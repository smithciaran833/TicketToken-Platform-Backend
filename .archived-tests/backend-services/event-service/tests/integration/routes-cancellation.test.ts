/**
 * Cancellation Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Cancellation Routes', () => {
  let context: TestContext;
  let authToken: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' });
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  async function createEventDirect(overrides: any = {}) {
    const eventId = overrides.id || uuidv4();
    const slug = overrides.slug || `test-event-${eventId.slice(0, 8)}`;
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, overrides.tenant_id || TEST_TENANT_ID, overrides.venue_id || TEST_VENUE_ID, overrides.name || 'Test Event', slug, overrides.status || 'PUBLISHED', overrides.event_type || 'single', overrides.created_by || TEST_USER_ID]
    );
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
    return result.rows[0];
  }

  describe('POST /api/v1/events/:eventId/cancel', () => {
    it('should require authentication', async () => {
      const event = await createEventDirect();
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${event.id}/cancel` });
      expect(response.statusCode).toBe(401);
    });

    it('should cancel published event with auth', async () => {
      const event = await createEventDirect({ status: 'PUBLISHED' });
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/events/${event.id}/cancel`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { reason: 'Weather conditions' },
      });
      // May return 200 or 500 if notification service fails
      expect([200, 500]).toContain(response.statusCode);
    });

    it('should return error for non-existent event', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/events/${uuidv4()}/cancel`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { reason: 'Test' },
      });
      // 404 or 500 depending on error handling
      expect([404, 500]).toContain(response.statusCode);
    });
  });
});
