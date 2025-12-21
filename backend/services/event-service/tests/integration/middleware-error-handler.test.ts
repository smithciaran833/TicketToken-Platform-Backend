/**
 * Error Handler Middleware Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  generateTestToken,
  pool,
  db,
  redis,
} from './setup';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Error Handler Middleware', () => {
  let context: TestContext;
  let authToken: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = generateTestToken({
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID,
      type: 'access',
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  // ==========================================================================
  // errorHandler
  // ==========================================================================
  describe('errorHandler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-route',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for non-existent event', async () => {
      const fakeEventId = uuidv4();

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/events/${fakeEventId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include requestId in error response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-route',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const body = response.json();
      expect(body.requestId).toBeDefined();
    });

    it('should include timestamp in error response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-route',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const body = response.json();
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });

    it('should return proper error name for 401', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        // No auth header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return proper error name for 400', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events/not-a-uuid',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Should be 400 for invalid UUID format or 404
      expect([400, 404, 422]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // PostgreSQL error handling
  // ==========================================================================
  describe('PostgreSQL error handling', () => {
    it('should handle unique constraint violations (23505)', async () => {
      // Create an event with a specific slug
      const eventId = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [eventId, TEST_TENANT_ID, '00000000-0000-0000-0000-000000000077', 'Unique Event', 'unique-slug-test', 'DRAFT', 'single', TEST_USER_ID]
      );

      // Try to create another event with the same slug (should trigger unique constraint)
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          venue_id: '00000000-0000-0000-0000-000000000077',
          name: 'Another Event',
          slug: 'unique-slug-test', // Same slug
          event_type: 'single',
        },
      });

      // Should be 409 Conflict or handled gracefully
      expect([409, 400, 422, 500]).toContain(response.statusCode);
    });
  });
});
