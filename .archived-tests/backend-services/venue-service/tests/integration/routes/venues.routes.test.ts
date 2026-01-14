/**
 * Venues Routes Integration Tests
 * 
 * Tests HTTP endpoints for venue CRUD operations.
 * Uses app.inject() for in-process HTTP testing.
 * FK Chain: tenants → users → venues → venue_staff
 * 
 * Routes registered at: /api/v1/venues
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
  pool
} from '../setup';
import { v4 as uuidv4 } from 'uuid';

describe('Venues Routes Integration Tests', () => {
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
    await cleanDatabase(db);
    // Ensure owner staff exists for TEST_VENUE_ID
    await createTestStaffMember(db, {
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
    });
  });

  // ==========================================================================
  // GET /api/v1/venues
  // ==========================================================================
  describe('GET /api/v1/venues', () => {
    it('should return list of venues without auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return user venues with my_venues flag and auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues?my_venues=true',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should include pagination info', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues?limit=5&offset=0'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.limit).toBe(5);
      expect(body.pagination.offset).toBe(0);
    });
  });

  // ==========================================================================
  // POST /api/v1/venues
  // ==========================================================================
  describe('POST /api/v1/venues', () => {
    it('should create venue with valid data and auth', async () => {
      const venueData = {
        name: 'New Test Venue',
        slug: `new-venue-${Date.now()}`,
        email: 'newvenue@test.com',
        address_line1: '456 New Street',
        city: 'New City',
        state_province: 'NC',
        country_code: 'US',
        venue_type: 'concert_hall',
        max_capacity: 5000,
      };

      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: venueData
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('New Test Venue');
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          name: 'Unauthorized Venue',
          venue_type: 'theater',
          max_capacity: 100
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/user
  // ==========================================================================
  describe('GET /api/v1/venues/user', () => {
    it('should return user venues with auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues/user',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(Array.isArray(body)).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues/user'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId', () => {
    it('should return venue by id with auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(TEST_VENUE_ID);
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent venue', async () => {
      const fakeId = uuidv4();
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${fakeId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/capacity
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/capacity', () => {
    it('should return venue capacity with auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/capacity`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.venueId).toBe(TEST_VENUE_ID);
      expect(body.totalCapacity).toBeDefined();
      expect(body.available).toBeDefined();
    });

    it('should return 403 for unauthorized user', async () => {
      const unauthorizedUserId = uuidv4();
      await ensureTestUser(db, unauthorizedUserId);
      const unauthorizedToken = createTestToken(unauthorizedUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/capacity`,
        headers: {
          authorization: `Bearer ${unauthorizedToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/stats
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/stats', () => {
    it('should return venue stats with auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/stats`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.venue).toBeDefined();
      expect(body.stats).toBeDefined();
    });
  });

  // ==========================================================================
  // PUT /api/v1/venues/:venueId
  // ==========================================================================
  describe('PUT /api/v1/venues/:venueId', () => {
    it('should update venue with valid data and auth', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Updated Venue Name',
          description: 'Updated description'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Updated Venue Name');
    });

    it('should return 401 without auth', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          'content-type': 'application/json'
        },
        payload: {
          name: 'Unauthorized Update'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-staff user', async () => {
      const unauthorizedUserId = uuidv4();
      await ensureTestUser(db, unauthorizedUserId);
      const unauthorizedToken = createTestToken(unauthorizedUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${unauthorizedToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Hacked Venue'
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // DELETE /api/v1/venues/:venueId
  // ==========================================================================
  describe('DELETE /api/v1/venues/:venueId', () => {
    it('should delete venue when owner requests', async () => {
      // Create a new venue to delete
      const venue = await createTestVenue(db, {
        name: 'Deletable Venue',
        slug: `deletable-${Date.now()}`,
      });

      await createTestStaffMember(db, {
        venue_id: venue.id,
        user_id: TEST_USER_ID,
        role: 'owner',
      });

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/venues/${venue.id}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for non-owner', async () => {
      const managerUserId = uuidv4();
      await ensureTestUser(db, managerUserId);
      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: managerUserId,
        role: 'manager',
      });

      const managerToken = createTestToken(managerUserId, TEST_TENANT_ID, 'manager');

      const response = await context.app.inject({
        method: 'DELETE',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${managerToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/check-access
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/check-access', () => {
    it('should return access details for staff member', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/check-access`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.hasAccess).toBe(true);
      expect(body.role).toBe('owner');
      expect(body.permissions).toBeDefined();
    });

    it('should return hasAccess false for non-staff', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/check-access`,
        headers: {
          authorization: `Bearer ${randomToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.hasAccess).toBe(false);
    });
  });

  // ==========================================================================
  // POST /api/v1/venues/:venueId/staff
  // ==========================================================================
  describe('POST /api/v1/venues/:venueId/staff', () => {
    it('should add staff member when owner requests', async () => {
      const newStaffUserId = uuidv4();
      await ensureTestUser(db, newStaffUserId);

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/staff`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          userId: newStaffUserId,
          role: 'box_office'
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.user_id).toBe(newStaffUserId);
      expect(body.role).toBe('box_office');
    });

    it('should return 400 without userId', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/staff`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          role: 'box_office'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 for non-owner/manager', async () => {
      const viewerUserId = uuidv4();
      const newStaffUserId = uuidv4();
      await ensureTestUser(db, viewerUserId);
      await ensureTestUser(db, newStaffUserId);

      await createTestStaffMember(db, {
        venue_id: TEST_VENUE_ID,
        user_id: viewerUserId,
        role: 'viewer',
      });

      const viewerToken = createTestToken(viewerUserId, TEST_TENANT_ID, 'viewer');

      const response = await context.app.inject({
        method: 'POST',
        url: `/api/v1/venues/${TEST_VENUE_ID}/staff`,
        headers: {
          authorization: `Bearer ${viewerToken}`,
          'content-type': 'application/json'
        },
        payload: {
          userId: newStaffUserId,
          role: 'door_staff'
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/v1/venues/:venueId/staff
  // ==========================================================================
  describe('GET /api/v1/venues/:venueId/staff', () => {
    it('should return staff list with auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/staff`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 403 for non-staff user', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}/staff`,
        headers: {
          authorization: `Bearer ${randomToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
