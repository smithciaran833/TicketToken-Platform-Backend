import { createAuthMiddleware } from '../../src/middleware/auth.middleware';
import { JWTService } from '../../src/services/jwt.service';
import { RBACService } from '../../src/services/rbac.service';
import { AuthenticationError, AuthorizationError } from '../../src/errors';
import { pool } from '../../src/config/database';

/**
 * INTEGRATION TESTS FOR AUTH MIDDLEWARE
 * 
 * These tests use REAL dependencies:
 * - Real JWTService for token generation/verification
 * - Real RBACService for permission checks
 * - Real database for user and role data
 * - No mocks
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running auth middleware integration tests against test environment`);
});

describe('Auth Middleware Integration Tests', () => {
  let jwtService: JWTService;
  let rbacService: RBACService;
  let middleware: ReturnType<typeof createAuthMiddleware>;
  let testUserId: string;
  let testVenueId: string;
  let validToken: string;
  const testUserIds: string[] = [];
  const testVenueIds: string[] = [];

  beforeAll(async () => {
    // Initialize real services
    jwtService = new JWTService();
    rbacService = new RBACService();
    middleware = createAuthMiddleware(jwtService, rbacService);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO auth.users (email, password_hash, is_verified, tenant_id) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`auth-middleware-test-${Date.now()}@example.com`, 'hash', true, 'tenant-123']
    );
    testUserId = userResult.rows[0].id;
    testUserIds.push(testUserId);

    // Create test venue
    const venueResult = await pool.query(
      `INSERT INTO public.venues (name, slug, owner_id) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`Test Venue ${Date.now()}`, `test-venue-${Date.now()}`, testUserId]
    );
    testVenueId = venueResult.rows[0].id;
    testVenueIds.push(testVenueId);

    // Generate real JWT token
    validToken = await jwtService.generateAccessToken({
      sub: testUserId,
      tenant_id: 'tenant-123',
      email: `auth-middleware-test-${Date.now()}@example.com`,
      role: 'customer'
    });
  });

  afterAll(async () => {
    // Clean up
    await pool.query('DELETE FROM auth.user_venue_roles WHERE user_id = ANY($1)', [testUserIds]);
    await pool.query('DELETE FROM public.venues WHERE id = ANY($1)', [testVenueIds]);
    await pool.query('DELETE FROM auth.users WHERE id = ANY($1)', [testUserIds]);
    await pool.end();
  });

  describe('authenticate()', () => {
    it('should throw AuthenticationError when no Authorization header', async () => {
      const request = { headers: {} };
      const reply = {};

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow('Missing or invalid authorization header');
    });

    it('should throw AuthenticationError when header does not start with Bearer', async () => {
      const request = { headers: { authorization: 'Basic sometoken' } };
      const reply = {};

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when header format is invalid', async () => {
      const request = { headers: { authorization: 'Bearertoken' } };
      const reply = {};

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for invalid token', async () => {
      const request = { headers: { authorization: 'Bearer invalid-token' } };
      const reply = {};

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow('Invalid token');
    });

    it('should throw AuthenticationError for expired token', async () => {
      // Generate token with -1 hour expiry (already expired)
      const expiredToken = await jwtService.generateAccessToken(
        { sub: testUserId, tenant_id: 'tenant-123', email: 'test@example.com', role: 'customer' },
        '-1h'
      );

      const request = { headers: { authorization: `Bearer ${expiredToken}` } };
      const reply = {};

      await expect(
        middleware.authenticate(request, reply)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should successfully authenticate with valid Bearer token', async () => {
      const request = { headers: { authorization: `Bearer ${validToken}` } };
      const reply = {};

      await middleware.authenticate(request, reply);

      expect(request.user).toBeDefined();
      expect(request.user.id).toBe(testUserId);
      expect(request.user.tenant_id).toBe('tenant-123');
      expect(request.user.email).toContain('auth-middleware-test');
      expect(request.user.role).toBe('customer');
      expect(request.user.permissions).toBeDefined();
      expect(Array.isArray(request.user.permissions)).toBe(true);
    });

    it('should set user permissions from RBAC service', async () => {
      const request = { headers: { authorization: `Bearer ${validToken}` } };
      const reply = {};

      await middleware.authenticate(request, reply);

      // Customer should have default permissions
      expect(request.user.permissions).toContain('tickets:purchase');
      expect(request.user.permissions).toContain('tickets:view-own');
    });

    it('should include venue role permissions when user has venue roles', async () => {
      // Grant venue role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', testUserId]
      );

      const request = { headers: { authorization: `Bearer ${validToken}` } };
      const reply = {};

      await middleware.authenticate(request, reply);

      expect(request.user.permissions).toContain('tickets:validate');
      expect(request.user.permissions).toContain('tickets:view');

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });
  });

  describe('requirePermission()', () => {
    it('should throw AuthenticationError when request.user is undefined', async () => {
      const request = {};
      const reply = {};
      const permissionMiddleware = middleware.requirePermission('tickets:validate');

      await expect(
        permissionMiddleware(request, reply)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        permissionMiddleware(request, reply)
      ).rejects.toThrow('Authentication required');
    });

    it('should throw AuthorizationError when user lacks permission', async () => {
      const request = {
        user: {
          id: testUserId,
          tenant_id: 'tenant-123',
          email: 'test@example.com',
          role: 'customer',
          permissions: ['tickets:purchase']
        }
      };
      const reply = {};
      const permissionMiddleware = middleware.requirePermission('events:create');

      await expect(
        permissionMiddleware(request, reply)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        permissionMiddleware(request, reply)
      ).rejects.toThrow('Missing required permission: events:create');
    });

    it('should pass silently when user has permission', async () => {
      const request = {
        user: {
          id: testUserId,
          tenant_id: 'tenant-123',
          email: 'test@example.com',
          role: 'customer',
          permissions: ['tickets:purchase', 'tickets:view-own']
        }
      };
      const reply = {};
      const permissionMiddleware = middleware.requirePermission('tickets:purchase');

      await expect(
        permissionMiddleware(request, reply)
      ).resolves.not.toThrow();
    });

    it('should extract venueId from request.params', async () => {
      // Grant venue role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-manager', testUserId]
      );

      const request = {
        user: {
          id: testUserId,
          tenant_id: 'tenant-123',
          email: 'test@example.com',
          role: 'customer',
          permissions: []
        },
        params: { venueId: testVenueId }
      };
      const reply = {};
      const permissionMiddleware = middleware.requirePermission('events:create');

      await expect(
        permissionMiddleware(request, reply)
      ).resolves.not.toThrow();

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });

    it('should extract venueId from request.body if not in params', async () => {
      // Grant venue role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-manager', testUserId]
      );

      const request = {
        user: {
          id: testUserId,
          tenant_id: 'tenant-123',
          email: 'test@example.com',
          role: 'customer',
          permissions: []
        },
        body: { venueId: testVenueId }
      };
      const reply = {};
      const permissionMiddleware = middleware.requirePermission('events:create');

      await expect(
        permissionMiddleware(request, reply)
      ).resolves.not.toThrow();

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });
  });

  describe('requireVenueAccess()', () => {
    it('should throw AuthenticationError when request.user is undefined', async () => {
      const request = { params: { venueId: testVenueId } };
      const reply = {};

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).rejects.toThrow('Authentication required');
    });

    it('should throw Error when venueId is missing from params', async () => {
      const request = {
        user: { id: testUserId },
        params: {}
      };
      const reply = {};

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).rejects.toThrow('Venue ID required');
    });

    it('should throw AuthorizationError when user has no role for venue', async () => {
      const request = {
        user: { id: testUserId },
        params: { venueId: testVenueId }
      };
      const reply = {};

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).rejects.toThrow('No access to this venue');
    });

    it('should pass silently when user has venue role', async () => {
      // Grant venue role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', testUserId]
      );

      const request = {
        user: { id: testUserId },
        params: { venueId: testVenueId }
      };
      const reply = {};

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).resolves.not.toThrow();

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });

    it('should allow access with any venue role', async () => {
      // Grant multiple venue roles
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $4)`,
        [testUserId, testVenueId, 'door-staff', testUserId, 'box-office']
      );

      const request = {
        user: { id: testUserId },
        params: { venueId: testVenueId }
      };
      const reply = {};

      await expect(
        middleware.requireVenueAccess(request, reply)
      ).resolves.not.toThrow();

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });
  });

  describe('Middleware chaining', () => {
    it('should work with authenticate followed by requirePermission', async () => {
      const request = { headers: { authorization: `Bearer ${validToken}` } };
      const reply = {};

      // First authenticate
      await middleware.authenticate(request, reply);

      // Then check permission
      const permissionMiddleware = middleware.requirePermission('tickets:purchase');
      await expect(
        permissionMiddleware(request, reply)
      ).resolves.not.toThrow();
    });

    it('should work with authenticate followed by requireVenueAccess', async () => {
      // Grant venue role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', testUserId]
      );

      const request = {
        headers: { authorization: `Bearer ${validToken}` },
        params: { venueId: testVenueId }
      };
      const reply = {};

      // First authenticate
      await middleware.authenticate(request, reply);

      // Then check venue access
      await expect(
        middleware.requireVenueAccess(request, reply)
      ).resolves.not.toThrow();

      // Clean up
      await pool.query(
        'DELETE FROM auth.user_venue_roles WHERE user_id = $1 AND venue_id = $2',
        [testUserId, testVenueId]
      );
    });
  });
});
