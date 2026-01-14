/**
 * Versioning Middleware Integration Tests
 * 
 * Tests API versioning functionality.
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

describe('Versioning Middleware Integration Tests', () => {
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
  // Version in URL Path
  // ==========================================================================
  describe('Version in URL Path', () => {
    it('should accept v1 in URL path', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 for unsupported version in path', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v99/venues'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('not supported');
    });
  });

  // ==========================================================================
  // Version Headers in Response
  // ==========================================================================
  describe('Version Headers in Response', () => {
    it('should include API-Version header in response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
    });

    it('should include X-API-Version header in response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-api-version']).toBe('v1');
    });
  });

  // ==========================================================================
  // Version Header in Request
  // ==========================================================================
  describe('Version Header in Request', () => {
    it('should accept api-version header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'api-version': 'v1'
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept accept-version header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'accept-version': 'v1'
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Unsupported Versions
  // ==========================================================================
  describe('Unsupported Versions', () => {
    it('should return error with supported versions list', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v99/venues'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.details).toBeDefined();
      expect(body.details.supported).toContain('v1');
    });

    it('should include current version in error details', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v99/venues'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.details.current).toBe('v1');
    });
  });

  // ==========================================================================
  // Non-Versioned Routes
  // ==========================================================================
  describe('Non-Versioned Routes', () => {
    it('should work for health endpoints without version', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should work for metrics endpoint without version', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Version Priority
  // ==========================================================================
  describe('Version Priority', () => {
    it('should prioritize URL path version over header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'api-version': 'v2'  // Header says v2 but URL says v1
        }
      });

      // URL path takes priority, so v1 should be used
      expect(response.statusCode).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
    });
  });
});
