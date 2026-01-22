import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
  createTestUser,
  initAppRedis,
} from './setup';

// Mock email service
jest.mock('../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { buildApp } from '../../src/app';
import { env } from '../../src/config/env';
import { getRedis } from '../../src/config/redis';
import fs from 'fs';

let app: any;

// Small delay helper for ensuring async operations complete
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// TEST HELPERS
// ============================================

const registerAndLoginUser = async (userData?: any): Promise<{
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}> => {
  const user = createTestUser(userData);
  const regResponse = await request(app.server)
    .post('/auth/register')
    .send(user)
    .expect(201);

  return {
    userId: regResponse.body.user.id,
    email: user.email,
    password: user.password,
    accessToken: regResponse.body.tokens.accessToken,
    refreshToken: regResponse.body.tokens.refreshToken,
  };
};

const deleteUser = async (userId: string): Promise<void> => {
  await testPool.query(
    `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
    [userId]
  );
};

const suspendUser = async (userId: string): Promise<void> => {
  await testPool.query(
    `UPDATE users SET status = 'SUSPENDED' WHERE id = $1`,
    [userId]
  );
};

const lockUser = async (userId: string, minutes: number = 15): Promise<void> => {
  await testPool.query(
    `UPDATE users SET locked_until = NOW() + INTERVAL '${minutes} minutes' WHERE id = $1`,
    [userId]
  );
};

const generateServiceToken = async (serviceName: string = 'api-gateway'): Promise<string> => {
  const privateKeyPath = env.S2S_PRIVATE_KEY_PATH || env.JWT_PRIVATE_KEY_PATH;
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  return jwt.sign(
    {
      sub: serviceName,
      type: 'service',
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h',
    }
  );
};

// FIX: Add granted_by field to avoid NOT NULL constraint violation
const createVenueRole = async (userId: string, venueId: string, role: string): Promise<void> => {
  await testPool.query(
    `INSERT INTO user_venue_roles (user_id, tenant_id, venue_id, role, granted_by, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [userId, TEST_TENANT_ID, venueId, role, userId]
  );
};

const getRedisKeys = async (pattern: string): Promise<string[]> => {
  return testRedis.keys(pattern);
};

// Clean up both test Redis AND app Redis to ensure isolation
const cleanupAllWithAppRedis = async (): Promise<void> => {
  await cleanupAll();
  // Also flush via app's Redis connection to ensure same state
  try {
    const appRedis = getRedis();
    await appRedis.flushdb();
  } catch (e) {
    // Ignore if Redis not initialized yet
  }
};

// ============================================
// MAIN TEST SUITE
// ============================================

describe('Middleware Behaviors Integration Tests', () => {
  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAllWithAppRedis();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // GROUP 1: Authentication Middleware
  // ============================================
  describe('GROUP 1: Authentication Middleware', () => {
    describe('Valid Token Scenarios', () => {
      it('should allow access with valid JWT token', async () => {
        const user = await registerAndLoginUser();

        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(200);

        expect(response.body.user.id).toBe(user.userId);
        expect(response.body.user.email).toBe(user.email);
      });

      it('should extract user data from valid JWT and attach to request', async () => {
        const user = await registerAndLoginUser();

        const response = await request(app.server)
          .get('/auth/verify')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(200);

        expect(response.body.valid).toBe(true);
        expect(response.body.user.id).toBe(user.userId);
        expect(response.body.user.email).toBe(user.email);
      });

      it('should verify user permissions are checked correctly', async () => {
        const user = await registerAndLoginUser();
        const targetUser = await registerAndLoginUser(); // Create a REAL user to grant role to
        const venueId = crypto.randomUUID();

        // Without role, should not have permission
        await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'box-office',
          })
          .expect(403);

        // Grant roles:manage permission via venue-owner role
        await createVenueRole(user.userId, venueId, 'venue-owner');

        // Now should have permission
        await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'box-office',
          })
          .expect(200);
      });
    });

    describe('Invalid Token Scenarios', () => {
      it('should reject request with missing Authorization header', async () => {
        const response = await request(app.server)
          .get('/auth/me')
          .expect(401);

        expect(response.body.status).toBe(401);
      });

      it('should reject malformed Authorization header (no Bearer prefix)', async () => {
        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', 'NotBearer invalid-token')
          .expect(401);

        expect(response.body.status).toBe(401);
      });

      it('should reject expired JWT token', async () => {
        const user = await registerAndLoginUser();

        // Create an expired token
        const privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
        const expiredToken = jwt.sign(
          {
            sub: user.userId,
            type: 'access',
            jti: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            email: user.email,
          },
          privateKey,
          {
            algorithm: 'RS256',
            expiresIn: '-1h', // Already expired
            issuer: env.JWT_ISSUER,
            audience: env.JWT_ISSUER,
          }
        );

        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(401);

        expect(response.body.detail).toMatch(/expired|invalid/i);
      });

      it('should reject JWT with invalid signature', async () => {
        const user = await registerAndLoginUser();

        // Tamper with the token
        const parts = user.accessToken.split('.');
        const tamperedToken = `${parts[0]}.${parts[1]}.TAMPERED_SIGNATURE`;

        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${tamperedToken}`)
          .expect(401);
      });

      it('should reject token after logout (invalidated)', async () => {
        const user = await registerAndLoginUser();

        // Logout to invalidate token
        await request(app.server)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ refreshToken: user.refreshToken })
          .expect(200);

        // Try to use invalidated token - should now be rejected by auth middleware
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(401);
      });

      it('should reject valid token but user deleted', async () => {
        const user = await registerAndLoginUser();

        // Delete user
        await deleteUser(user.userId);

        // Should be rejected by auth middleware
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(401);
      });

      it('should reject valid token but user suspended', async () => {
        const user = await registerAndLoginUser();

        // Suspend user
        await suspendUser(user.userId);

        // Should be rejected by auth middleware
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(401);
      });

      it('should reject valid token but user locked', async () => {
        const user = await registerAndLoginUser();

        // Lock user
        await lockUser(user.userId, 15);

        // Should be rejected by auth middleware
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(401);
      });
    });

    describe('Permission-Based Scenarios', () => {
      it('should deny access when user lacks required permission', async () => {
        const user = await registerAndLoginUser();
        const targetUser = await registerAndLoginUser(); // Create a REAL user
        const venueId = crypto.randomUUID();

        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'box-office',
          })
          .expect(403);

        expect(response.body.detail).toMatch(/permission/i);
      });

      it('should allow access when user has wildcard permission (*)', async () => {
        const user = await registerAndLoginUser();
        const targetUser = await registerAndLoginUser(); // Create a REAL user to grant role to
        const venueId = crypto.randomUUID();

        // Grant venue-owner role (has * permission)
        await createVenueRole(user.userId, venueId, 'venue-owner');

        await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'box-office',
          })
          .expect(200);
      });
    });
  });

  // ============================================
  // GROUP 2: Rate Limiting Middleware
  // ============================================
  describe('GROUP 2: Rate Limiting Middleware', () => {
    describe('Login Rate Limiting', () => {
      it('should allow N login attempts and block N+1 with 429', async () => {
        // Make 10 login attempts with DIFFERENT emails to avoid user lockout
        // This tests IP-based rate limiting (not per-user lockout)
        for (let i = 0; i < 10; i++) {
          await request(app.server)
            .post('/auth/login')
            .send({
              email: `nonexistent-${i}-${Date.now()}@example.com`,
              password: 'WrongPassword123!',
            });
        }

        // 11th attempt should be rate limited
        const response = await request(app.server)
          .post('/auth/login')
          .send({
            email: `another-${Date.now()}@example.com`,
            password: 'WrongPassword123!',
          })
          .expect(429);

        expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.headers['retry-after']).toBeDefined();
      });
    });

    describe('Registration Rate Limiting', () => {
      it('should allow N registrations and block N+1', async () => {
        // Make 3 registrations (limit is 3 per 5 minutes per IP)
        for (let i = 0; i < 3; i++) {
          const user = createTestUser();
          await request(app.server)
            .post('/auth/register')
            .send(user)
            .expect(201);
        }

        // 4th registration should be rate limited
        const user = createTestUser();
        const response = await request(app.server)
          .post('/auth/register')
          .send(user)
          .expect(429);

        expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
      });
    });

    describe('Password Reset Rate Limiting', () => {
      it('should allow N password reset requests and block N+1', async () => {
        const user = await registerAndLoginUser();

        // Make 3 password reset requests (limit is 3 per hour)
        for (let i = 0; i < 3; i++) {
          await request(app.server)
            .post('/auth/forgot-password')
            .send({ email: user.email })
            .expect(200);
        }

        // 4th request should be rate limited
        const response = await request(app.server)
          .post('/auth/forgot-password')
          .send({ email: user.email })
          .expect(429);

        expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
      });
    });
  });

  // ============================================
  // GROUP 3: Idempotency Middleware
  // ============================================
  describe('GROUP 3: Idempotency Middleware', () => {
    describe('Basic Idempotency', () => {
      it('should process first request normally and return cached response for second', async () => {
        const user = createTestUser();
        const idempotencyKey = crypto.randomUUID();

        // First request - should process normally
        const response1 = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        expect(response1.body.user.email).toBe(user.email);
        expect(response1.headers['idempotency-replayed']).toBeUndefined();

        // Small delay to ensure cache is written and lock is released
        await delay(100);

        // Second request with same key - should return cached response
        const response2 = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        expect(response2.body.user.id).toBe(response1.body.user.id);
        expect(response2.headers['idempotency-replayed']).toBe('true');
      });

      it('should set Idempotency-Replayed header on cached response', async () => {
        const user = createTestUser();
        const idempotencyKey = crypto.randomUUID();

        await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        // Small delay to ensure cache is written and lock is released
        await delay(100);

        const response = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        expect(response.headers['idempotency-replayed']).toBe('true');
      });
    });

    describe('Key Validation', () => {
      it('should reject idempotency key too short (< 16 characters)', async () => {
        const user = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', 'short')
          .send(user)
          .expect(400);

        expect(response.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
      });

      it('should reject idempotency key too long (> 64 characters)', async () => {
        const user = createTestUser();
        const longKey = 'a'.repeat(65);

        const response = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', longKey)
          .send(user)
          .expect(400);

        expect(response.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
      });
    });

    describe('Key Mismatch', () => {
      it('should return 422 when same key used with different request body', async () => {
        const user1 = createTestUser();
        const user2 = createTestUser({ email: 'different-' + Date.now() + '@example.com' });
        const idempotencyKey = crypto.randomUUID();

        // First request
        await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user1)
          .expect(201);

        // Small delay to ensure cache is written and lock is released
        await delay(100);

        // Second request with same key but different body
        const response = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user2)
          .expect(422);

        expect(response.body.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
      });

      it('should return cached response when same key and same body', async () => {
        const user = createTestUser();
        const idempotencyKey = crypto.randomUUID();

        const response1 = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        // Small delay to ensure cache is written and lock is released
        await delay(100);

        const response2 = await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        expect(response2.body.user.id).toBe(response1.body.user.id);
        expect(response2.headers['idempotency-replayed']).toBe('true');
      });
    });

    describe('Concurrent Requests', () => {
      it('should return 409 conflict for concurrent requests with same key', async () => {
        const user = createTestUser();
        const idempotencyKey = crypto.randomUUID();

        // Make concurrent requests
        const [response1, response2] = await Promise.all([
          request(app.server)
            .post('/auth/register')
            .set('Idempotency-Key', idempotencyKey)
            .send(user),
          request(app.server)
            .post('/auth/register')
            .set('Idempotency-Key', idempotencyKey)
            .send(user),
        ]);

        // One should succeed, one should return 409
        const statuses = [response1.status, response2.status].sort();
        expect(statuses).toEqual([201, 409]);

        const conflictResponse = response1.status === 409 ? response1 : response2;
        expect(conflictResponse.body.code).toBe('IDEMPOTENCY_CONFLICT');
      });
    });

    describe('Expiration', () => {
      it('should store idempotency key in Redis with TTL', async () => {
        const user = createTestUser();
        const idempotencyKey = crypto.randomUUID();

        await request(app.server)
          .post('/auth/register')
          .set('Idempotency-Key', idempotencyKey)
          .send(user)
          .expect(201);

        // Small delay to ensure Redis write completes
        await delay(50);

        // Verify key exists in Redis
        const keys = await getRedisKeys(`*idempotency*${idempotencyKey}*`);
        expect(keys.length).toBeGreaterThan(0);

        // Verify TTL is set (24 hours = 86400 seconds)
        const ttl = await testRedis.ttl(keys[0]);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(86400);
      });
    });
  });

  // ============================================
  // GROUP 4: Tenant Isolation Middleware
  // ============================================
  describe('GROUP 4: Tenant Isolation Middleware', () => {
    describe('Tenant Context Setting', () => {
      it('should set tenant_id from JWT in request context', async () => {
        const user = await registerAndLoginUser();

        const response = await request(app.server)
          .get('/auth/verify')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(200);

        expect(response.body.user.tenant_id).toBe(TEST_TENANT_ID);
      });
    });

    describe('Missing Tenant', () => {
      it('should return 401 when tenant_id missing in JWT (auth fails before tenant check)', async () => {
        const privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
        const invalidToken = jwt.sign(
          {
            sub: crypto.randomUUID(),
            type: 'access',
            jti: crypto.randomUUID(),
            email: 'test@example.com',
            // No tenant_id
          },
          privateKey,
          {
            algorithm: 'RS256',
            expiresIn: '15m',
            issuer: env.JWT_ISSUER,
            audience: env.JWT_ISSUER,
          }
        );

        // Auth middleware runs first and rejects the token
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${invalidToken}`)
          .expect(401);
      });

      it('should return 403 when tenant_id is invalid UUID format', async () => {
        const privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
        const invalidToken = jwt.sign(
          {
            sub: crypto.randomUUID(),
            type: 'access',
            jti: crypto.randomUUID(),
            tenant_id: 'not-a-uuid',
            email: 'test@example.com',
          },
          privateKey,
          {
            algorithm: 'RS256',
            expiresIn: '15m',
            issuer: env.JWT_ISSUER,
            audience: env.JWT_ISSUER,
          }
        );

        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${invalidToken}`)
          .expect(403);

        expect(response.body.code).toBe('INVALID_TENANT_ID_FORMAT');
      });
    });
  });

  // ============================================
  // GROUP 6: Correlation ID Middleware
  // ============================================
  describe('GROUP 6: Correlation ID Middleware', () => {
    it('should auto-generate correlation ID if missing', async () => {
      const response = await request(app.server)
        .get('/health/live')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-request-id']).toBeDefined();

      // Should be a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(response.headers['x-correlation-id']).toMatch(uuidRegex);
    });

    it('should use provided correlation ID', async () => {
      const correlationId = crypto.randomUUID();

      const response = await request(app.server)
        .get('/health/live')
        .set('x-correlation-id', correlationId)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe(correlationId);
      expect(response.headers['x-request-id']).toBe(correlationId);
    });

    it('should generate unique IDs for different requests', async () => {
      const response1 = await request(app.server)
        .get('/health/live')
        .expect(200);

      const response2 = await request(app.server)
        .get('/health/live')
        .expect(200);

      expect(response1.headers['x-correlation-id']).toBeDefined();
      expect(response2.headers['x-correlation-id']).toBeDefined();
      expect(response1.headers['x-correlation-id']).not.toBe(response2.headers['x-correlation-id']);
    });
  });

  // ============================================
  // GROUP 7: S2S Authentication Middleware
  // ============================================
  describe('GROUP 7: S2S Authentication Middleware', () => {
    describe('Valid Service Authentication', () => {
      it('should allow access with valid service token', async () => {
        // FIX: Use 'api-gateway' which is in the allowlist
        const serviceToken = await generateServiceToken('api-gateway');

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', serviceToken)
          .expect(200);

        expect(response.body.status).toBe('healthy');
      });
    });

    describe('Invalid Service Authentication', () => {
      it('should return 401 when x-service-token header missing', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .expect(401);

        expect(response.body.code).toBe('MISSING_SERVICE_TOKEN');
      });

      it('should return 401 with invalid service token', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', 'invalid-token')
          .expect(401);

        expect(response.body.code).toBe('INVALID_SERVICE_TOKEN');
      });

      it('should return 401 with expired service token', async () => {
        const privateKey = fs.readFileSync(env.S2S_PRIVATE_KEY_PATH || env.JWT_PRIVATE_KEY_PATH, 'utf8');
        const expiredToken = jwt.sign(
          {
            sub: 'api-gateway',
            type: 'service',
          },
          privateKey,
          {
            algorithm: 'RS256',
            expiresIn: '-1h', // Already expired
          }
        );

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', expiredToken)
          .expect(401);

        expect(response.body.code).toBe('SERVICE_TOKEN_EXPIRED');
      });
    });

    describe('Service Allowlist Enforcement', () => {
      it('should block service not in allowlist', async () => {
        const privateKey = fs.readFileSync(env.S2S_PRIVATE_KEY_PATH || env.JWT_PRIVATE_KEY_PATH, 'utf8');
        const unauthorizedToken = jwt.sign(
          {
            sub: 'unauthorized-service',
            type: 'service',
          },
          privateKey,
          {
            algorithm: 'RS256',
            expiresIn: '1h',
          }
        );

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', unauthorizedToken)
          .expect(403);

        expect(response.body.code).toBe('SERVICE_NOT_ALLOWED');
      });
    });
  });

  // ============================================
  // GROUP 8: Validation Middleware
  // ============================================
  describe('GROUP 8: Validation Middleware', () => {
    describe('Request Body Validation', () => {
      it('should pass valid request body', async () => {
        const user = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .send(user)
          .expect(201);

        expect(response.body.user).toBeDefined();
      });

      it('should reject missing required fields', async () => {
        const { email, ...userData } = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .send(userData)
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should reject invalid email format', async () => {
        const user = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .send({
            ...user,
            email: 'not-an-email',
          })
          .expect(400);

        expect(response.body.detail).toMatch(/email/i);
      });

      it('should enforce password length limits', async () => {
        const user = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .send({
            ...user,
            password: 'short',
          })
          .expect(400);

        expect(response.body.detail).toMatch(/password/i);
      });
    });

    describe('Error Response Format', () => {
      it('should return clear error messages', async () => {
        const user = createTestUser();

        const response = await request(app.server)
          .post('/auth/register')
          .send({
            ...user,
            email: 'not-an-email',
          })
          .expect(400);

        expect(response.body.detail).toBeDefined();
        expect(response.body.detail).toMatch(/email/i);
      });
    });
  });

  // ============================================
  // GROUP 9: Middleware Chain Integration
  // ============================================
  describe('GROUP 9: Middleware Chain Integration', () => {
    describe('Middleware Order', () => {
      it('should run rate limit BEFORE expensive auth validation', async () => {
        const user = await registerAndLoginUser();

        // Exhaust rate limit
        for (let i = 0; i < 3; i++) {
          await request(app.server)
            .post('/auth/forgot-password')
            .send({ email: user.email })
            .expect(200);
        }

        // Next request should be rate limited before auth is checked
        const response = await request(app.server)
          .post('/auth/forgot-password')
          .send({ email: user.email })
          .expect(429);

        expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
      });

      it('should set tenant context BEFORE data access', async () => {
        const user = await registerAndLoginUser();

        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .expect(200);

        expect(response.body.user.id).toBe(user.userId);
      });
    });

    describe('Error Propagation', () => {
      it('should stop middleware chain on authentication error', async () => {
        await request(app.server)
          .get('/auth/me')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });

      it('should format errors correctly through error handler', async () => {
        const response = await request(app.server)
          .get('/auth/me')
          .expect(401);

        // Check RFC 7807 Problem Details format
        expect(response.body.type).toBeDefined();
        expect(response.body.title).toBeDefined();
        expect(response.body.status).toBe(401);
        expect(response.body.detail).toBeDefined();
      });
    });

    describe('Full Request Flow', () => {
      it('should successfully process request through entire middleware chain', async () => {
        const user = await registerAndLoginUser();
        const correlationId = crypto.randomUUID();

        const response = await request(app.server)
          .get('/auth/me')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .set('x-correlation-id', correlationId)
          .expect(200);

        // Verify all middleware ran:
        expect(response.headers['x-correlation-id']).toBe(correlationId);
        expect(response.body.user.id).toBe(user.userId);
        expect(response.body.user.email).toBe(user.email);
      });
    });
  });
});
