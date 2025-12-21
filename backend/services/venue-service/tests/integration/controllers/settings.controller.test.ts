/**
 * Settings Controller Integration Tests
 * 
 * Tests venue settings CRUD operations.
 * FK Chain: tenants → users → venues → venue_settings
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  createTestToken,
  createTestVenue,
  createTestStaffMember,
  createTestVenueSettings,
  ensureTestUser,
  db,
  redis
} from '../setup';
import { v4 as uuidv4 } from 'uuid';

describe('Settings Controller Integration Tests', () => {
  let context: TestContext;
  let authToken: string;
  let testVenueId: string;

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

    // Create unique venue for each test
    const venue = await createTestVenue(db, {
      name: 'Settings Test Venue',
      tenant_id: TEST_TENANT_ID,
      created_by: TEST_USER_ID,
    });
    testVenueId = venue.id;

    await createTestStaffMember(db, {
      venue_id: testVenueId,
      user_id: TEST_USER_ID,
      role: 'owner',
    });

    // Create venue settings
    await createTestVenueSettings(db, {
      venue_id: testVenueId,
      max_tickets_per_order: 10,
      ticket_resale_allowed: true,
      service_fee_percentage: 10.00
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/settings
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/settings', () => {
    it('should return venue settings for authorized user', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.venue_id).toBe(testVenueId);
      expect(body.max_tickets_per_order).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${testVenueId}/settings`
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-staff user', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: { authorization: `Bearer ${randomToken}` }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // PUT /api/v1/venues/:venueId/settings
  // ==========================================================================
  describe('PUT /api/v1/venues/:venueId/settings', () => {
    it('should update settings for owner', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          max_tickets_per_order: 20,
          ticket_resale_allowed: false
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.max_tickets_per_order).toBe(20);
      expect(body.ticket_resale_allowed).toBe(false);
    });

    it('should update settings for manager', async () => {
      const managerUserId = uuidv4();
      await ensureTestUser(db, managerUserId);
      await createTestStaffMember(db, {
        venue_id: testVenueId,
        user_id: managerUserId,
        role: 'manager',
      });
      const managerToken = createTestToken(managerUserId, TEST_TENANT_ID, 'manager');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: {
          authorization: `Bearer ${managerToken}`,
          'content-type': 'application/json'
        },
        payload: { max_tickets_per_order: 15 }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for viewer role', async () => {
      const viewerUserId = uuidv4();
      await ensureTestUser(db, viewerUserId);
      await createTestStaffMember(db, {
        venue_id: testVenueId,
        user_id: viewerUserId,
        role: 'viewer',
      });
      const viewerToken = createTestToken(viewerUserId, TEST_TENANT_ID, 'viewer');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: {
          authorization: `Bearer ${viewerToken}`,
          'content-type': 'application/json'
        },
        payload: { max_tickets_per_order: 5 }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: { 'content-type': 'application/json' },
        payload: { max_tickets_per_order: 5 }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate max_tickets_per_order is non-negative', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${testVenueId}/settings`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: { max_tickets_per_order: -5 }
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
