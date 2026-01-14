/**
 * Error Handler Middleware Integration Tests
 * 
 * Tests error handling and response formatting.
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
import { v4 as uuidv4 } from 'uuid';

describe('Error Handler Middleware Integration Tests', () => {
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
  // Not Found Errors
  // ==========================================================================
  describe('Not Found Errors', () => {
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
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it('should return 404 for non-existent route', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/nonexistent-route'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // Authentication Errors
  // ==========================================================================
  describe('Authentication Errors', () => {
    it('should return 401 for missing auth', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it('should return 401 for invalid token', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: 'Bearer invalid.token'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Validation Errors
  // ==========================================================================
  describe('Validation Errors', () => {
    it('should return validation error for invalid body', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          // Missing required fields
          name: ''
        }
      });

      // Should be 400 or 422 for validation
      expect([400, 422]).toContain(response.statusCode);
    });

    it('should include validation details in error response', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          // Invalid data
        }
      });

      expect([400, 422]).toContain(response.statusCode);
      const body = JSON.parse(response.payload);
      expect(body.error || body.message).toBeDefined();
    });
  });

  // ==========================================================================
  // Authorization Errors
  // ==========================================================================
  describe('Authorization Errors', () => {
    it('should return 403 for unauthorized venue access', async () => {
      const newUserId = uuidv4();
      // Create user without staff role
      await db.raw(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
        [newUserId, `test-${newUserId.slice(0, 8)}@example.com`, '$2b$10$dummy', true, 'ACTIVE', 'user', TEST_TENANT_ID]
      );

      const unauthorizedToken = createTestToken(newUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'PUT',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${unauthorizedToken}`,
          'content-type': 'application/json'
        },
        payload: {
          name: 'Hacked'
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ==========================================================================
  // Error Response Format
  // ==========================================================================
  describe('Error Response Format', () => {
    it('should include error message in response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe('string');
    });

    it('should return JSON content type for errors', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
