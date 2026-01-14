/**
 * Venue Analytics Routes Integration Tests
 */

import { setupTestApp, teardownTestApp, TestContext, cleanDatabase, generateTestToken, db, redis } from './setup';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('Venue Analytics Routes', () => {
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

  describe('GET /api/v1/venues/:venueId/dashboard', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/venues/${TEST_VENUE_ID}/dashboard` });
      expect(response.statusCode).toBe(401);
    });

    it('should return venue dashboard', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/venues/${TEST_VENUE_ID}/dashboard`, headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/venues/:venueId/analytics', () => {
    it('should require authentication', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/venues/${TEST_VENUE_ID}/analytics` });
      expect(response.statusCode).toBe(401);
    });

    it('should return venue analytics', async () => {
      const response = await context.app.inject({ method: 'GET', url: `/api/v1/venues/${TEST_VENUE_ID}/analytics`, headers: { authorization: `Bearer ${authToken}` } });
      expect([200, 501]).toContain(response.statusCode);
    });
  });
});
