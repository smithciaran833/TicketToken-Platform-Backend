import { RBACService } from '../../src/services/rbac.service';
import { pool } from '../../src/config/database';
import { AuthorizationError } from '../../src/errors';

/**
 * INTEGRATION TESTS FOR RBAC SERVICE
 * 
 * These tests verify role-based access control:
 * - Permission checking and role assignment
 * - Venue-scoped roles (owner, manager, box-office, door-staff)
 * - Customer permissions
 * - Role expiration and revocation
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
  
  console.log(`✓ Running RBAC service integration tests against test environment`);
});

describe('RBACService Integration Tests', () => {
  let service: RBACService;
  let testUserId: string;
  let venueOwnerId: string;
  let testVenueId: string;
  const testUserIds: string[] = [];
  const testVenueIds: string[] = [];

  beforeAll(async () => {
    service = new RBACService();
    
    // Create test users
    const userResult = await pool.query(
      `INSERT INTO auth.users (email, password_hash, is_verified) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`rbac-test-user-${Date.now()}@example.com`, 'hash', true]
    );
    testUserId = userResult.rows[0].id;
    testUserIds.push(testUserId);

    const ownerResult = await pool.query(
      `INSERT INTO auth.users (email, password_hash, is_verified) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`rbac-owner-${Date.now()}@example.com`, 'hash', true]
    );
    venueOwnerId = ownerResult.rows[0].id;
    testUserIds.push(venueOwnerId);

    // Create test venue
    const venueResult = await pool.query(
      `INSERT INTO public.venues (name, slug, owner_id) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`Test Venue ${Date.now()}`, `test-venue-${Date.now()}`, venueOwnerId]
    );
    testVenueId = venueResult.rows[0].id;
    testVenueIds.push(testVenueId);
  });

  afterEach(async () => {
    // Clean up roles after each test
    await pool.query('DELETE FROM auth.user_venue_roles WHERE user_id = ANY($1)', [testUserIds]);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM public.venues WHERE id = ANY($1)', [testVenueIds]);
    await pool.query('DELETE FROM auth.users WHERE id = ANY($1)', [testUserIds]);
    await pool.end();
  });

  describe('getUserPermissions()', () => {
    it('should return customer permissions by default', async () => {
      const permissions = await service.getUserPermissions(testUserId);

      expect(permissions).toContain('tickets:purchase');
      expect(permissions).toContain('tickets:view-own');
      expect(permissions).toContain('tickets:transfer-own');
      expect(permissions).toContain('profile:update-own');
    });

    it('should include venue role permissions when venueId provided', async () => {
      // Grant manager role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-manager', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('events:create');
      expect(permissions).toContain('events:update');
      expect(permissions).toContain('reports:view');
    });

    it('should exclude expired roles', async () => {
      // Grant expired role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by, expires_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 day')`,
        [testUserId, testVenueId, 'venue-manager', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).not.toContain('events:create');
    });

    it('should exclude inactive roles', async () => {
      // Grant inactive role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by, is_active)
         VALUES ($1, $2, $3, $4, false)`,
        [testUserId, testVenueId, 'venue-manager', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).not.toContain('events:create');
    });

    it('should include roles with null expires_at', async () => {
      // Grant permanent role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by, expires_at)
         VALUES ($1, $2, $3, $4, NULL)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('tickets:validate');
    });

    it('should deduplicate permissions from multiple roles', async () => {
      // Grant box-office and door-staff (both have tickets:validate)
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $4)`,
        [testUserId, testVenueId, 'box-office', venueOwnerId, 'door-staff']
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      const validateCount = permissions.filter(p => p === 'tickets:validate').length;
      expect(validateCount).toBe(1);
    });
  });

  describe('checkPermission()', () => {
    it('should return true for wildcard permission', async () => {
      // Grant owner role (has wildcard)
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-owner', venueOwnerId]
      );

      const hasPermission = await service.checkPermission(testUserId, 'any:permission', testVenueId);

      expect(hasPermission).toBe(true);
    });

    it('should return true for specific permission match', async () => {
      // Grant door-staff role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const hasPermission = await service.checkPermission(testUserId, 'tickets:validate', testVenueId);

      expect(hasPermission).toBe(true);
    });

    it('should return false for missing permission', async () => {
      const hasPermission = await service.checkPermission(testUserId, 'events:delete', testVenueId);

      expect(hasPermission).toBe(false);
    });

    it('should check customer permissions without venueId', async () => {
      const hasPermission = await service.checkPermission(testUserId, 'tickets:purchase');

      expect(hasPermission).toBe(true);
    });
  });

  describe('requirePermission()', () => {
    it('should pass silently when has permission', async () => {
      // Grant manager role
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-manager', venueOwnerId]
      );

      await expect(
        service.requirePermission(testUserId, 'events:create', testVenueId)
      ).resolves.not.toThrow();
    });

    it('should throw AuthorizationError when missing permission', async () => {
      await expect(
        service.requirePermission(testUserId, 'events:delete', testVenueId)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should include permission name in error message', async () => {
      try {
        await service.requirePermission(testUserId, 'special:permission', testVenueId);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('special:permission');
      }
    });
  });

  describe('grantVenueRole()', () => {
    beforeEach(async () => {
      // Give owner the roles:manage permission
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [venueOwnerId, testVenueId, 'venue-owner', venueOwnerId]
      );
    });

    it('should grant new role', async () => {
      await service.grantVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId);

      const result = await pool.query(
        `SELECT * FROM auth.user_venue_roles 
         WHERE user_id = $1 AND venue_id = $2 AND role = $3`,
        [testUserId, testVenueId, 'door-staff']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].granted_by).toBe(venueOwnerId);
    });

    it('should throw for invalid role', async () => {
      await expect(
        service.grantVenueRole(testUserId, testVenueId, 'invalid-role', venueOwnerId)
      ).rejects.toThrow('Invalid role');
    });

    it('should throw if granter lacks roles:manage permission', async () => {
      // Create user without permission
      const result = await pool.query(
        `INSERT INTO auth.users (email, password_hash, is_verified) 
         VALUES ($1, $2, $3) RETURNING id`,
        [`no-perms-${Date.now()}@example.com`, 'hash', true]
      );
      const noPermsUserId = result.rows[0].id;
      testUserIds.push(noPermsUserId);

      await expect(
        service.grantVenueRole(testUserId, testVenueId, 'door-staff', noPermsUserId)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should update expires_at for existing role', async () => {
      // Grant initial role
      await service.grantVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId);

      // Grant again with expiration
      const expiresAt = new Date(Date.now() + 86400000); // +1 day
      await service.grantVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId, expiresAt);

      const result = await pool.query(
        `SELECT expires_at FROM auth.user_venue_roles 
         WHERE user_id = $1 AND venue_id = $2 AND role = $3`,
        [testUserId, testVenueId, 'door-staff']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].expires_at).not.toBeNull();
    });

    it('should not duplicate role when already exists', async () => {
      await service.grantVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId);
      await service.grantVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId);

      const result = await pool.query(
        `SELECT * FROM auth.user_venue_roles 
         WHERE user_id = $1 AND venue_id = $2 AND role = $3`,
        [testUserId, testVenueId, 'door-staff']
      );

      expect(result.rows).toHaveLength(1);
    });
  });

  describe('revokeVenueRole()', () => {
    beforeEach(async () => {
      // Give owner the roles:manage permission
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [venueOwnerId, testVenueId, 'venue-owner', venueOwnerId]
      );

      // Grant role to test user
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );
    });

    it('should set is_active to false', async () => {
      await service.revokeVenueRole(testUserId, testVenueId, 'door-staff', venueOwnerId);

      const result = await pool.query(
        `SELECT is_active FROM auth.user_venue_roles 
         WHERE user_id = $1 AND venue_id = $2 AND role = $3`,
        [testUserId, testVenueId, 'door-staff']
      );

      expect(result.rows[0].is_active).toBe(false);
    });

    it('should throw if revoker lacks permission', async () => {
      // Create user without permission
      const result = await pool.query(
        `INSERT INTO auth.users (email, password_hash, is_verified) 
         VALUES ($1, $2, $3) RETURNING id`,
        [`no-perms-revoke-${Date.now()}@example.com`, 'hash', true]
      );
      const noPermsUserId = result.rows[0].id;
      testUserIds.push(noPermsUserId);

      await expect(
        service.revokeVenueRole(testUserId, testVenueId, 'door-staff', noPermsUserId)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('getUserVenueRoles()', () => {
    it('should return active roles for user', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4), ($1, $2, $5, $4)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId, 'box-office']
      );

      const roles = await service.getUserVenueRoles(testUserId);

      expect(roles).toHaveLength(2);
      expect(roles.some(r => r.role === 'door-staff')).toBe(true);
      expect(roles.some(r => r.role === 'box-office')).toBe(true);
    });

    it('should exclude expired roles', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by, expires_at)
         VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 day')`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const roles = await service.getUserVenueRoles(testUserId);

      expect(roles).toHaveLength(0);
    });

    it('should include roles with null expires_at', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by, expires_at)
         VALUES ($1, $2, $3, $4, NULL)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const roles = await service.getUserVenueRoles(testUserId);

      expect(roles).toHaveLength(1);
    });

    it('should return venue_id, role, granted_at, expires_at', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const roles = await service.getUserVenueRoles(testUserId);

      expect(roles[0]).toHaveProperty('venue_id');
      expect(roles[0]).toHaveProperty('role');
      expect(roles[0]).toHaveProperty('granted_at');
      expect(roles[0]).toHaveProperty('expires_at');
    });
  });

  describe('Role permissions validation', () => {
    it('should have venue-owner with wildcard permissions', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-owner', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('*');
    });

    it('should have venue-manager with correct permissions', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'venue-manager', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('events:create');
      expect(permissions).toContain('events:update');
      expect(permissions).toContain('events:delete');
      expect(permissions).toContain('reports:view');
    });

    it('should have box-office with correct permissions', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'box-office', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('tickets:sell');
      expect(permissions).toContain('tickets:validate');
      expect(permissions).toContain('payments:process');
    });

    it('should have door-staff with limited permissions', async () => {
      await pool.query(
        `INSERT INTO auth.user_venue_roles (user_id, venue_id, role, granted_by)
         VALUES ($1, $2, $3, $4)`,
        [testUserId, testVenueId, 'door-staff', venueOwnerId]
      );

      const permissions = await service.getUserPermissions(testUserId, testVenueId);

      expect(permissions).toContain('tickets:validate');
      expect(permissions).toContain('tickets:view');
      expect(permissions).not.toContain('events:create');
    });
  });
});
