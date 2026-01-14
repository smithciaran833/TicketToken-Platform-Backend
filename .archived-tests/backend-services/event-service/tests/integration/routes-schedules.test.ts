/**
 * Schedules Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Schedules Routes', () => {
  let context: TestContext;
  let authToken: string;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = generateTestToken({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID, type: 'access' });
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Schedule Test Event', `schedule-test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  async function createScheduleDirect(overrides: any = {}) {
    const scheduleId = overrides.id || uuidv4();
    const startsAt = overrides.starts_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = overrides.ends_at || new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [scheduleId, overrides.tenant_id || TEST_TENANT_ID, overrides.event_id || testEventId, startsAt, endsAt, overrides.timezone || 'UTC', overrides.status || 'SCHEDULED']
    );
    const result = await pool.query('SELECT * FROM event_schedules WHERE id = $1', [scheduleId]);
    return result.rows[0];
  }

  describe('GET /api/v1/events/:eventId/schedules', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createScheduleDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/events/:eventId/schedules', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${testEventId}/schedules`, payload: { starts_at: new Date().toISOString() } });
      expect(response.statusCode).toBe(401);
    });

    it('should create schedule with auth', async () => {
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString();
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/events/${testEventId}/schedules`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { starts_at: startsAt, ends_at: endsAt, timezone: 'America/New_York' },
      });
      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/events/:eventId/schedules/upcoming', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/upcoming` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createScheduleDirect({ starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/upcoming`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/events/:eventId/schedules/next', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/next` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createScheduleDirect({ starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/next`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/events/:eventId/schedules/:scheduleId', () => {
    it('should require authentication', async () => {
      const schedule = await createScheduleDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/${schedule.id}` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 for existing schedule', async () => {
      const schedule = await createScheduleDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/schedules/${schedule.id}`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('PUT /api/v1/events/:eventId/schedules/:scheduleId', () => {
    it('should require authentication', async () => {
      const schedule = await createScheduleDirect();
      const response = await context.app.inject({ method: 'PUT', url: `/api/v1/events/${testEventId}/schedules/${schedule.id}`, payload: { timezone: 'America/Chicago' } });
      expect(response.statusCode).toBe(401);
    });

    it('should update schedule with auth', async () => {
      const schedule = await createScheduleDirect({ timezone: 'UTC' });
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/events/${testEventId}/schedules/${schedule.id}`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { timezone: 'America/Chicago' },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
