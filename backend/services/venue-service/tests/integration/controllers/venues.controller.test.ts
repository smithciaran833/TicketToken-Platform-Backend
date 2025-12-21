/**
 * Venues Controller Integration Tests
 * 
 * Tests venue controller behavior, nested routes, and error handling.
 * FK Chain: tenants → users → venues → venue_staff
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  createTestToken,
  createTestVenue,
  createTestStaffMember,
  ensureTestUser,
  db,
  redis
} from '../setup';
import { v4 as uuidv4 } from 'uuid';

describe('Venues Controller Integration Tests', () => {
  let context: TestContext;
  let authToken: string;

  beforeAll(async () => {
    context = await setupTestApp();
    authToken = createTestToken(TEST_USER_ID, TEST_TENANT_ID, 'owner');
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    // Clear ALL Redis keys to reset rate limits
    await redis.flushdb();
    
    await cleanDatabase(db);
    await createTestStaffMember(db, {
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
    });
  });

  // ==========================================================================
  // Nested Routes Registration
  // ==========================================================================
  describe('Nested Routes Registration', () => {
    it('should have integrations routes registered', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/integrations`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // Should return 200 (empty array) not 404
      expect(response.statusCode).toBe(200);
    });

    it('should have compliance routes registered (503 when service unavailable)', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/compliance/status`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // 503 is expected (service unavailable), not 404
      expect(response.statusCode).toBe(503);
    });

    it('should have analytics routes registered (503 when service unavailable)', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/analytics/summary`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // 503 is expected (service unavailable), not 404
      expect(response.statusCode).toBe(503);
    });
  });

  // ==========================================================================
  // Tenant Context
  // ==========================================================================
  describe('Tenant Context', () => {
    it('should add tenant context from authenticated user', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow public venue listing', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Venue Ownership Verification
  // ==========================================================================
  describe('Venue Ownership Verification', () => {
    it('should allow owner to update venue', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: { name: 'Updated Name' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow manager to update venue', async () => {
      const managerUserId = uuidv4();
      await ensureTestUser(db, managerUserId);
      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: managerUserId,
        role: 'manager',
      });
      const managerToken = createTestToken(managerUserId, TEST_TENANT_ID, 'manager');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${managerToken}`,
          'content-type': 'application/json'
        },
        payload: { description: 'Updated by manager' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny viewer from updating venue', async () => {
      const viewerUserId = uuidv4();
      await ensureTestUser(db, viewerUserId);
      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: viewerUserId,
        role: 'viewer',
      });
      const viewerToken = createTestToken(viewerUserId, TEST_TENANT_ID, 'viewer');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${viewerToken}`,
          'content-type': 'application/json'
        },
        payload: { name: 'Hacked' }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================
  describe('Error Handling', () => {
    it('should return 404 for non-existent venue', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${uuidv4()}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for unauthorized delete', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: { authorization: `Bearer ${randomToken}` }
      });

      // Either 403 (forbidden) or 404 (not visible to user) is acceptable
      expect([403, 404]).toContain(response.statusCode);
    });
  });
});
