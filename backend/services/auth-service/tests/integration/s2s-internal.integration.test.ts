import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
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
import { generateServiceToken } from '../../src/middleware/s2s.middleware';

let app: any;

// ============================================
// TEST HELPERS
// ============================================

const createUserInDb = async (overrides: Partial<any> = {}): Promise<any> => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const email = overrides.email || `test-${timestamp}-${random}@example.com`;

  const result = await testPool.query(
    `INSERT INTO users (
      email, password_hash, first_name, last_name, tenant_id,
      role, status, email_verified, mfa_enabled, permissions,
      phone, avatar_url, billing_address, deleted_at, name,
      identity_verified, stripe_connect_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      email,
      overrides.password_hash || '$2b$10$dummyhashedpasswordfortest',
      overrides.first_name ?? 'Test',
      overrides.last_name ?? 'User',
      overrides.tenant_id || TEST_TENANT_ID,
      overrides.role || 'user',
      overrides.status || 'ACTIVE',
      overrides.email_verified ?? false,
      overrides.mfa_enabled ?? false,
      JSON.stringify(overrides.permissions || []),
      overrides.phone || null,
      overrides.avatar_url || null,
      overrides.billing_address || null,
      overrides.deleted_at || null,
      overrides.name || null,
      overrides.identity_verified ?? false,
      overrides.stripe_connect_status || 'not_started',
    ]
  );
  return result.rows[0];
};

const createVenueRole = async (
  userId: string,
  venueId: string,
  role: string,
  options: { isActive?: boolean; expiresAt?: Date; tenantId?: string } = {}
): Promise<any> => {
  const result = await testPool.query(
    `INSERT INTO user_venue_roles (user_id, venue_id, role, is_active, expires_at, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      venueId,
      role,
      options.isActive ?? true,
      options.expiresAt || null,
      options.tenantId || TEST_TENANT_ID,
    ]
  );
  return result.rows[0];
};

const createOtherTenant = async (): Promise<any> => {
  const result = await testPool.query(
    `INSERT INTO tenants (id, name, slug, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      '00000000-0000-0000-0000-000000000002',
      'Other Tenant',
      'other-tenant',
      'active',
    ]
  );
  if (result.rows.length === 0) {
    const existing = await testPool.query(
      `SELECT * FROM tenants WHERE id = $1`,
      ['00000000-0000-0000-0000-000000000002']
    );
    return existing.rows[0];
  }
  return result.rows[0];
};

/**
 * Get the private key using the SAME resolution order as the S2S middleware.
 * This ensures tokens generated in tests are verifiable by the middleware.
 * 
 * Resolution order (matches s2s.middleware.ts S2SKeyManager):
 * 1. S2S_PRIVATE_KEY env var
 * 2. S2S_PRIVATE_KEY_PATH file
 * 3. JWT_PRIVATE_KEY env var (fallback in dev)
 * 4. JWT_PRIVATE_KEY_PATH file (fallback in dev)
 */
const getPrivateKey = async (): Promise<string> => {
  const { env } = await import('../../src/config/env');

  // 1. Try S2S env var first
  if (env.S2S_PRIVATE_KEY) {
    return env.S2S_PRIVATE_KEY.includes('-----BEGIN')
      ? env.S2S_PRIVATE_KEY
      : Buffer.from(env.S2S_PRIVATE_KEY, 'base64').toString('utf8');
  }

  // 2. Try S2S key file
  try {
    const s2sKey = fs.readFileSync(env.S2S_PRIVATE_KEY_PATH, 'utf8');
    return s2sKey;
  } catch {
    // S2S key file not found, fall back to JWT keys
  }

  // 3. Try JWT env var (dev fallback)
  if (env.JWT_PRIVATE_KEY) {
    return env.JWT_PRIVATE_KEY.includes('-----BEGIN')
      ? env.JWT_PRIVATE_KEY
      : Buffer.from(env.JWT_PRIVATE_KEY, 'base64').toString('utf8');
  }

  // 4. Try JWT key file (dev fallback)
  return fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
};

const generateExpiredToken = async (serviceName: string): Promise<string> => {
  const privateKey = await getPrivateKey();
  return jwt.sign(
    { sub: serviceName, type: 'service' },
    privateKey,
    { algorithm: 'RS256', expiresIn: '-1h' }
  );
};

const generateCustomToken = async (payload: any, options: jwt.SignOptions = {}): Promise<string> => {
  const privateKey = await getPrivateKey();
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h', ...options });
};

const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000099';

// ============================================
// MAIN TEST SUITE
// ============================================

describe('S2S Internal API Integration Tests', () => {
  let apiGatewayToken: string;
  let ticketServiceToken: string;
  let paymentServiceToken: string;
  let notificationServiceToken: string;

  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();

    apiGatewayToken = await generateServiceToken('api-gateway');
    ticketServiceToken = await generateServiceToken('ticket-service');
    paymentServiceToken = await generateServiceToken('payment-service');
    notificationServiceToken = await generateServiceToken('notification-service');
  }, 30000);

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  }, 30000);

  // ============================================
  // SECTION 1: S2S AUTHENTICATION MIDDLEWARE (15 tests)
  // ============================================

  describe('S2S Authentication Middleware', () => {
    describe('Token Presence', () => {
      it('1. should return 401 MISSING_SERVICE_TOKEN when header is missing', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .expect(401);

        expect(response.body.code).toBe('MISSING_SERVICE_TOKEN');
        expect(response.body.error).toMatch(/service authentication required/i);
      });

      it('2. should return 401 MISSING_SERVICE_TOKEN for empty string token', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', '')
          .expect(401);

        expect(response.body.code).toBe('MISSING_SERVICE_TOKEN');
      });
    });

    describe('Token Validity', () => {
      it('3. should return 401 INVALID_SERVICE_TOKEN for malformed token', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', 'not-a-valid-jwt')
          .expect(401);

        expect(response.body.code).toBe('INVALID_SERVICE_TOKEN');
      });

      it('4. should return 401 INVALID_SERVICE_TOKEN for token signed with wrong key', async () => {
        const wrongKeyToken = jwt.sign(
          { sub: 'api-gateway', type: 'service' },
          'wrong-secret-key',
          { algorithm: 'HS256', expiresIn: '1h' }
        );

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', wrongKeyToken)
          .expect(401);

        expect(response.body.code).toBe('INVALID_SERVICE_TOKEN');
      });

      it('5. should return 401 SERVICE_TOKEN_EXPIRED for expired token', async () => {
        const expiredToken = await generateExpiredToken('api-gateway');

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', expiredToken)
          .expect(401);

        expect(response.body.code).toBe('SERVICE_TOKEN_EXPIRED');
      });

      it('6. should return 401 INVALID_SERVICE_TOKEN for token with type user instead of service', async () => {
        const userTypeToken = await generateCustomToken({
          sub: 'api-gateway',
          type: 'user',
        });

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', userTypeToken)
          .expect(401);

        expect(response.body.code).toBe('INVALID_SERVICE_TOKEN');
      });

      it('7. should return 401 INVALID_SERVICE_TOKEN for token with missing type field', async () => {
        const noTypeToken = await generateCustomToken({
          sub: 'api-gateway',
        });

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', noTypeToken)
          .expect(401);

        expect(response.body.code).toBe('INVALID_SERVICE_TOKEN');
      });

      it('8. should return 401 or 403 for token with missing sub field', async () => {
        const noSubToken = await generateCustomToken({
          type: 'service',
        });

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', noSubToken);

        expect([401, 403]).toContain(response.statusCode);
      });
    });

    describe('Service Allowlist', () => {
      it('9. should return 403 SERVICE_NOT_ALLOWED for unknown service', async () => {
        const unknownServiceToken = await generateCustomToken({
          sub: 'unknown-service',
          type: 'service',
        });

        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', unknownServiceToken)
          .expect(403);

        expect(response.body.code).toBe('SERVICE_NOT_ALLOWED');
      });

      it('10. should allow api-gateway to access /internal/health (wildcard)', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.status).toBe('healthy');
      });

      it('11. should allow api-gateway to access /internal/users/:id (wildcard)', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user).toBeDefined();
      });

      it('12. should allow ticket-service to access /internal/validate-permissions', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', ticketServiceToken)
          .send({ userId: user.id, permissions: ['tickets:read'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('13. should deny ticket-service access to /internal/users/:id', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', ticketServiceToken)
          .expect(403);

        expect(response.body.code).toBe('SERVICE_NOT_ALLOWED');
      });

      it('14. should deny notification-service access to /internal/health', async () => {
        const response = await request(app.server)
          .get('/auth/internal/health')
          .set('x-service-token', notificationServiceToken)
          .expect(403);

        expect(response.body.code).toBe('SERVICE_NOT_ALLOWED');
      });

      it('15. should allow payment-service to access /internal/validate-permissions', async () => {
        const user = await createUserInDb({ permissions: ['payments:read'] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', paymentServiceToken)
          .send({ userId: user.id, permissions: ['payments:read'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });
    });
  });

  // ============================================
  // SECTION 2: GET /internal/health (3 tests)
  // ============================================

  describe('GET /internal/health', () => {
    it('16. should return status healthy', async () => {
      const response = await request(app.server)
        .get('/auth/internal/health')
        .set('x-service-token', apiGatewayToken)
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('17. should return service name auth-service', async () => {
      const response = await request(app.server)
        .get('/auth/internal/health')
        .set('x-service-token', apiGatewayToken)
        .expect(200);

      expect(response.body.service).toBe('auth-service');
    });

    it('18. should return valid ISO timestamp', async () => {
      const response = await request(app.server)
        .get('/auth/internal/health')
        .set('x-service-token', apiGatewayToken)
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      const parsed = new Date(response.body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // ============================================
  // SECTION 3: POST /internal/validate-permissions (18 tests)
  // ============================================

  describe('POST /internal/validate-permissions', () => {
    describe('Permission Matching', () => {
      it('19. should return valid true when user has exact required permission', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('20. should return valid true when user has superset of permissions', async () => {
        const user = await createUserInDb({
          permissions: ['tickets:read', 'tickets:write', 'tickets:delete'],
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('21. should return valid true when user needs multiple and has all', async () => {
        const user = await createUserInDb({
          permissions: ['tickets:read', 'tickets:write'],
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read', 'tickets:write'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('22. should return valid false when user needs multiple but missing one', async () => {
        const user = await createUserInDb({
          permissions: ['tickets:read'],
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read', 'tickets:write'] })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });

      it('23. should return valid false when user has no matching permissions', async () => {
        const user = await createUserInDb({
          permissions: ['events:read'],
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read'] })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });
    });

    describe('Role Bypasses', () => {
      it('24. should return valid true for admin role regardless of permissions', async () => {
        const user = await createUserInDb({ role: 'admin', permissions: [] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['any:permission'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('25. should return valid true for superadmin role regardless of permissions', async () => {
        const user = await createUserInDb({ role: 'superadmin', permissions: [] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['any:permission'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });

      it('26. should return valid true for wildcard permission', async () => {
        const user = await createUserInDb({ role: 'user', permissions: ['*'] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['anything:here'] })
          .expect(200);

        expect(response.body.valid).toBe(true);
      });
    });

    describe('User States', () => {
      it('27. should return valid false with reason for non-existent user', async () => {
        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: '00000000-0000-0000-0000-000000000999',
            permissions: ['any:permission'],
          })
          .expect(200);

        expect(response.body.valid).toBe(false);
        expect(response.body.reason).toBe('User not found');
      });

      it('28. should return valid false for soft-deleted user', async () => {
        const user = await createUserInDb({
          permissions: ['tickets:read'],
          deleted_at: new Date(),
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['tickets:read'] })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });

      it('29. should handle user with null permissions gracefully', async () => {
        // Insert user with NULL permissions directly
        const result = await testPool.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, role, status, permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           RETURNING *`,
          [
            `null-perms-${Date.now()}@test.com`,
            '$2b$10$dummy',
            'Test',
            'User',
            TEST_TENANT_ID,
            'user',
            'ACTIVE',
          ]
        );
        const user = result.rows[0];

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['any:permission'] })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });

      it('30. should return valid false for user with empty permissions array', async () => {
        const user = await createUserInDb({ permissions: [] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['any:permission'] })
          .expect(200);

        expect(response.body.valid).toBe(false);
      });
    });

    describe('Venue Roles', () => {
      it('31. should return venueRole when user has active venue role', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });
        await createVenueRole(user.id, TEST_VENUE_ID, 'venue_manager');

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: user.id,
            permissions: ['tickets:read'],
            venueId: TEST_VENUE_ID,
          })
          .expect(200);

        expect(response.body.venueRole).toBe('venue_manager');
      });

      it('32. should return null venueRole when no role exists', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: user.id,
            permissions: ['tickets:read'],
            venueId: TEST_VENUE_ID,
          })
          .expect(200);

        expect(response.body.venueRole).toBeNull();
      });

      it('33. should return null venueRole when role is_active is false', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });
        await createVenueRole(user.id, TEST_VENUE_ID, 'venue_manager', { isActive: false });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: user.id,
            permissions: ['tickets:read'],
            venueId: TEST_VENUE_ID,
          })
          .expect(200);

        expect(response.body.venueRole).toBeNull();
      });

      it('34. should return null venueRole when role is expired', async () => {
        const user = await createUserInDb({ permissions: ['tickets:read'] });
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
        await createVenueRole(user.id, TEST_VENUE_ID, 'venue_manager', { expiresAt: pastDate });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: user.id,
            permissions: ['tickets:read'],
            venueId: TEST_VENUE_ID,
          })
          .expect(200);

        expect(response.body.venueRole).toBeNull();
      });
    });

    describe('Response Shape', () => {
      it('35. should include userId, role, tenantId in response', async () => {
        const user = await createUserInDb({ role: 'admin', permissions: [] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({ userId: user.id, permissions: ['any:permission'] })
          .expect(200);

        expect(response.body.userId).toBe(user.id);
        expect(response.body.role).toBe('admin');
        expect(response.body.tenantId).toBe(TEST_TENANT_ID);
      });

      it('36. should include venueRole in response when venueId provided', async () => {
        const user = await createUserInDb({ permissions: [] });

        const response = await request(app.server)
          .post('/auth/internal/validate-permissions')
          .set('x-service-token', apiGatewayToken)
          .send({
            userId: user.id,
            permissions: [],
            venueId: TEST_VENUE_ID,
          })
          .expect(200);

        expect(response.body).toHaveProperty('venueRole');
      });
    });
  });

  // ============================================
  // SECTION 4: POST /internal/validate-users (12 tests)
  // ============================================

  describe('POST /internal/validate-users', () => {
    describe('Happy Paths', () => {
      it('37. should return all users when all found', async () => {
        const user1 = await createUserInDb({ email: 'user1@test.com' });
        const user2 = await createUserInDb({ email: 'user2@test.com' });
        const user3 = await createUserInDb({ email: 'user3@test.com' });

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user1.id, user2.id, user3.id] })
          .expect(200);

        expect(response.body.users).toHaveLength(3);
        expect(response.body.found).toBe(3);
        expect(response.body.requested).toBe(3);
      });

      it('38. should return single user in array', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users).toHaveLength(1);
        expect(response.body.users[0].id).toBe(user.id);
      });
    });

    describe('Partial Results', () => {
      it('39. should return partial results with correct counts', async () => {
        const user1 = await createUserInDb();
        const user2 = await createUserInDb();

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({
            userIds: [
              user1.id,
              user2.id,
              '00000000-0000-0000-0000-000000000999',
            ],
          })
          .expect(200);

        expect(response.body.users).toHaveLength(2);
        expect(response.body.found).toBe(2);
        expect(response.body.requested).toBe(3);
      });

      it('40. should return empty when none found', async () => {
        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({
            userIds: [
              '00000000-0000-0000-0000-000000000997',
              '00000000-0000-0000-0000-000000000998',
            ],
          })
          .expect(200);

        expect(response.body.users).toHaveLength(0);
        expect(response.body.found).toBe(0);
      });
    });

    describe('Input Validation', () => {
      it('41. should return empty array for empty userIds', async () => {
        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [] })
          .expect(200);

        expect(response.body.users).toEqual([]);
      });

      it('42. should return empty array for undefined userIds', async () => {
        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({})
          .expect(200);

        expect(response.body.users).toEqual([]);
      });

      it('43. should succeed with exactly 100 users', async () => {
        const userIds = Array.from({ length: 100 }, (_, i) =>
          `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        );

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds })
          .expect(200);

        expect(response.body.requested).toBe(100);
      });

      it('44. should reject more than 100 users', async () => {
        const userIds = Array.from({ length: 101 }, (_, i) =>
          `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        );

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds })
          .expect(400);

        expect(response.body.error).toMatch(/maximum 100/i);
      });
    });

    describe('Filtering', () => {
      it('45. should exclude soft-deleted users from results', async () => {
        const activeUser = await createUserInDb({ email: 'active@test.com' });
        const deletedUser = await createUserInDb({
          email: 'deleted@test.com',
          deleted_at: new Date(),
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [activeUser.id, deletedUser.id] })
          .expect(200);

        expect(response.body.users).toHaveLength(1);
        expect(response.body.users[0].id).toBe(activeUser.id);
      });

      it('46. should only return non-deleted users matching IDs', async () => {
        const user1 = await createUserInDb({ email: 'keep1@test.com' });
        const user2 = await createUserInDb({ email: 'keep2@test.com' });
        await createUserInDb({ email: 'other@test.com' }); // Not in request

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user1.id, user2.id] })
          .expect(200);

        expect(response.body.users).toHaveLength(2);
        const ids = response.body.users.map((u: any) => u.id);
        expect(ids).toContain(user1.id);
        expect(ids).toContain(user2.id);
      });
    });

    describe('Response Shape', () => {
      it('47. should return correct fields for each user', async () => {
        const user = await createUserInDb({
          email: 'shape@test.com',
          role: 'admin',
          email_verified: true,
          mfa_enabled: true,
        });

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        const returnedUser = response.body.users[0];
        expect(returnedUser.id).toBe(user.id);
        expect(returnedUser.email).toBe('shape@test.com');
        expect(returnedUser.role).toBe('admin');
        expect(returnedUser.tenant_id).toBe(TEST_TENANT_ID);
        expect(returnedUser.email_verified).toBe(true);
        expect(returnedUser.mfa_enabled).toBe(true);
      });

      it('48. should return users, found, requested in response', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .post('/auth/internal/validate-users')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body).toHaveProperty('users');
        expect(response.body).toHaveProperty('found');
        expect(response.body).toHaveProperty('requested');
      });
    });
  });

  // ============================================
  // SECTION 5: GET /internal/user-tenant/:userId (5 tests)
  // ============================================

  describe('GET /internal/user-tenant/:userId', () => {
    it('49. should return user tenant information', async () => {
      const user = await createUserInDb();

      const response = await request(app.server)
        .get(`/auth/internal/user-tenant/${user.id}`)
        .set('x-service-token', apiGatewayToken)
        .expect(200);

      expect(response.body.id).toBe(user.id);
      expect(response.body.tenant_id).toBe(TEST_TENANT_ID);
      expect(response.body.tenant_name).toBeDefined();
      expect(response.body.tenant_slug).toBeDefined();
    });

    it('50. should return 404 for non-existent user', async () => {
      const response = await request(app.server)
        .get('/auth/internal/user-tenant/00000000-0000-0000-0000-000000000999')
        .set('x-service-token', apiGatewayToken)
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);
    });

    it('51. should return 404 for soft-deleted user', async () => {
      const user = await createUserInDb({ deleted_at: new Date() });

      const response = await request(app.server)
        .get(`/auth/internal/user-tenant/${user.id}`)
        .set('x-service-token', apiGatewayToken)
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);
    });

    it('52. should join tenant table correctly', async () => {
      const user = await createUserInDb();

      const response = await request(app.server)
        .get(`/auth/internal/user-tenant/${user.id}`)
        .set('x-service-token', apiGatewayToken)
        .expect(200);

      expect(response.body.tenant_name).toBe('Default Tenant');
      expect(response.body.tenant_slug).toBe('default');
    });

    it('53. should handle invalid UUID gracefully', async () => {
      const response = await request(app.server)
        .get('/auth/internal/user-tenant/not-a-uuid')
        .set('x-service-token', apiGatewayToken);

      // Should return 404 or 500, not crash
      expect([404, 500]).toContain(response.statusCode);
    });
  });

  // ============================================
  // SECTION 6: GET /internal/users/:userId (10 tests)
  // ============================================

  describe('GET /internal/users/:userId', () => {
    describe('Happy Path', () => {
      it('54. should return user details', async () => {
        const user = await createUserInDb({
          email: 'details@test.com',
          first_name: 'John',
          last_name: 'Doe',
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user).toBeDefined();
        expect(response.body.user.id).toBe(user.id);
      });

      it('55. should return all expected fields', async () => {
        const user = await createUserInDb({
          email: 'fields@test.com',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'admin',
          status: 'ACTIVE',
          email_verified: true,
          mfa_enabled: true,
          phone: '+15551234567',
          avatar_url: 'https://example.com/avatar.jpg',
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        const u = response.body.user;
        expect(u.id).toBe(user.id);
        expect(u.email).toBe('fields@test.com');
        expect(u.firstName).toBe('Jane');
        expect(u.lastName).toBe('Smith');
        expect(u.tenantId).toBe(TEST_TENANT_ID);
        expect(u.role).toBe('admin');
        expect(u.status).toBe('ACTIVE');
        expect(u.emailVerified).toBe(true);
        expect(u.mfaEnabled).toBe(true);
        expect(u.phone).toBe('+15551234567');
        expect(u.avatarUrl).toBe('https://example.com/avatar.jpg');
        expect(u.createdAt).toBeDefined();
      });
    });

    describe('Error Cases', () => {
      it('56. should return 404 for non-existent user', async () => {
        const response = await request(app.server)
          .get('/auth/internal/users/00000000-0000-0000-0000-000000000999')
          .set('x-service-token', apiGatewayToken)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });

      it('57. should return 404 for soft-deleted user', async () => {
        const user = await createUserInDb({ deleted_at: new Date() });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });
    });

    describe('x-tenant-id Header', () => {
      it('58. should return user when x-tenant-id matches', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', TEST_TENANT_ID)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
      });

      it('59. should return 404 when x-tenant-id does not match', async () => {
        const user = await createUserInDb();
        await createOtherTenant();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', OTHER_TENANT_ID)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });

      it('60. should return user when x-tenant-id header is not provided', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
      });
    });

    describe('Edge Cases', () => {
      it('61. should handle user with NULL first_name and last_name', async () => {
        const user = await createUserInDb({
          first_name: null,
          last_name: null,
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user.name).toBeDefined();
      });

      it('62. should handle user with all optional fields NULL', async () => {
        const user = await createUserInDb({
          phone: null,
          avatar_url: null,
          billing_address: null,
          name: null,
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
      });

      it('63. should construct name from first_name and last_name when name is NULL', async () => {
        const user = await createUserInDb({
          first_name: 'John',
          last_name: 'Doe',
          name: null,
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user.name).toBe('John Doe');
      });
    });
  });

  // ============================================
  // SECTION 7: GET /internal/users/by-email/:email (11 tests)
  // ============================================

  describe('GET /internal/users/by-email/:email', () => {
    describe('Happy Path', () => {
      it('64. should return user when email found', async () => {
        const user = await createUserInDb({ email: 'findme@test.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('findme@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user).toBeDefined();
        expect(response.body.user.id).toBe(user.id);
      });

      it('65. should return expected fields', async () => {
        const user = await createUserInDb({
          email: 'fields@test.com',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'admin',
          status: 'ACTIVE',
          email_verified: true,
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('fields@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.user.id).toBe(user.id);
        expect(response.body.user.email).toBe('fields@test.com');
        expect(response.body.user.tenantId).toBe(TEST_TENANT_ID);
        expect(response.body.user.role).toBe('admin');
        expect(response.body.user.status).toBe('ACTIVE');
        expect(response.body.user.emailVerified).toBe(true);
      });
    });

    describe('Not Found', () => {
      it('66. should return found false for non-existent email', async () => {
        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('nonexistent@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(false);
        expect(response.body.user).toBeNull();
      });

      it('67. should return found false for soft-deleted user email', async () => {
        await createUserInDb({
          email: 'deleted@test.com',
          deleted_at: new Date(),
        });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('deleted@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(false);
        expect(response.body.user).toBeNull();
      });
    });

    describe('Validation', () => {
      it('68. should return 400 for invalid email format', async () => {
        const response = await request(app.server)
          .get('/auth/internal/users/by-email/not-an-email')
          .set('x-service-token', apiGatewayToken)
          .expect(400);

        expect(response.body.error).toMatch(/invalid email/i);
      });
    });

    describe('URL Encoding and Case Sensitivity', () => {
      it('69. should handle email with plus character', async () => {
        const user = await createUserInDb({ email: 'test+plus@test.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('test+plus@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user.id).toBe(user.id);
      });

      it('70. should be case insensitive', async () => {
        const user = await createUserInDb({ email: 'lowercase@test.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('LOWERCASE@TEST.COM')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user.id).toBe(user.id);
      });

      it('71. should handle email with dots and dashes', async () => {
        const user = await createUserInDb({ email: 'test.user-name@test-domain.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('test.user-name@test-domain.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user.id).toBe(user.id);
      });
    });

    describe('x-tenant-id Header', () => {
      it('72. should return user when tenant matches', async () => {
        const user = await createUserInDb({ email: 'tenant-match@test.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('tenant-match@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', TEST_TENANT_ID)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user.id).toBe(user.id);
      });

      it('73. should return found false when tenant does not match', async () => {
        await createUserInDb({ email: 'tenant-mismatch@test.com' });
        await createOtherTenant();

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('tenant-mismatch@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', OTHER_TENANT_ID)
          .expect(200);

        expect(response.body.found).toBe(false);
      });

      it('74. should return user when header is not provided', async () => {
        const user = await createUserInDb({ email: 'no-header@test.com' });

        const response = await request(app.server)
          .get(`/auth/internal/users/by-email/${encodeURIComponent('no-header@test.com')}`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.found).toBe(true);
        expect(response.body.user.id).toBe(user.id);
      });
    });
  });

  // ============================================
  // SECTION 8: GET /internal/users/admins (12 tests)
  // ============================================

  describe('GET /internal/users/admins', () => {
    describe('Happy Path', () => {
      it('75. should return admin users for tenant', async () => {
        await createUserInDb({ email: 'admin1@test.com', role: 'admin' });
        await createUserInDb({ email: 'admin2@test.com', role: 'superadmin' });
        await createUserInDb({ email: 'user@test.com', role: 'user' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        expect(response.body.users.length).toBeGreaterThanOrEqual(2);
        const roles = response.body.users.map((u: any) => u.role);
        expect(roles).toContain('admin');
        expect(roles).toContain('superadmin');
      });
    });

    describe('Role Filtering', () => {
      it('76. should use default roles when none specified', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        expect(response.body.rolesQueried).toContain('admin');
        expect(response.body.rolesQueried).toContain('superadmin');
      });

      it('77. should filter by single role param', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });
        await createUserInDb({ email: 'super@test.com', role: 'superadmin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID, roles: 'admin' })
          .expect(200);

        response.body.users.forEach((u: any) => {
          expect(u.role).toBe('admin');
        });
      });

      it('78. should filter by multiple roles', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });
        await createUserInDb({ email: 'super@test.com', role: 'superadmin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID, roles: 'admin,superadmin' })
          .expect(200);

        expect(response.body.rolesQueried).toContain('admin');
        expect(response.body.rolesQueried).toContain('superadmin');
      });

      it('79. should return 400 for all invalid roles', async () => {
        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID, roles: 'hacker,invalid' })
          .expect(400);

        expect(response.body.error).toMatch(/no valid roles/i);
      });

      it('80. should use valid roles and ignore invalid ones', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID, roles: 'admin,invalid,hacker' })
          .expect(200);

        expect(response.body.rolesQueried).toContain('admin');
        expect(response.body.rolesQueried).not.toContain('invalid');
        expect(response.body.rolesQueried).not.toContain('hacker');
      });
    });

    describe('Tenant Handling', () => {
      it('81. should filter by tenantId query param', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        expect(response.body.tenantId).toBe(TEST_TENANT_ID);
      });

      it('82. should use x-tenant-id header when query param not provided', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', TEST_TENANT_ID)
          .expect(200);

        expect(response.body.tenantId).toBe(TEST_TENANT_ID);
      });

      it('83. should return 400 when neither tenantId param nor header provided', async () => {
        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .expect(400);

        expect(response.body.error).toMatch(/tenantId required/i);
      });
    });

    describe('Filtering', () => {
      it('84. should only return active status users', async () => {
        await createUserInDb({ email: 'active-admin@test.com', role: 'admin', status: 'ACTIVE' });
        await createUserInDb({ email: 'suspended-admin@test.com', role: 'admin', status: 'SUSPENDED' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        response.body.users.forEach((u: any) => {
          expect(u.status).toBe('ACTIVE');
        });
      });

      it('85. should exclude soft-deleted users', async () => {
        await createUserInDb({ email: 'active-admin@test.com', role: 'admin' });
        await createUserInDb({
          email: 'deleted-admin@test.com',
          role: 'admin',
          deleted_at: new Date(),
        });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        const emails = response.body.users.map((u: any) => u.email);
        expect(emails).toContain('active-admin@test.com');
        expect(emails).not.toContain('deleted-admin@test.com');
      });

      it('86. should include count and rolesQueried in response', async () => {
        await createUserInDb({ email: 'admin@test.com', role: 'admin' });

        const response = await request(app.server)
          .get('/auth/internal/users/admins')
          .set('x-service-token', apiGatewayToken)
          .query({ tenantId: TEST_TENANT_ID })
          .expect(200);

        expect(response.body.count).toBeDefined();
        expect(response.body.rolesQueried).toBeDefined();
        expect(Array.isArray(response.body.rolesQueried)).toBe(true);
      });
    });
  });

  // ============================================
  // SECTION 9: GET /internal/users/:userId/chargeback-count (10 tests)
  // ============================================

  describe('GET /internal/users/:userId/chargeback-count', () => {
    describe('Happy Path', () => {
      it('87. should return chargebackData structure', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.chargebackData).toBeDefined();
        expect(response.body.chargebackData.totalChargebacks).toBeDefined();
        expect(response.body.chargebackData.chargebacksInPeriod).toBeDefined();
      });

      it('88. should return accountAge in days', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.accountAge).toBeDefined();
        expect(typeof response.body.accountAge).toBe('number');
      });

      it('89. should return userStatus from user record', async () => {
        const user = await createUserInDb({ status: 'ACTIVE' });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.userStatus).toBe('ACTIVE');
      });
    });

    describe('Query Params', () => {
      it('90. should default to 12 months when monthsBack not provided', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.periodMonths).toBe(12);
      });

      it('91. should use monthsBack param when provided', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .query({ monthsBack: '6' })
          .expect(200);

        expect(response.body.periodMonths).toBe(6);
      });
    });

    describe('Error Cases', () => {
      it('92. should return 404 for non-existent user', async () => {
        const response = await request(app.server)
          .get('/auth/internal/users/00000000-0000-0000-0000-000000000999/chargeback-count')
          .set('x-service-token', apiGatewayToken)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });

      it('93. should return 404 for soft-deleted user', async () => {
        const user = await createUserInDb({ deleted_at: new Date() });

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });
    });

    describe('x-tenant-id Header', () => {
      it('94. should return data when tenant matches', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', TEST_TENANT_ID)
          .expect(200);

        expect(response.body.userId).toBe(user.id);
      });

      it('95. should return 404 when tenant does not match', async () => {
        const user = await createUserInDb();
        await createOtherTenant();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', OTHER_TENANT_ID)
          .expect(404);

        expect(response.body.error).toMatch(/not found/i);
      });
    });

    describe('Missing Table Handling', () => {
      it('96. should return defaults when user_chargeback_summary table does not exist', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .get(`/auth/internal/users/${user.id}/chargeback-count`)
          .set('x-service-token', apiGatewayToken)
          .expect(200);

        expect(response.body.chargebackData.totalChargebacks).toBe(0);
        expect(response.body.chargebackData.chargebacksInPeriod).toBe(0);
        expect(response.body.chargebackData.totalChargebackAmountCents).toBe(0);
      });
    });
  });

  // ============================================
  // SECTION 10: POST /internal/users/batch-verification-check (14 tests)
  // ============================================

  describe('POST /internal/users/batch-verification-check', () => {
    describe('Happy Path', () => {
      it('97. should return verification map for all users', async () => {
        const user1 = await createUserInDb({
          email: 'verified1@test.com',
          email_verified: true,
          identity_verified: true,
        });
        const user2 = await createUserInDb({
          email: 'unverified@test.com',
          email_verified: false,
          identity_verified: false,
        });

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user1.id, user2.id] })
          .expect(200);

        expect(response.body.users).toBeDefined();
        expect(response.body.users[user1.id]).toBeDefined();
        expect(response.body.users[user2.id]).toBeDefined();
      });

      it('98. should return expected fields for each user', async () => {
        const user = await createUserInDb({
          email: 'check@test.com',
          email_verified: true,
          identity_verified: true,
          mfa_enabled: true,
        });

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        const userData = response.body.users[user.id];
        expect(userData.userId).toBe(user.id);
        expect(userData.email).toBe('check@test.com');
        expect(userData.identityVerified).toBe(true);
        expect(userData.emailVerified).toBe(true);
        expect(userData.mfaEnabled).toBe(true);
      });
    });

    describe('Partial Results', () => {
      it('99. should populate notFoundUserIds for missing users', async () => {
        const user = await createUserInDb();
        const missingId = '00000000-0000-0000-0000-000000000999';

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id, missingId] })
          .expect(200);

        expect(response.body.notFoundUserIds).toContain(missingId);
        expect(response.body.notFoundUserIds).not.toContain(user.id);
      });

      it('100. should include summary counts', async () => {
        const verifiedUser = await createUserInDb({ identity_verified: true });
        const unverifiedUser = await createUserInDb({ identity_verified: false });
        const missingId = '00000000-0000-0000-0000-000000000999';

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [verifiedUser.id, unverifiedUser.id, missingId] })
          .expect(200);

        expect(response.body.summary).toBeDefined();
        expect(response.body.summary.verified).toBe(1);
        expect(response.body.summary.unverified).toBe(1);
        expect(response.body.summary.notFound).toBe(1);
      });
    });

    describe('Input Validation', () => {
      it('101. should return 400 for empty array', async () => {
        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [] })
          .expect(400);

        expect(response.body.error).toMatch(/userIds array required/i);
      });

      it('102. should return 400 for missing userIds field', async () => {
        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({})
          .expect(400);

        expect(response.body.error).toMatch(/userIds array required/i);
      });

      it('103. should succeed with exactly 100 users', async () => {
        const userIds = Array.from({ length: 100 }, (_, i) =>
          `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        );

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds })
          .expect(200);

        expect(response.body.notFoundUserIds.length).toBe(100);
      });

      it('104. should return 400 for more than 100 users', async () => {
        const userIds = Array.from({ length: 101 }, (_, i) =>
          `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        );

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds })
          .expect(400);

        expect(response.body.error).toMatch(/maximum 100/i);
      });
    });

    describe('x-tenant-id Header', () => {
      it('105. should only return users from specified tenant', async () => {
        const user = await createUserInDb();
        await createOtherTenant();

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .set('x-tenant-id', OTHER_TENANT_ID)
          .send({ userIds: [user.id] })
          .expect(200);

        // User is in default tenant, so should not be found with other tenant filter
        expect(response.body.notFoundUserIds).toContain(user.id);
      });

      it('106. should return all matching users when header not provided', async () => {
        const user = await createUserInDb();

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users[user.id]).toBeDefined();
      });
    });

    describe('Stripe Connect KYC Mapping', () => {
      it('107. should map stripe_connect_status enabled to kycStatus verified', async () => {
        const user = await createUserInDb({
          stripe_connect_status: 'enabled',
        });

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users[user.id].kycStatus).toBe('verified');
      });

      it('108. should map stripe_connect_status pending to kycStatus pending', async () => {
        const user = await createUserInDb({
          stripe_connect_status: 'pending',
        });

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users[user.id].kycStatus).toBe('pending');
      });

      it('109. should return null kycStatus for not_started stripe status', async () => {
        const user = await createUserInDb({
          stripe_connect_status: 'not_started',
        });

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users[user.id].kycStatus).toBeNull();
      });

      it('110. should default identity_verified to false if null', async () => {
        // Insert user with identity_verified as NULL
        const result = await testPool.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, role, status, identity_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           RETURNING *`,
          [
            `null-identity-${Date.now()}@test.com`,
            '$2b$10$dummy',
            'Test',
            'User',
            TEST_TENANT_ID,
            'user',
            'ACTIVE',
          ]
        );
        const user = result.rows[0];

        const response = await request(app.server)
          .post('/auth/internal/users/batch-verification-check')
          .set('x-service-token', apiGatewayToken)
          .send({ userIds: [user.id] })
          .expect(200);

        expect(response.body.users[user.id].identityVerified).toBe(false);
      });
    });
  });
});
