/**
 * Capacity Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Capacity Routes', () => {
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
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Capacity Test Event', `capacity-test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  async function createCapacityDirect(overrides: any = {}) {
    const capacityId = overrides.id || uuidv4();
    await pool.query(
      `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [capacityId, overrides.tenant_id || TEST_TENANT_ID, overrides.event_id || testEventId, overrides.section_name || 'GA', overrides.total_capacity ?? 100, overrides.available_capacity ?? 100, 0, 0, true]
    );
    const result = await pool.query('SELECT * FROM event_capacity WHERE id = $1', [capacityId]);
    return result.rows[0];
  }

  describe('GET /api/v1/events/:eventId/capacity', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/capacity` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createCapacityDirect({ section_name: 'VIP' });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/capacity`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/events/:eventId/capacity/total', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/capacity/total` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createCapacityDirect({ total_capacity: 100 });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/capacity/total`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/capacity/:id', () => {
    it('should require authentication', async () => {
      const capacity = await createCapacityDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/capacity/${capacity.id}` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 for existing capacity', async () => {
      const capacity = await createCapacityDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/capacity/${capacity.id}`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent capacity', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/capacity/${uuidv4()}`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/events/:eventId/capacity', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${testEventId}/capacity`, payload: { section_name: 'VIP', total_capacity: 50 } });
      expect(response.statusCode).toBe(401);
    });

    it('should create capacity with auth', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/events/${testEventId}/capacity`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { section_name: 'Balcony', total_capacity: 75 },
      });
      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe('PUT /api/v1/capacity/:id', () => {
    it('should require authentication', async () => {
      const capacity = await createCapacityDirect();
      const response = await context.app.inject({ method: 'PUT', url: `/api/v1/capacity/${capacity.id}`, payload: { total_capacity: 150 } });
      expect(response.statusCode).toBe(401);
    });

    it('should update capacity with auth', async () => {
      const capacity = await createCapacityDirect({ total_capacity: 100 });
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/capacity/${capacity.id}`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { total_capacity: 150 },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/capacity/:id/check', () => {
    it('should require authentication', async () => {
      const capacity = await createCapacityDirect();
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/capacity/${capacity.id}/check`, payload: { quantity: 10 } });
      expect(response.statusCode).toBe(401);
    });

    it('should check availability with auth', async () => {
      const capacity = await createCapacityDirect({ available_capacity: 50 });
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/capacity/${capacity.id}/check`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { quantity: 10 },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/capacity/:id/reserve', () => {
    it('should require authentication', async () => {
      const capacity = await createCapacityDirect();
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/capacity/${capacity.id}/reserve`, payload: { quantity: 5 } });
      expect(response.statusCode).toBe(401);
    });

    it('should reserve capacity with auth', async () => {
      const capacity = await createCapacityDirect({ available_capacity: 100 });
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/capacity/${capacity.id}/reserve`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { quantity: 5 },
      });
      expect([200, 201]).toContain(response.statusCode);
    });
  });
});
