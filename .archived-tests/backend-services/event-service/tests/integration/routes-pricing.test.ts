/**
 * Pricing Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, pool, redis } from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Pricing Routes', () => {
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
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Pricing Test Event', `pricing-test-${testEventId.slice(0, 8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  async function createPricingDirect(overrides: any = {}) {
    const pricingId = overrides.id || uuidv4();
    await pool.query(
      `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pricingId, overrides.tenant_id || TEST_TENANT_ID, overrides.event_id || testEventId, overrides.name || 'GA', overrides.base_price ?? 50.00, overrides.current_price ?? 50.00, overrides.is_active ?? true, overrides.is_visible ?? true]
    );
    const result = await pool.query('SELECT * FROM event_pricing WHERE id = $1', [pricingId]);
    return result.rows[0];
  }

  describe('GET /api/v1/events/:eventId/pricing', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/pricing` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createPricingDirect({ name: 'VIP', base_price: 150 });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/pricing`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/events/:eventId/pricing/active', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/pricing/active` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with auth', async () => {
      await createPricingDirect({ is_active: true });
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/events/${testEventId}/pricing/active`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/pricing/:id', () => {
    it('should require authentication', async () => {
      const pricing = await createPricingDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/pricing/${pricing.id}` });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 for existing pricing', async () => {
      const pricing = await createPricingDirect();
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/pricing/${pricing.id}`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(200);
    });

    it('should return 404 for non-existent pricing', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/pricing/${uuidv4()}`, headers: { authorization: `Bearer ${authToken}` } });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/events/:eventId/pricing', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/events/${testEventId}/pricing`, payload: { name: 'Premium', base_price: 100 } });
      expect(response.statusCode).toBe(401);
    });

    it('should create pricing with auth', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/events/${testEventId}/pricing`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { name: 'Premium', base_price: 100 },
      });
      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe('PUT /api/v1/pricing/:id', () => {
    it('should require authentication', async () => {
      const pricing = await createPricingDirect();
      const response = await context.app.inject({ method: 'PUT', url: `/api/v1/pricing/${pricing.id}`, payload: { base_price: 75 } });
      expect(response.statusCode).toBe(401);
    });

    it('should update pricing with auth', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/pricing/${pricing.id}`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { base_price: 75 },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/pricing/:id/calculate', () => {
    it('should require authentication', async () => {
      const pricing = await createPricingDirect();
      const response = await context.app.inject({ method: 'POST', url: `/api/v1/pricing/${pricing.id}/calculate`, payload: { quantity: 3 } });
      expect(response.statusCode).toBe(401);
    });

    it('should calculate price with auth', async () => {
      const pricing = await createPricingDirect({ base_price: 50 });
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/pricing/${pricing.id}/calculate`,
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: { quantity: 3 },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
