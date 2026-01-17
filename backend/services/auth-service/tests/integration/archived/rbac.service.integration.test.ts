import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { RBACService } from '../../src/services/rbac.service';
import crypto from 'crypto';

// Override the database import
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
  db: require('knex')({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    },
  }),
}));

describe('RBACService Integration Tests', () => {
  let rbacService: RBACService;

  beforeAll(async () => {
    rbacService = new RBACService();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  // Helper to create a user in the database
  async function createDbUser(overrides: Partial<any> = {}) {
    const userData = createTestUser(overrides);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id`,
      [userData.email, 'hashed_password', userData.firstName, userData.lastName, userData.tenant_id]
    );
    return result.rows[0];
  }

  // Helper to create a venue role
  async function createVenueRole(
    userId: string,
    venueId: string,
    role: string,
    options: { grantedBy?: string; expiresAt?: Date; isActive?: boolean } = {}
  ) {
    const { grantedBy, expiresAt, isActive = true } = options;
    await testPool.query(
      `INSERT INTO user_venue_roles (id, user_id, venue_id, role, granted_by, expires_at, is_active, granted_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
      [crypto.randomUUID(), userId, venueId, role, grantedBy, expiresAt, isActive, TEST_TENANT_ID]
    );
  }

  const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000002';

  describe('getUserPermissions', () => {
    it('should return customer permissions by default', async () => {
      const user = await createDbUser();

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID);

      expect(permissions).toContain('tickets:purchase');
      expect(permissions).toContain('tickets:view-own');
      expect(permissions).toContain('tickets:transfer-own');
      expect(permissions).toContain('profile:update-own');
    });

    it('should include venue role permissions when venueId provided', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-manager');

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, TEST_VENUE_ID);

      // Should have venue-manager permissions
      expect(permissions).toContain('events:create');
      expect(permissions).toContain('events:update');
      expect(permissions).toContain('events:delete');
      expect(permissions).toContain('tickets:view');
      expect(permissions).toContain('tickets:validate');
      expect(permissions).toContain('reports:view');
      // Plus customer permissions
      expect(permissions).toContain('tickets:purchase');
    });

    it('should return wildcard for venue-owner', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-owner');

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, TEST_VENUE_ID);

      expect(permissions).toContain('*');
    });

    it('should not include expired role permissions', async () => {
      const user = await createDbUser();
      const expiredDate = new Date(Date.now() - 86400000); // Yesterday
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-manager', { expiresAt: expiredDate });

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, TEST_VENUE_ID);

      // Should NOT have venue-manager permissions
      expect(permissions).not.toContain('events:create');
      // But still has customer permissions
      expect(permissions).toContain('tickets:purchase');
    });

    it('should not include inactive role permissions', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-manager', { isActive: false });

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, TEST_VENUE_ID);

      expect(permissions).not.toContain('events:create');
      expect(permissions).toContain('tickets:purchase');
    });

    it('should combine permissions from multiple roles', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');
      await createVenueRole(user.id, TEST_VENUE_ID, 'door-staff');

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, TEST_VENUE_ID);

      // Box-office permissions
      expect(permissions).toContain('tickets:sell');
      expect(permissions).toContain('payments:process');
      // Door-staff permissions
      expect(permissions).toContain('tickets:validate');
      // Shared permissions (no duplicates due to Set)
      expect(permissions.filter(p => p === 'tickets:validate').length).toBe(1);
    });

    it('should not return permissions for different venue', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-manager');
      const otherVenueId = '00000000-0000-0000-0000-000000000003';

      const permissions = await rbacService.getUserPermissions(user.id, TEST_TENANT_ID, otherVenueId);

      expect(permissions).not.toContain('events:create');
      expect(permissions).toContain('tickets:purchase'); // Customer permissions still there
    });
  });

  describe('checkPermission', () => {
    it('should return true for permission user has', async () => {
      const user = await createDbUser();

      const hasPermission = await rbacService.checkPermission(user.id, TEST_TENANT_ID, 'tickets:purchase');

      expect(hasPermission).toBe(true);
    });

    it('should return false for permission user lacks', async () => {
      const user = await createDbUser();

      const hasPermission = await rbacService.checkPermission(user.id, TEST_TENANT_ID, 'events:create');

      expect(hasPermission).toBe(false);
    });

    it('should return true for any permission when user has wildcard', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-owner');

      const hasPermission = await rbacService.checkPermission(user.id, TEST_TENANT_ID, 'any:permission', TEST_VENUE_ID);

      expect(hasPermission).toBe(true);
    });

    it('should check venue-scoped permission correctly', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');

      const hasPermissionForVenue = await rbacService.checkPermission(user.id, TEST_TENANT_ID, 'tickets:sell', TEST_VENUE_ID);
      const hasPermissionGlobally = await rbacService.checkPermission(user.id, TEST_TENANT_ID, 'tickets:sell');

      expect(hasPermissionForVenue).toBe(true);
      expect(hasPermissionGlobally).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should not throw when user has permission', async () => {
      const user = await createDbUser();

      await expect(
        rbacService.requirePermission(user.id, TEST_TENANT_ID, 'tickets:purchase')
      ).resolves.not.toThrow();
    });

    it('should throw AuthorizationError when user lacks permission', async () => {
      const user = await createDbUser();

      await expect(
        rbacService.requirePermission(user.id, TEST_TENANT_ID, 'events:create')
      ).rejects.toThrow('Missing required permission: events:create');
    });

    it('should not throw when venue-owner checks any permission for their venue', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'venue-owner');

      await expect(
        rbacService.requirePermission(user.id, TEST_TENANT_ID, 'anything:at:all', TEST_VENUE_ID)
      ).resolves.not.toThrow();
    });
  });

  describe('grantVenueRole', () => {
    it('should grant role to user', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      // Give admin the ability to manage roles
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');

      await rbacService.grantVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', admin.id);

      const roles = await testPool.query(
        `SELECT * FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2 AND role = $3`,
        [user.id, TEST_VENUE_ID, 'box-office']
      );

      expect(roles.rows.length).toBe(1);
      expect(roles.rows[0].granted_by).toBe(admin.id);
      expect(roles.rows[0].is_active).toBe(true);
    });

    it('should set expiration date when provided', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await rbacService.grantVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'door-staff', admin.id, expiresAt);

      const roles = await testPool.query(
        `SELECT expires_at FROM user_venue_roles WHERE user_id = $1 AND role = $2`,
        [user.id, 'door-staff']
      );

      expect(roles.rows[0].expires_at).not.toBeNull();
    });

    it('should reject invalid role', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');

      await expect(
        rbacService.grantVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'fake-role', admin.id)
      ).rejects.toThrow('Invalid role: fake-role');
    });

    it('should reject granter without roles:manage permission', async () => {
      const user = await createDbUser();
      const notAdmin = await createDbUser({ email: 'notadmin@test.com' });
      // notAdmin has no special roles

      await expect(
        rbacService.grantVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', notAdmin.id)
      ).rejects.toThrow('Missing required permission: roles:manage');
    });

    it('should update expiration if role already exists', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');

      const newExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await rbacService.grantVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', admin.id, newExpiration);

      const roles = await testPool.query(
        `SELECT * FROM user_venue_roles WHERE user_id = $1 AND role = $2 AND is_active = true`,
        [user.id, 'box-office']
      );

      // Should only have one active role, not create duplicate
      expect(roles.rows.length).toBe(1);
    });
  });

  describe('revokeVenueRole', () => {
    it('should deactivate role', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');

      await rbacService.revokeVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', admin.id);

      const roles = await testPool.query(
        `SELECT is_active FROM user_venue_roles WHERE user_id = $1 AND role = $2`,
        [user.id, 'box-office']
      );

      expect(roles.rows[0].is_active).toBe(false);
    });

    it('should reject revoker without roles:manage permission', async () => {
      const user = await createDbUser();
      const notAdmin = await createDbUser({ email: 'notadmin@test.com' });
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');

      await expect(
        rbacService.revokeVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', notAdmin.id)
      ).rejects.toThrow('Missing required permission: roles:manage');
    });

    it('should not affect other roles when revoking one', async () => {
      const user = await createDbUser();
      const admin = await createDbUser({ email: 'admin@test.com' });
      await createVenueRole(admin.id, TEST_VENUE_ID, 'venue-owner');
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');
      await createVenueRole(user.id, TEST_VENUE_ID, 'door-staff');

      await rbacService.revokeVenueRole(user.id, TEST_TENANT_ID, TEST_VENUE_ID, 'box-office', admin.id);

      const boxOfficeRole = await testPool.query(
        `SELECT is_active FROM user_venue_roles WHERE user_id = $1 AND role = 'box-office'`,
        [user.id]
      );
      const doorStaffRole = await testPool.query(
        `SELECT is_active FROM user_venue_roles WHERE user_id = $1 AND role = 'door-staff'`,
        [user.id]
      );

      expect(boxOfficeRole.rows[0].is_active).toBe(false);
      expect(doorStaffRole.rows[0].is_active).toBe(true);
    });
  });

  describe('getUserVenueRoles', () => {
    it('should return all active roles for user', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');
      await createVenueRole(user.id, '00000000-0000-0000-0000-000000000003', 'door-staff');

      const roles = await rbacService.getUserVenueRoles(user.id, TEST_TENANT_ID);

      expect(roles.length).toBe(2);
      expect(roles.map(r => r.role)).toContain('box-office');
      expect(roles.map(r => r.role)).toContain('door-staff');
    });

    it('should not return inactive roles', async () => {
      const user = await createDbUser();
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office');
      await createVenueRole(user.id, TEST_VENUE_ID, 'door-staff', { isActive: false });

      const roles = await rbacService.getUserVenueRoles(user.id, TEST_TENANT_ID);

      expect(roles.length).toBe(1);
      expect(roles[0].role).toBe('box-office');
    });

    it('should not return expired roles', async () => {
      const user = await createDbUser();
      const expiredDate = new Date(Date.now() - 86400000);
      await createVenueRole(user.id, TEST_VENUE_ID, 'box-office', { expiresAt: expiredDate });
      await createVenueRole(user.id, '00000000-0000-0000-0000-000000000003', 'door-staff');

      const roles = await rbacService.getUserVenueRoles(user.id, TEST_TENANT_ID);

      expect(roles.length).toBe(1);
      expect(roles[0].role).toBe('door-staff');
    });

    it('should return empty array for user with no roles', async () => {
      const user = await createDbUser();

      const roles = await rbacService.getUserVenueRoles(user.id, TEST_TENANT_ID);

      expect(roles).toEqual([]);
    });
  });
});
