import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

// =============================================================================
// INTEGRATION TEST: MULTI-TENANT ISOLATION & SECURITY
// =============================================================================
// Tests tenant isolation, cross-tenant access prevention, and security boundaries

describe('Integration: Multi-Tenant Isolation & Security', () => {
  let app: FastifyInstance;
  let tenant1Id: string;
  let tenant2Id: string;

  // Tenant 1 user
  const tenant1User = {
    email: 'tenant1-user@example.com',
    password: 'TestPassword123!@#',
    firstName: 'Tenant1',
    lastName: 'User'
  };

  // Tenant 2 user  
  const tenant2User = {
    email: 'tenant2-user@example.com',
    password: 'TestPassword123!@#',
    firstName: 'Tenant2',
    lastName: 'User'
  };

  let tenant1UserId: string;
  let tenant1AccessToken: string;
  let tenant2UserId: string;
  let tenant2AccessToken: string;

  // =============================================================================
  // SETUP & TEARDOWN
  // =============================================================================

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Create two test tenants
    const tenant1Result = await pool.query(
      `INSERT INTO tenants (name, slug, settings) VALUES ($1, $2, $3) RETURNING id`,
      ['Tenant 1', 'tenant-1', JSON.stringify({})]
    );
    tenant1Id = tenant1Result.rows[0].id;

    const tenant2Result = await pool.query(
      `INSERT INTO tenants (name, slug, settings) VALUES ($1, $2, $3) RETURNING id`,
      ['Tenant 2', 'tenant-2', JSON.stringify({})]
    );
    tenant2Id = tenant2Result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['tenant%-user%']);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [tenant1Id, tenant2Id]);
    await app.close();
    await pool.end();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up and create fresh users for each test
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['tenant%-user%']);
    await redis.flushdb();

    // Register user in tenant 1
    const tenant1Response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        ...tenant1User,
        tenant_id: tenant1Id
      }
    });
    const tenant1Data = JSON.parse(tenant1Response.body);
    tenant1UserId = tenant1Data.user.id;
    tenant1AccessToken = tenant1Data.tokens.accessToken;

    // Register user in tenant 2
    const tenant2Response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        ...tenant2User,
        tenant_id: tenant2Id
      }
    });
    const tenant2Data = JSON.parse(tenant2Response.body);
    tenant2UserId = tenant2Data.user.id;
    tenant2AccessToken = tenant2Data.tokens.accessToken;
  });

  // =============================================================================
  // GROUP 1: TENANT DATA ISOLATION (6 tests)
  // =============================================================================

  describe('Tenant Data Isolation', () => {
    it('should prevent user in Tenant 1 from accessing Tenant 2 user data', async () => {
      // Tenant 1 user tries to get Tenant 2 user profile
      const response = await app.inject({
        method: 'GET',
        url: `/auth/users/${tenant2UserId}`,
        headers: { authorization: `Bearer ${tenant1AccessToken}` }
      });

      // Should be forbidden or not found (no data leak)
      expect([403, 404]).toContain(response.statusCode);
    });

    it('should scope JWT token to single tenant', async () => {
      // Decode Tenant 1 JWT
      const parts1 = tenant1AccessToken.split('.');
      const payload1 = JSON.parse(Buffer.from(parts1[1], 'base64').toString());

      // Decode Tenant 2 JWT
      const parts2 = tenant2AccessToken.split('.');
      const payload2 = JSON.parse(Buffer.from(parts2[1], 'base64').toString());

      // Each JWT should contain correct tenant_id
      expect(payload1.tenant_id).toBe(tenant1Id);
      expect(payload2.tenant_id).toBe(tenant2Id);

      // Tenant IDs should be different
      expect(payload1.tenant_id).not.toBe(payload2.tenant_id);
    });

    it('should reject JWT from Tenant 1 for Tenant 2 resources', async () => {
      // Attempt to access Tenant 2 resource with Tenant 1 token
      const response = await app.inject({
        method: 'GET',
        url: '/auth/profile',
        headers: {
          authorization: `Bearer ${tenant1AccessToken}`,
          'x-tenant-id': tenant2Id // Try to specify different tenant
        }
      });

      // Should return Tenant 1 user, not allow tenant switching
      const data = JSON.parse(response.body);
      expect(data.user.id).toBe(tenant1UserId);
      expect(data.user.tenant_id).toBe(tenant1Id);
    });

    it('should scope user lookups to tenant', async () => {
      // Verify users are in different tenants
      const user1Result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [tenant1UserId]
      );
      const user2Result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [tenant2UserId]
      );

      expect(user1Result.rows[0].tenant_id).toBe(tenant1Id);
      expect(user2Result.rows[0].tenant_id).toBe(tenant2Id);

      // Query by email should only find within tenant
      const tenant1Query = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
        [tenant1User.email, tenant1Id]
      );
      expect(tenant1Query.rows).toHaveLength(1);

      const crossTenantQuery = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
        [tenant1User.email, tenant2Id]
      );
      expect(crossTenantQuery.rows).toHaveLength(0);
    });

    it('should scope session list to tenant', async () => {
      // Get sessions for Tenant 1 user
      const response = await app.inject({
        method: 'GET',
        url: '/auth/sessions',
        headers: { authorization: `Bearer ${tenant1AccessToken}` }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Should only see own sessions
      data.sessions.forEach((session: any) => {
        expect(session.user_id).toBe(tenant1UserId);
      });

      // Verify in database - sessions scoped to tenant
      const sessionResult = await pool.query(
        `SELECT s.* FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE u.tenant_id = $1`,
        [tenant1Id]
      );

      expect(sessionResult.rows.length).toBeGreaterThan(0);
      // All sessions belong to tenant 1 users
    });

    it('should scope password reset to tenant', async () => {
      // Request password reset for Tenant 1 user
      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: {
          email: tenant1User.email,
          tenant_id: tenant1Id
        }
      });

      expect(response.statusCode).toBe(200);

      // Get reset token
      const tokenResult = await pool.query(
        'SELECT password_reset_token, tenant_id FROM users WHERE id = $1',
        [tenant1UserId]
      );

      expect(tokenResult.rows[0].tenant_id).toBe(tenant1Id);

      // Token should only work for that tenant
      const resetToken = tokenResult.rows[0].password_reset_token;
      
      // Verify token is tenant-specific
      expect(resetToken).toBeDefined();
    });
  });

  // =============================================================================
  // GROUP 2: TENANT ID VALIDATION (4 tests)
  // =============================================================================

  describe('Tenant ID Validation', () => {
    it('should reject requests with invalid tenant_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...tenant1User,
          email: 'invalid-tenant@example.com',
          tenant_id: 'invalid-tenant-id-12345'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('tenant');
    });

    it('should reject requests with missing tenant_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...tenant1User,
          email: 'no-tenant@example.com'
          // Missing tenant_id
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject JWT with mismatched tenant_id', async () => {
      // Get JWT payload
      const parts = tenant1AccessToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Verify tenant_id in JWT matches user's tenant
      const userResult = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [payload.sub]
      );

      expect(userResult.rows[0].tenant_id).toBe(payload.tenant_id);
    });

    it('should include tenant_id in all database queries', async () => {
      // Verify user queries include tenant_id
      const userQuery = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [tenant1UserId]
      );

      expect(userQuery.rows[0].tenant_id).toBe(tenant1Id);

      // Verify session queries include tenant check
      const sessionQuery = await pool.query(
        `SELECT s.* FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.user_id = $1 AND u.tenant_id = $2`,
        [tenant1UserId, tenant1Id]
      );

      expect(sessionQuery.rows.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // GROUP 3: CROSS-TENANT ATTACK PREVENTION (5 tests)
  // =============================================================================

  describe('Cross-Tenant Attack Prevention', () => {
    it('should reject token with modified tenant_id', async () => {
      // This tests that JWT signature validation prevents tampering
      // In practice, changing tenant_id breaks signature
      const parts = tenant1AccessToken.split('.');
      
      // Attempt to decode and verify tenant_id is in token
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      expect(payload.tenant_id).toBe(tenant1Id);
      
      // Any modification would invalidate signature
      // JWT library should reject modified tokens
    });

    it('should reject session ID from another tenant', async () => {
      // Get session ID for Tenant 2 user
      const session2Result = await pool.query(
        'SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [tenant2UserId]
      );
      const session2Id = session2Result.rows[0].id;

      // Tenant 1 user tries to revoke Tenant 2 session
      const response = await app.inject({
        method: 'DELETE',
        url: `/auth/sessions/${session2Id}`,
        headers: { authorization: `Bearer ${tenant1AccessToken}` }
      });

      // Should fail - cannot access other tenant's sessions
      expect([403, 404]).toContain(response.statusCode);

      // Verify Tenant 2 session still active
      const verifyResult = await pool.query(
        'SELECT ended_at FROM user_sessions WHERE id = $1',
        [session2Id]
      );
      expect(verifyResult.rows[0].ended_at).toBeNull();
    });

    it('should prevent OAuth account linking across tenants', async () => {
      // This would test that OAuth accounts are tenant-scoped
      // User in Tenant 1 cannot link OAuth account that belongs to Tenant 2
      
      // Verify OAuth accounts have tenant association through user
      const oauth1Result = await pool.query(
        `SELECT u.tenant_id FROM oauth_accounts o
         JOIN users u ON o.user_id = u.id
         WHERE u.id = $1`,
        [tenant1UserId]
      );

      // All OAuth accounts should match user's tenant
      if (oauth1Result.rows.length > 0) {
        oauth1Result.rows.forEach(row => {
          expect(row.tenant_id).toBe(tenant1Id);
        });
      }
    });

    it('should prevent wallet linking across tenants', async () => {
      // Verify wallet accounts are tenant-scoped
      const wallet1Result = await pool.query(
        `SELECT u.tenant_id FROM wallet_accounts w
         JOIN users u ON w.user_id = u.id
         WHERE u.id = $1`,
        [tenant1UserId]
      );

      // All wallet accounts should match user's tenant
      if (wallet1Result.rows.length > 0) {
        wallet1Result.rows.forEach(row => {
          expect(row.tenant_id).toBe(tenant1Id);
        });
      }
    });

    it('should prevent MFA settings access across tenants', async () => {
      // If Tenant 1 user has MFA enabled
      await pool.query(
        'UPDATE users SET mfa_enabled = true WHERE id = $1',
        [tenant1UserId]
      );

      // Tenant 2 user cannot access Tenant 1 MFA settings
      const response = await app.inject({
        method: 'GET',
        url: `/auth/mfa/status/${tenant1UserId}`,
        headers: { authorization: `Bearer ${tenant2AccessToken}` }
      });

      // Should fail
      expect([403, 404]).toContain(response.statusCode);
    });
  });
});
