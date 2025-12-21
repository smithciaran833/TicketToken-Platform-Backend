/**
 * Auth Middleware Integration Tests
 * 
 * Tests authentication via JWT and API keys.
 * FK Chain: tenants → users → api_keys
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
  ensureTestUser,
  db,
  pool,
  redis
} from '../setup';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

describe('Auth Middleware Integration Tests', () => {
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
    // Clear API key cache
    const keys = await redis.keys('api_key:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // Helper to create API key
  async function createTestApiKey(userId: string, options: {
    isActive?: boolean;
    expiresAt?: Date;
    permissions?: string[];
  } = {}): Promise<string> {
    const apiKey = `tk_test_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = options.expiresAt || new Date(Date.now() + 86400000); // 1 day

    await pool.query(
      `INSERT INTO api_keys (id, user_id, key, name, permissions, is_active, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        userId,
        apiKey,
        'Test API Key',
        options.permissions || ['venue:read'],
        options.isActive !== false,
        expiresAt
      ]
    );

    return apiKey;
  }

  // ==========================================================================
  // JWT Authentication
  // ==========================================================================
  describe('JWT Authentication', () => {
    it('should authenticate with valid JWT token', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 without authorization header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: 'Bearer invalid.token.here'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with malformed authorization header', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: 'NotBearer token'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should set user on request from JWT claims', async () => {
      // Use check-access endpoint which returns user info
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
    });
  });

  // ==========================================================================
  // API Key Authentication
  // ==========================================================================
  describe('API Key Authentication', () => {
    it('should authenticate with valid API key', async () => {
      const apiKey = await createTestApiKey(TEST_USER_ID);

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'x-api-key': apiKey
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 with invalid API key', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          'x-api-key': 'invalid_api_key'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with inactive API key', async () => {
      const apiKey = await createTestApiKey(TEST_USER_ID, { isActive: false });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          'x-api-key': apiKey
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with expired API key', async () => {
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday
      const apiKey = await createTestApiKey(TEST_USER_ID, { expiresAt: expiredDate });

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          'x-api-key': apiKey
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should cache API key after first use', async () => {
      const apiKey = await createTestApiKey(TEST_USER_ID);

      // First request
      await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'x-api-key': apiKey
        }
      });

      // Check cache
      const cached = await redis.get(`api_key:${apiKey}`);
      expect(cached).not.toBeNull();

      const cachedUser = JSON.parse(cached!);
      expect(cachedUser.id).toBe(TEST_USER_ID);
    });

    it('should prefer API key over JWT when both provided', async () => {
      const apiKey = await createTestApiKey(TEST_USER_ID);

      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
        headers: {
          'x-api-key': apiKey,
          authorization: `Bearer ${authToken}`
        }
      });

      // Should succeed with API key
      expect(response.statusCode).toBe(200);
    });
  });

  // ==========================================================================
  // Venue Access
  // ==========================================================================
  describe('Venue Access Control', () => {
    it('should allow access to venue for staff member', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should deny access to venue for non-staff user', async () => {
      const randomUserId = uuidv4();
      await ensureTestUser(db, randomUserId);
      const randomToken = createTestToken(randomUserId, TEST_TENANT_ID, 'user');

      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${randomToken}`
        }
      });

      // Should be 403 or 404 depending on implementation
      expect([403, 404]).toContain(response.statusCode);
    });
  });
});
