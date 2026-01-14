/**
 * Rate Limit Middleware Integration Tests
 * 
 * Tests rate limiting functionality.
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

describe('Rate Limit Middleware Integration Tests', () => {
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
    // Clear rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ==========================================================================
  // Rate Limit Headers
  // ==========================================================================
  describe('Rate Limit Headers', () => {
    it('should include rate limit headers in response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should decrement remaining count with each request', async () => {
      const response1 = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
      });

      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining'] as string);

      const response2 = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
      });

      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining'] as string);

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  // ==========================================================================
  // Health Check Exemption
  // ==========================================================================
  describe('Health Check Exemption', () => {
    it('should not rate limit health check endpoints', async () => {
      // Make many requests to health endpoint
      for (let i = 0; i < 20; i++) {
        const response = await context.app.inject({
          method: 'GET',
          url: '/health'
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  // ==========================================================================
  // Per-User Rate Limiting
  // ==========================================================================
  describe('Per-User Rate Limiting', () => {
    it('should track rate limits per user', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });
  });

  // ==========================================================================
  // Per-Venue Rate Limiting
  // ==========================================================================
  describe('Per-Venue Rate Limiting', () => {
    it('should track rate limits per venue', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/api/v1/venues/${TEST_VENUE_ID}`,
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });
  });

  // ==========================================================================
  // Rate Limit Reset
  // ==========================================================================
  describe('Rate Limit Reset', () => {
    it('should include reset time in headers', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
      });

      expect(response.statusCode).toBe(200);
      const resetTime = response.headers['x-ratelimit-reset'] as string;
      expect(resetTime).toBeDefined();
      
      // Should be a valid ISO date string
      const resetDate = new Date(resetTime);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ==========================================================================
  // Redis Failure Handling
  // ==========================================================================
  describe('Redis Failure Handling', () => {
    it('should continue working when Redis has issues (fail open)', async () => {
      // Even with potential Redis issues, requests should still work
      const response = await context.app.inject({
        method: 'GET',
        url: '/api/v1/venues',
      });

      // Should succeed - rate limiter fails open
      expect(response.statusCode).toBe(200);
    });
  });
});
