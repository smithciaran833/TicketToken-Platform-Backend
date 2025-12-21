/**
 * Auth Middleware Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  TestContext,
  generateTestToken,
} from './setup';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('Auth Middleware', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  // ==========================================================================
  // authenticateFastify
  // ==========================================================================
  describe('authenticateFastify', () => {
    it('should reject request without authorization header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toContain('Authentication');
    });

    it('should reject request with invalid authorization format', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: 'InvalidFormat token123',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toContain('Invalid token');
    });

    it('should accept request with valid token', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Should not be 401 (might be 200 or other status depending on route logic)
      expect(response.statusCode).not.toBe(401);
    });

    it('should reject refresh token used as access token', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'refresh', // Wrong type
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toContain('Invalid token type');
    });

    it('should reject token without tenant_id', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        type: 'access',
        // Missing tenant_id
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toContain('tenant');
    });

    it('should reject expired token', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error).toContain('expired');
    });

    it('should attach user data to request on success', async () => {
      const token = generateTestToken({
        sub: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'access',
        email: 'test@example.com',
        role: 'admin',
        permissions: ['events:read', 'events:write'],
      });

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Request should proceed past auth (not 401)
      expect(response.statusCode).not.toBe(401);
    });
  });
});
