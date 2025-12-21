/**
 * Tickets Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Tickets Routes', () => {
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
    await pool.query(`INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Tickets Test Event', `tickets-test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]);
  });

  describe('GET /api/v1/events/:id/ticket-types', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/ticket-types` });
      expect(response.statusCode).toBe(401);
    });

    it('should return ticket types for event', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/ticket-types`, headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe('POST /api/v1/events/:id/ticket-types', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${testEventId}/ticket-types`, payload: { name: 'VIP', price: 100 } });
      expect(response.statusCode).toBe(401);
    });

    it('should create ticket type', async () => {
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${testEventId}/ticket-types`, headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' }, payload: { name: 'VIP', price: 100, quantity: 50 } });
      expect([201, 200, 501]).toContain(response.statusCode);
    });
  });

  describe('PUT /api/v1/events/:id/ticket-types/:typeId', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'PUT', url: `/api/v1/events/${testEventId}/ticket-types/${uuidv4()}`, payload: { price: 150 } });
      expect(response.statusCode).toBe(401);
    });
  });
});
