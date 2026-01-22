import request from 'supertest';
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
import { RBACService } from '../../src/services/rbac.service';

let app: any;
const rbacService = new RBACService();

// ============================================
// TEST HELPERS
// ============================================

async function registerUser(overrides: Partial<any> = {}) {
  const userData = createTestUser(overrides);
  const response = await request(app.server)
    .post('/auth/register')
    .send(userData)
    .expect(201);

  return {
    userId: response.body.user.id,
    email: userData.email,
    password: userData.password,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
  };
}

async function createVenueOwner(venueId: string) {
  const user = await registerUser();

  await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
  await testPool.query(
    `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, granted_at)
     VALUES ($1, $2, $3, 'venue-owner', $2, true, NOW())`,
    [TEST_TENANT_ID, user.userId, venueId]
  );

  return user;
}

async function grantRoleViaAPI(
  accessToken: string,
  venueId: string,
  userId: string,
  role: string,
  expiresAt?: string
) {
  const body: any = { userId, role };
  if (expiresAt) {
    body.expiresAt = expiresAt;
  }

  return request(app.server)
    .post(`/auth/venues/${venueId}/roles`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
}

async function getVenueRolesFromDB(venueId: string, includeInactive = false) {
  await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);

  let query = 'SELECT * FROM user_venue_roles WHERE venue_id = $1';
  const params: any[] = [venueId];

  if (!includeInactive) {
    query += ' AND is_active = true';
  }

  query += ' ORDER BY created_at ASC';

  const result = await testPool.query(query, params);
  return result.rows;
}

async function getUserVenueRolesFromDB(userId: string, venueId: string) {
  await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);

  const result = await testPool.query(
    `SELECT * FROM user_venue_roles
     WHERE user_id = $1 AND venue_id = $2 AND is_active = true
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at ASC`,
    [userId, venueId]
  );
  return result.rows;
}

async function getAuditLogs(action?: string) {
  await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);

  let query = 'SELECT * FROM audit_logs';
  const params: any[] = [];

  if (action) {
    query += ' WHERE action = $1';
    params.push(action);
  }

  query += ' ORDER BY created_at DESC';

  const result = await testPool.query(query, params);
  return result.rows;
}

function createVenueId(): string {
  return `00000000-0000-0000-0000-${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`;
}

let secondTenantId: string | null = null;
async function createSecondTenant(): Promise<string> {
  if (secondTenantId) {
    return secondTenantId;
  }

  const slug = `test-tenant-${Date.now()}`;
  const result = await testPool.query(
    `INSERT INTO tenants (name, slug, settings)
     VALUES ('Test Tenant 2', $1, '{}')
     RETURNING id`,
    [slug]
  );
  secondTenantId = result.rows[0].id;
  return secondTenantId;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MAIN TEST SUITE
// ============================================

describe('RBAC Flow Integration Tests', () => {
  let venueId: string;

  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
    venueId = createVenueId();
    secondTenantId = null;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  describe('POST /venues/:venueId/roles - Grant Role', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;
    let targetUser: Awaited<ReturnType<typeof registerUser>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
      targetUser = await registerUser();
      await sleep(700);
    });

    describe('Happy Path', () => {
      it('should grant venue-owner role', async () => {
        const response = await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-owner'
        );

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('venue-owner');

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBe(1);
        expect(roles[0].role).toBe('venue-owner');
        expect(roles[0].granted_by).toBe(owner.userId);
        expect(roles[0].is_active).toBe(true);
      });

      it('should grant venue-manager role', async () => {
        const response = await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager'
        );

        expect(response.status).toBe(200);

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBe(1);
        expect(roles[0].role).toBe('venue-manager');
      });

      it('should grant box-office role', async () => {
        const response = await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'box-office'
        );

        expect(response.status).toBe(200);

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].role).toBe('box-office');
      });

      it('should grant door-staff role', async () => {
        const response = await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'door-staff'
        );

        expect(response.status).toBe(200);

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].role).toBe('door-staff');
      });

      it('should verify granted_by foreign key is set correctly', async () => {
        await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager'
        );

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].granted_by).toBe(owner.userId);

        const granterResult = await testPool.query(
          'SELECT id, email FROM users WHERE id = $1',
          [roles[0].granted_by]
        );
        expect(granterResult.rows.length).toBe(1);
        expect(granterResult.rows[0].email).toBe(owner.email);
      });

      it('should set tenant_id correctly', async () => {
        await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager'
        );

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].tenant_id).toBe(TEST_TENANT_ID);
      });
    });

    describe('Idempotency', () => {
      it('should not create duplicate role when granted twice', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBe(1);
        expect(roles[0].role).toBe('venue-manager');
      });

      it('should update expires_at when re-granting with new expiration', async () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager', tomorrow);

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        let result = await testPool.query(
          'SELECT expires_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2 AND is_active = true',
          [targetUser.userId, venueId]
        );
        const originalExpiresAt = new Date(result.rows[0].expires_at).getTime();

        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager', nextWeek);

        result = await testPool.query(
          'SELECT expires_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2 AND is_active = true',
          [targetUser.userId, venueId]
        );

        expect(result.rows.length).toBe(1);
        const newExpiresAt = new Date(result.rows[0].expires_at).getTime();
        expect(newExpiresAt).toBeGreaterThan(originalExpiresAt);
      });
    });

    describe('Permissions & Auth', () => {
      it('should return 401 without authorization header', async () => {
        await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .send({ userId: targetUser.userId, role: 'venue-manager' })
          .expect(401);
      });

      it('should return 403 when user lacks roles:manage permission', async () => {
        const doorStaff = await registerUser();
        await sleep(700);
        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, granted_at)
           VALUES ($1, $2, $3, 'door-staff', $4, true, NOW())`,
          [TEST_TENANT_ID, doorStaff.userId, venueId, owner.userId]
        );

        const response = await grantRoleViaAPI(
          doorStaff.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager'
        );

        expect(response.status).toBe(403);
      });

      it('should succeed when user has wildcard (*) permission', async () => {
        const response = await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager'
        );

        expect(response.status).toBe(200);
      });

      it('should return 401 with invalid token', async () => {
        await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', 'Bearer invalid-token')
          .send({ userId: targetUser.userId, role: 'venue-manager' })
          .expect(401);
      });
    });

    describe('Validation', () => {
      it('should return 400 when userId is missing', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ role: 'venue-manager' })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should return 400 when role is missing', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ userId: targetUser.userId })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should return 400 when role is invalid', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ userId: targetUser.userId, role: 'super-admin' })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should return 400 when venueId is not a valid UUID', async () => {
        const response = await request(app.server)
          .post('/auth/venues/not-a-uuid/roles')
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ userId: targetUser.userId, role: 'venue-manager' })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should return 400 when userId is not a valid UUID', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ userId: 'not-a-uuid', role: 'venue-manager' })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should return 400 when expiresAt is not valid ISO date', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'venue-manager',
            expiresAt: 'not-a-date',
          })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });

      it('should reject extra fields in request body', async () => {
        const response = await request(app.server)
          .post(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({
            userId: targetUser.userId,
            role: 'venue-manager',
            extraField: 'should-be-rejected',
          })
          .expect(400);

        expect(response.body.detail).toBeDefined();
      });
    });

    describe('Database State', () => {
      it('should set is_active to true on grant', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBeGreaterThan(0);
        expect(roles[0].is_active).toBe(true);
      });

      it('should set granted_at timestamp', async () => {
        const before = new Date();

        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const after = new Date();

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        const result = await testPool.query(
          'SELECT granted_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2',
          [targetUser.userId, venueId]
        );

        expect(result.rows.length).toBeGreaterThan(0);
        const grantedAt = new Date(result.rows[0].granted_at);
        expect(grantedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
        expect(grantedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      });

      it('should set expires_at when provided', async () => {
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await grantRoleViaAPI(
          owner.accessToken,
          venueId,
          targetUser.userId,
          'venue-manager',
          futureDate.toISOString()
        );

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].expires_at).toBeDefined();

        const expiresAt = new Date(roles[0].expires_at);
        expect(Math.abs(expiresAt.getTime() - futureDate.getTime())).toBeLessThan(1000);
      });

      it('should leave expires_at NULL when not provided', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles[0].expires_at).toBeNull();
      });
    });
  });

  describe('DELETE /venues/:venueId/roles/:userId - Revoke Role', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;
    let targetUser: Awaited<ReturnType<typeof registerUser>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
      targetUser = await registerUser();
      await sleep(700);
    });

    describe('Happy Path', () => {
      it('should revoke all roles for user at venue', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'box-office');

        let roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBe(2);

        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        roles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(roles.length).toBe(0);
      });

      it('should set is_active to false (soft delete)', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const roles = await getVenueRolesFromDB(venueId, true);
        const revokedRole = roles.find(r => r.user_id === targetUser.userId);

        expect(revokedRole).toBeDefined();
        expect(revokedRole.is_active).toBe(false);
      });

      it('should verify role still exists in database (not deleted)', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const beforeCount = (await getVenueRolesFromDB(venueId, true)).length;

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const afterCount = (await getVenueRolesFromDB(venueId, true)).length;
        expect(afterCount).toBe(beforeCount);
      });
    });

    describe('Permissions & Auth', () => {
      it('should return 401 without authorization header', async () => {
        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .expect(401);
      });

      it('should return 403 when user lacks roles:manage permission', async () => {
        const doorStaff = await registerUser();
        await sleep(700);
        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, granted_at)
           VALUES ($1, $2, $3, 'door-staff', $4, true, NOW())`,
          [TEST_TENANT_ID, doorStaff.userId, venueId, owner.userId]
        );

        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${doorStaff.accessToken}`)
          .expect(403);

        expect(response.body.detail).toBeTruthy();
      });

      it('should succeed when user has wildcard (*) permission', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should succeed when revoking non-existent role', async () => {
        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should be idempotent (revoke already revoked role)', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should cause user to lose permissions immediately after revoke', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');

        await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${targetUser.accessToken}`)
          .expect(200);

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${targetUser.accessToken}`)
          .expect(403);
      });
    });

    describe('Multi-Role Scenario', () => {
      it('should revoke all 3 roles at once', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'venue-manager');
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'box-office');
        await grantRoleViaAPI(owner.accessToken, venueId, targetUser.userId, 'door-staff');

        let activeRoles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(activeRoles.length).toBe(3);

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${targetUser.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        activeRoles = await getUserVenueRolesFromDB(targetUser.userId, venueId);
        expect(activeRoles.length).toBe(0);

        const allRoles = await getVenueRolesFromDB(venueId, true);
        const userRoles = allRoles.filter(r => r.user_id === targetUser.userId);
        expect(userRoles.length).toBe(3);
        expect(userRoles.every(r => r.is_active === false)).toBe(true);
      });
    });
  });

  describe('GET /venues/:venueId/roles - List Roles', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
    });

    describe('Happy Path', () => {
      it('should list all active roles at venue', async () => {
        const user1 = await registerUser();
        await sleep(700);
        const user2 = await registerUser();
        await sleep(700);

        await grantRoleViaAPI(owner.accessToken, venueId, user1.userId, 'venue-manager');
        await grantRoleViaAPI(owner.accessToken, venueId, user2.userId, 'box-office');

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.roles).toBeDefined();
        expect(response.body.roles.length).toBeGreaterThanOrEqual(2);

        const manager = response.body.roles.find((r: any) => r.userId === user1.userId);
        const boxOffice = response.body.roles.find((r: any) => r.userId === user2.userId);

        expect(manager.role).toBe('venue-manager');
        expect(boxOffice.role).toBe('box-office');
      });

      it('should return array when listing roles', async () => {
        const emptyVenueId = createVenueId();
        const emptyOwner = await createVenueOwner(emptyVenueId);
        await sleep(700);

        const response = await request(app.server)
          .get(`/auth/venues/${emptyVenueId}/roles`)
          .set('Authorization', `Bearer ${emptyOwner.accessToken}`)
          .expect(200);

        expect(response.body.roles).toBeDefined();
        expect(Array.isArray(response.body.roles)).toBe(true);
      });

      it('should filter out expired roles', async () => {
        const user = await registerUser();
        await sleep(700);

        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, expires_at, granted_at)
           VALUES ($1, $2, $3, 'venue-manager', $4, true, $5, NOW())`,
          [TEST_TENANT_ID, user.userId, venueId, owner.userId, pastDate]
        );

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const expiredRole = response.body.roles.find((r: any) => r.userId === user.userId);
        expect(expiredRole).toBeUndefined();
      });
    });

    describe('Permissions & Auth', () => {
      it('should return 401 without authorization header', async () => {
        await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .expect(401);
      });

      it('should return 403 when user has no role at venue', async () => {
        const outsider = await registerUser();
        await sleep(700);

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${outsider.accessToken}`)
          .expect(403);

        expect(response.body.detail).toBeTruthy();
      });

      it('should succeed when user has ANY active role at venue', async () => {
        const doorStaff = await registerUser();
        await sleep(700);
        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, granted_at)
           VALUES ($1, $2, $3, 'door-staff', $4, true, NOW())`,
          [TEST_TENANT_ID, doorStaff.userId, venueId, owner.userId]
        );

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${doorStaff.accessToken}`)
          .expect(200);

        expect(response.body.roles).toBeDefined();
      });
    });

    describe('Filtering Logic', () => {
      it('should exclude revoked roles (is_active=false)', async () => {
        const user = await registerUser();
        await sleep(700);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');
        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${user.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const revokedRole = response.body.roles.find((r: any) => r.userId === user.userId);
        expect(revokedRole).toBeUndefined();
      });

      it('should include roles with NULL expires_at', async () => {
        const user = await registerUser();
        await sleep(700);
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const role = response.body.roles.find((r: any) => r.userId === user.userId);
        expect(role).toBeDefined();
        expect(role.expiresAt).toBeNull();
      });

      it('should exclude roles with past expires_at', async () => {
        const user = await registerUser();
        await sleep(700);
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, expires_at, granted_at)
           VALUES ($1, $2, $3, 'venue-manager', $4, true, $5, NOW())`,
          [TEST_TENANT_ID, user.userId, venueId, owner.userId, yesterday]
        );

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const expiredRole = response.body.roles.find((r: any) => r.userId === user.userId);
        expect(expiredRole).toBeUndefined();
      });

      it('should include roles with future expires_at', async () => {
        const user = await registerUser();
        await sleep(700);
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager', tomorrow.toISOString());

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        const futureRole = response.body.roles.find((r: any) => r.userId === user.userId);
        expect(futureRole).toBeDefined();
      });
    });

    describe('Multi-User Scenario', () => {
      it('should list roles for 5 different users with different roles', async () => {
        const users = [];
        for (let i = 0; i < 3; i++) {
          users.push(await registerUser());
          await sleep(700);
        }

        const roles = ['venue-manager', 'box-office', 'door-staff'];

        for (let i = 0; i < users.length; i++) {
          await grantRoleViaAPI(owner.accessToken, venueId, users[i].userId, roles[i]);
        }

        const response = await request(app.server)
          .get(`/auth/venues/${venueId}/roles`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.roles.length).toBeGreaterThanOrEqual(3);

        for (let i = 0; i < users.length; i++) {
          const userRole = response.body.roles.find((r: any) => r.userId === users[i].userId);
          expect(userRole).toBeDefined();
          expect(userRole.role).toBe(roles[i]);
        }
      });
    });
  });

  describe('Permission System Logic', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;
    let user: Awaited<ReturnType<typeof registerUser>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
      user = await registerUser();
      await sleep(700);
    });

    describe('Wildcard Permissions', () => {
      it('should grant all permissions to venue-owner (*)', async () => {
        const permissions = await rbacService.getUserPermissions(owner.userId, TEST_TENANT_ID, venueId);
        expect(permissions).toContain('*');
      });

      it('should allow venue-owner to perform any permission check', async () => {
        const hasEventsCreate = await rbacService.checkPermission(owner.userId, TEST_TENANT_ID, 'events:create', venueId);
        const hasRolesManage = await rbacService.checkPermission(owner.userId, TEST_TENANT_ID, 'roles:manage', venueId);
        const hasRandomPerm = await rbacService.checkPermission(owner.userId, TEST_TENANT_ID, 'random:permission', venueId);

        expect(hasEventsCreate).toBe(true);
        expect(hasRolesManage).toBe(true);
        expect(hasRandomPerm).toBe(true);
      });

      it('should override specific permission checks with wildcard', async () => {
        const permissions = await rbacService.getUserPermissions(owner.userId, TEST_TENANT_ID, venueId);

        expect(permissions.includes('*')).toBe(true);

        const canDoAnything = await rbacService.checkPermission(owner.userId, TEST_TENANT_ID, 'anything:you:want', venueId);
        expect(canDoAnything).toBe(true);
      });
    });

    describe('Role Permissions', () => {
      it('should grant venue-manager correct permissions', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        expect(permissions).toContain('events:create');
        expect(permissions).toContain('events:update');
        expect(permissions).toContain('events:delete');
        expect(permissions).toContain('tickets:view');
        expect(permissions).toContain('tickets:validate');
        expect(permissions).toContain('reports:view');
        expect(permissions).toContain('reports:export');
      });

      it('should not grant venue-manager roles:manage permission', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const hasRolesManage = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'roles:manage', venueId);
        expect(hasRolesManage).toBe(false);
      });

      it('should grant box-office correct permissions', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'box-office');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        expect(permissions).toContain('tickets:sell');
        expect(permissions).toContain('tickets:view');
        expect(permissions).toContain('tickets:validate');
        expect(permissions).toContain('payments:process');
        expect(permissions).toContain('reports:daily');
      });

      it('should not grant box-office events:create permission', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'box-office');

        const hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(false);
      });

      it('should grant door-staff correct permissions', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'door-staff');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        expect(permissions).toContain('tickets:validate');
        expect(permissions).toContain('tickets:view');
      });

      it('should not grant door-staff tickets:sell permission', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'door-staff');

        const hasTicketsSell = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'tickets:sell', venueId);
        expect(hasTicketsSell).toBe(false);
      });
    });

    describe('Customer Permissions (Always Included)', () => {
      it('should grant customer permissions to any authenticated user', async () => {
        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID);

        expect(permissions).toContain('tickets:purchase');
        expect(permissions).toContain('tickets:view-own');
        expect(permissions).toContain('tickets:transfer-own');
        expect(permissions).toContain('profile:update-own');
      });

      it('should grant customer permissions even without venue roles', async () => {
        const hasTicketsPurchase = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'tickets:purchase');
        expect(hasTicketsPurchase).toBe(true);
      });

      it('should combine customer permissions with venue roles', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'door-staff');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        expect(permissions).toContain('tickets:purchase');
        expect(permissions).toContain('profile:update-own');

        expect(permissions).toContain('tickets:validate');
        expect(permissions).toContain('tickets:view');
      });
    });

    describe('Multiple Roles', () => {
      it('should combine permissions from multiple roles (union)', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'box-office');
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'door-staff');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        expect(permissions).toContain('tickets:sell');
        expect(permissions).toContain('payments:process');

        expect(permissions).toContain('tickets:validate');
        expect(permissions).toContain('tickets:view');
      });

      it('should not duplicate permissions when roles overlap', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'box-office');
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'door-staff');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);

        const ticketsViewCount = permissions.filter(p => p === 'tickets:view').length;
        expect(ticketsViewCount).toBe(1);
      });
    });

    describe('Expiration Logic', () => {
      it('should not grant permissions for expired role', async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, granted_by, is_active, expires_at, granted_at)
           VALUES ($1, $2, $3, 'venue-manager', $4, true, $5, NOW())`,
          [TEST_TENANT_ID, user.userId, venueId, owner.userId, yesterday]
        );

        const hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(false);
      });

      it('should grant permissions when expires_at is NULL', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const permissions = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);
        expect(permissions).toContain('events:create');
      });

      it('should grant permissions when expires_at is in future', async () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager', tomorrow.toISOString());

        const hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(true);
      });
    });

    describe('Tenant Isolation (RLS)', () => {
      it('should not grant cross-tenant roles', async () => {
        const tenant2Id = await createSecondTenant();
        const venue2Id = createVenueId();

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const permissions = await rbacService.getUserPermissions(user.userId, tenant2Id, venue2Id);

        expect(permissions).not.toContain('events:create');
        expect(permissions).toContain('tickets:purchase');
      });

      it('should isolate venue roles list by tenant', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const rolesT1 = await rbacService.getVenueRoles(venueId);

        expect(rolesT1.some(r => r.userId === user.userId)).toBe(true);
      });
    });
  });

  describe('Database State Verification', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;
    let user: Awaited<ReturnType<typeof registerUser>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
      user = await registerUser();
      await sleep(700);
    });

    describe('Foreign Keys', () => {
      it('should verify granted_by references valid user', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const roles = await getUserVenueRolesFromDB(user.userId, venueId);
        expect(roles[0].granted_by).toBe(owner.userId);

        const granterResult = await testPool.query(
          'SELECT id FROM users WHERE id = $1',
          [roles[0].granted_by]
        );
        expect(granterResult.rows.length).toBe(1);
      });

      it('should cascade delete roles when user is deleted', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        let roles = await getVenueRolesFromDB(venueId, true);
        expect(roles.some(r => r.user_id === user.userId)).toBe(true);

        await testPool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [user.userId]);

        await testPool.query('DELETE FROM users WHERE id = $1', [user.userId]);

        roles = await getVenueRolesFromDB(venueId, true);
        expect(roles.some(r => r.user_id === user.userId)).toBe(false);
      });
    });

    describe('Timestamps', () => {
      it('should auto-set granted_at on grant', async () => {
        const before = new Date();
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');
        const after = new Date();

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        const result = await testPool.query(
          'SELECT granted_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2',
          [user.userId, venueId]
        );

        expect(result.rows.length).toBeGreaterThan(0);
        const grantedAt = new Date(result.rows[0].granted_at);

        expect(grantedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
        expect(grantedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      });
    });
  });

  describe('Integration Scenarios', () => {
    let owner: Awaited<ReturnType<typeof createVenueOwner>>;
    let user: Awaited<ReturnType<typeof registerUser>>;

    beforeEach(async () => {
      owner = await createVenueOwner(venueId);
      await sleep(700);
      user = await registerUser();
      await sleep(700);
    });

    describe('Full Lifecycle', () => {
      it('should complete grant → use → revoke → verify lifecycle', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        let hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(true);

        await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${user.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(false);
      });

      it('should expire role after expires_at passes', async () => {
        const soon = new Date(Date.now() + 1500);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager', soon.toISOString());

        let hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 2000));

        hasEventsCreate = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'events:create', venueId);
        expect(hasEventsCreate).toBe(false);
      }, 10000);
    });

    describe('Multi-Venue', () => {
      it('should isolate permissions by venue', async () => {
        const venue2Id = createVenueId();
        const owner2 = await createVenueOwner(venue2Id);
        await sleep(700);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        await grantRoleViaAPI(owner2.accessToken, venue2Id, user.userId, 'box-office');

        const perms1 = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venueId);
        expect(perms1).toContain('events:create');
        expect(perms1).not.toContain('tickets:sell');

        const perms2 = await rbacService.getUserPermissions(user.userId, TEST_TENANT_ID, venue2Id);
        expect(perms2).toContain('tickets:sell');
        expect(perms2).not.toContain('events:create');
      });
    });

    describe('Chain of Command', () => {
      it('should allow owner to grant manager role', async () => {
        const response = await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');
        expect(response.status).toBe(200);
      });

      it('should prevent manager from granting roles (no roles:manage)', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const newUser = await registerUser();
        await sleep(700);
        const response = await grantRoleViaAPI(user.accessToken, venueId, newUser.userId, 'door-staff');

        expect(response.status).toBe(403);
      });

      it('should allow owner to revoke manager', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const response = await request(app.server)
          .delete(`/auth/venues/${venueId}/roles/${user.userId}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Role Updates', () => {
      it('should update expires_at on re-grant', async () => {
        const oneHour = new Date(Date.now() + 60 * 60 * 1000);
        const oneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager', oneHour.toISOString());

        await testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_TENANT_ID]);
        let result = await testPool.query(
          'SELECT expires_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2 AND is_active = true',
          [user.userId, venueId]
        );
        const firstExpiry = new Date(result.rows[0].expires_at);

        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager', oneDay.toISOString());

        result = await testPool.query(
          'SELECT expires_at FROM user_venue_roles WHERE user_id = $1 AND venue_id = $2 AND is_active = true',
          [user.userId, venueId]
        );
        const secondExpiry = new Date(result.rows[0].expires_at);

        expect(secondExpiry.getTime()).toBeGreaterThan(firstExpiry.getTime());
        expect(result.rows.length).toBe(1);
      });
    });

    describe('Complex Permission Checks', () => {
      it('should check multiple permissions in sequence', async () => {
        await grantRoleViaAPI(owner.accessToken, venueId, user.userId, 'venue-manager');

        const checks = [
          'events:create',
          'events:update',
          'events:delete',
          'tickets:view',
          'reports:export',
        ];

        for (const perm of checks) {
          const has = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, perm, venueId);
          expect(has).toBe(true);
        }

        const noAccess = await rbacService.checkPermission(user.userId, TEST_TENANT_ID, 'roles:manage', venueId);
        expect(noAccess).toBe(false);
      });
    });
  });
});
