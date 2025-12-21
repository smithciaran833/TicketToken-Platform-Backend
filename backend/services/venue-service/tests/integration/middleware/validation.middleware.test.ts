/**
 * Validation Middleware Integration Tests
 * 
 * Tests request body/query/params validation.
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
  createTestStaffMember,
  db
} from '../setup';

describe('Validation Middleware Integration Tests', () => {
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
    await createTestStaffMember(db, {
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
    });
  });

  // ==========================================================================
  // Body Validation
  // ==========================================================================
  describe('Body Validation', () => {
    it('should reject empty body for POST /venues', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {}
      });

      expect([400, 422]).toContain(response.statusCode);
    });

    it('should reject missing required fields', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test Venue'
          // Missing other required fields
        }
      });

      expect([400, 422]).toContain(response.statusCode);
    });

    it('should accept valid venue creation body', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Valid Test Venue',
          slug: `valid-venue-${Date.now()}`,
          email: 'valid@test.com',
          address_line1: '123 Valid St',
          city: 'Valid City',
          state_province: 'VC',
          country_code: 'US',
          venue_type: 'theater',
          max_capacity: 1000
        }
      });

      expect(response.statusCode).toBe(201);
    });

    it('should validate email format', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test Venue',
          slug: `test-venue-${Date.now()}`,
          email: 'invalid-email-format',
          address_line1: '123 Test St',
          city: 'Test City',
          state_province: 'TC',
          country_code: 'US',
          venue_type: 'theater',
          max_capacity: 1000
        }
      });

      expect([400, 422]).toContain(response.statusCode);
    });

    it('should validate max_capacity is positive number', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Test Venue',
          slug: `test-venue-${Date.now()}`,
          email: 'test@test.com',
          address_line1: '123 Test St',
          city: 'Test City',
          state_province: 'TC',
          country_code: 'US',
          venue_type: 'theater',
          max_capacity: -100
        }
      });

      expect([400, 422]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Query Validation
  // ==========================================================================
  describe('Query Validation', () => {
    it('should accept valid query parameters', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues?limit=10&offset=0'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle invalid query parameters gracefully', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues?limit=invalid'
      });

      // Should either coerce or reject
      expect([200, 400, 422]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Params Validation
  // ==========================================================================
  describe('Params Validation', () => {
    it('should accept valid UUID for venueId', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle invalid UUID format', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues/not-a-valid-uuid',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      // Should be 400 or 404
      expect([400, 404, 500]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Update Validation
  // ==========================================================================
  describe('Update Validation', () => {
    it('should allow partial updates', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          description: 'Updated description only'
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid field types in update', async () => {
      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          max_capacity: 'not a number'
        }
      });

      expect([400, 422]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Validation Error Messages
  // ==========================================================================
  describe('Validation Error Messages', () => {
    it('should include field-specific error messages', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: '',
          email: 'invalid'
        }
      });

      expect([400, 422]).toContain(response.statusCode);
      const body = JSON.parse(response.payload);
      // Should have some error indication
      expect(body.error || body.message || body.details).toBeDefined();
    });
  });
});
