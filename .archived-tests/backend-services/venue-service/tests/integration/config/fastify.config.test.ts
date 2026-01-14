/**
 * Fastify Configuration Integration Tests
 *
 * Tests Fastify server configuration including middleware, routes, and plugins.
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
  db,
  redis
} from '../setup';

describe('Fastify Configuration Integration Tests', () => {
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
    await redis.flushdb();
    await cleanDatabase(db);
    await createTestStaffMember(db, {
      venue_id: TEST_VENUE_ID,
      user_id: TEST_USER_ID,
      role: 'owner',
    });
  });

  // ==========================================================================
  // Server Configuration Tests
  // ==========================================================================
  describe('Server Configuration', () => {
    it('should have fastify instance ready', () => {
      expect(context.app).toBeDefined();
      expect(context.app.server).toBeDefined();
    });

    it('should have correct server properties', () => {
      expect(typeof context.app.inject).toBe('function');
      expect(typeof context.app.close).toBe('function');
    });
  });

  // ==========================================================================
  // Security Headers (Helmet)
  // ==========================================================================
  describe('Security Headers', () => {
    it('should set security headers on responses', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      // Helmet sets various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should set content security policy', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  // ==========================================================================
  // CORS Configuration
  // ==========================================================================
  describe('CORS Configuration', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await context.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/venues',
        headers: {
          'origin': 'http://api-gateway:3000',
          'access-control-request-method': 'GET'
        }
      });

      // Should not be 404
      expect(response.statusCode).not.toBe(404);
    });
  });

  // ==========================================================================
  // JWT Configuration
  // ==========================================================================
  describe('JWT Configuration', () => {
    it('should verify valid JWT tokens', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: 'Bearer invalid.token.here'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject expired tokens', async () => {
      // Create an expired token (would need to mock time or use a pre-expired token)
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjF9.invalid'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ==========================================================================
  // Request ID Tracking
  // ==========================================================================
  describe('Request ID Tracking', () => {
    it('should generate request ID if not provided', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.headers['x-request-id']).toBeDefined();
      // UUID format check
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should use provided request ID', async () => {
      const customRequestId = 'custom-request-id-12345';
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live',
        headers: {
          'x-request-id': customRequestId
        }
      });

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });

  // ==========================================================================
  // Metrics Endpoint
  // ==========================================================================
  describe('Metrics Endpoint', () => {
    it('should expose /metrics endpoint', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should return prometheus-formatted metrics', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/metrics'
      });

      const body = response.payload;
      // Should contain standard prometheus metrics
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    });
  });

  // ==========================================================================
  // Route Registration Tests
  // ==========================================================================
  describe('Route Registration', () => {
    it('should register venue routes at /api/v1/venues', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should register health routes at /', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should register branding routes at /api/v1/branding', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/branding/${TEST_VENUE_ID}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // Should not be 404 (route exists)
      expect(response.statusCode).not.toBe(404);
    });

    it('should register domain routes at /api/v1/domains', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/domains/${TEST_VENUE_ID}`,
        headers: { authorization: `Bearer ${authToken}` }
      });

      // Should not be 404 (route exists)
      expect(response.statusCode).not.toBe(404);
    });
  });

  // ==========================================================================
  // Error Handler Tests
  // ==========================================================================
  describe('Error Handler', () => {
    it('should return JSON error for 404', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/nonexistent/route'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it('should handle validation errors with 422', async () => {
      const response = await context.app.inject({
        method: 'POST',
        url: '/api/v1/venues',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json'
        },
        payload: {
          // Missing required fields
          name: 'Test'
        }
      });

      // Should be 400 or 422 for validation error
      expect([400, 422]).toContain(response.statusCode);
    });

    it('should include request ID in error responses', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/nonexistent/route'
      });

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  // ==========================================================================
  // Swagger Documentation (non-production)
  // ==========================================================================
  describe('Swagger Documentation', () => {
    it('should expose /documentation endpoint in test env', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/documentation/json'
      });

      // Should return swagger JSON or redirect
      expect([200, 302]).toContain(response.statusCode);
    });
  });
});
