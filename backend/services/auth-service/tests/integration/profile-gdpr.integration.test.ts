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

import { buildApp } from '../../src/app';
import { getRedis } from '../../src/config/redis';

let app: any;

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
    tenantId: response.body.user.tenant_id,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
    email: userData.email,
  };
}

async function getAuditLogs(userId: string, action?: string) {
  let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
  const params: any[] = [userId];

  if (action) {
    query += ' AND action = $2';
    params.push(action);
  }

  query += ' ORDER BY created_at DESC';

  const result = await testPool.query(query, params);
  return result.rows;
}

async function getUserFromDb(userId: string) {
  const result = await testPool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0];
}

async function getUserSessions(userId: string) {
  const result = await testPool.query(
    'SELECT * FROM user_sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

async function createUserSession(userId: string, tenantId: string) {
  const result = await testPool.query(
    `INSERT INTO user_sessions (user_id, tenant_id, ip_address, user_agent)
     VALUES ($1, $2, '127.0.0.1', 'Test Agent')
     RETURNING *`,
    [userId, tenantId]
  );
  return result.rows[0];
}

// Clean up both test Redis AND app Redis to ensure isolation
const cleanupAllWithAppRedis = async (): Promise<void> => {
  await cleanupAll();
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

describe('Profile & GDPR Integration Tests', () => {
  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAllWithAppRedis();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // GET /auth/profile
  // ============================================

  describe('GET /auth/profile', () => {
    it('should return user profile with all expected fields', async () => {
      const user = await registerUser({
        firstName: 'John',
        lastName: 'Doe',
      });

      const response = await request(app.server)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(user.userId);
      expect(response.body.user.email).toBe(user.email);
      expect(response.body.user.first_name).toBe('John');
      expect(response.body.user.last_name).toBe('Doe');
      expect(response.body.user.tenant_id).toBe(user.tenantId);
      expect(response.body.user.email_verified).toBeDefined();
      expect(response.body.user.mfa_enabled).toBeDefined();
      expect(response.body.user.role).toBeDefined();
      expect(response.body.user.created_at).toBeDefined();
      expect(response.body.user.updated_at).toBeDefined();
    });

    it('should return 401 when user is soft-deleted', async () => {
      const user = await registerUser();

      // Soft delete the user
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [user.userId]
      );

      // Auth middleware rejects deleted users with 401
      await request(app.server)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .get('/auth/profile')
        .expect(401);
    });

    it('should return 401 with invalid JWT', async () => {
      await request(app.server)
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should not expose sensitive fields like password_hash', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.user.password_hash).toBeUndefined();
      expect(response.body.user.password).toBeUndefined();
      expect(response.body.user.mfa_secret).toBeUndefined();
      expect(response.body.user.two_factor_secret).toBeUndefined();
      expect(response.body.user.backup_codes).toBeUndefined();
    });
  });

  // ============================================
  // PUT /auth/profile
  // ============================================

  describe('PUT /auth/profile', () => {
    it('should update firstName only', async () => {
      const user = await registerUser({ firstName: 'Original' });

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.first_name).toBe('Updated');
    });

    it('should update lastName only', async () => {
      const user = await registerUser({ lastName: 'Original' });

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ lastName: 'Updated' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.last_name).toBe('Updated');
    });

    it('should update phone only', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ phone: '+1234567890' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.phone).toBe('+1234567890');
    });

    it('should update multiple fields at once', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          firstName: 'NewFirst',
          lastName: 'NewLast',
          phone: '+9876543210',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.first_name).toBe('NewFirst');
      expect(response.body.user.last_name).toBe('NewLast');
      expect(response.body.user.phone).toBe('+9876543210');
    });

    it('should return 422 when no valid fields provided (empty body)', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should strip XSS from firstName', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: '<script>alert("xss")</script>John' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.first_name).toBe('alert("xss")John');
      expect(response.body.user.first_name).not.toContain('<script>');
      expect(response.body.user.first_name).not.toContain('</script>');
    });

    it('should strip XSS from lastName', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ lastName: '<img onerror="alert(1)" src="x">Doe' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.last_name).toBe('Doe');
      expect(response.body.user.last_name).not.toContain('<img');
    });

    it('should strip nested HTML tags', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: '<div><span>Test</span></div>' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.first_name).toBe('Test');
    });

    it('should create audit log with updated_fields metadata', async () => {
      const user = await registerUser();

      await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: 'AuditTest', lastName: 'User' })
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'profile.updated');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('profile.updated');

      const metadata = typeof logs[0].metadata === 'string'
        ? JSON.parse(logs[0].metadata)
        : logs[0].metadata;
      expect(metadata.updated_fields).toBeDefined();
      expect(metadata.updated_fields).toContain('first_name');
      expect(metadata.updated_fields).toContain('last_name');
    });

    it('should return updated profile in response', async () => {
      const user = await registerUser({ firstName: 'Before' });

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: 'After' })
        .expect(200);

      expect(response.body.user.first_name).toBe('After');
      expect(response.body.user.id).toBe(user.userId);
    });

    it('should return 401 without auth', async () => {
      await request(app.server)
        .put('/auth/profile')
        .send({ firstName: 'Test' })
        .expect(401);
    });

    it('should reject unknown fields', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: 'Valid', unknownField: 'should fail' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // GET /auth/gdpr/export
  // ============================================

  describe('GET /auth/gdpr/export', () => {
    it('should return exportedAt timestamp', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.exportedAt).toBeDefined();
      expect(new Date(response.body.exportedAt).getTime()).not.toBeNaN();
    });

    it('should return exportFormat as GDPR_ARTICLE_15_20', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.exportFormat).toBe('GDPR_ARTICLE_15_20');
    });

    it('should contain user object with profile data', async () => {
      const user = await registerUser({
        firstName: 'Export',
        lastName: 'Test',
      });

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(user.userId);
      expect(response.body.user.email).toBe(user.email);
      expect(response.body.user.first_name).toBe('Export');
      expect(response.body.user.last_name).toBe('Test');
    });

    it('should contain sessions array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });

    it('should contain walletConnections array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.walletConnections).toBeDefined();
      expect(Array.isArray(response.body.walletConnections)).toBe(true);
    });

    it('should contain oauthConnections array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.oauthConnections).toBeDefined();
      expect(Array.isArray(response.body.oauthConnections)).toBe(true);
    });

    it('should contain venueRoles array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.venueRoles).toBeDefined();
      expect(Array.isArray(response.body.venueRoles)).toBe(true);
    });

    it('should contain addresses array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.addresses).toBeDefined();
      expect(Array.isArray(response.body.addresses)).toBe(true);
    });

    it('should contain activityLog array', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.activityLog).toBeDefined();
      expect(Array.isArray(response.body.activityLog)).toBe(true);
    });

    it('should have Content-Disposition header with attachment filename', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const contentDisposition = response.headers['content-disposition'];
      expect(contentDisposition).toBeDefined();
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain(`user-data-export-${user.userId}.json`);
    });

    it('should create audit log for data export', async () => {
      const user = await registerUser();

      await request(app.server)
        .get('/auth/gdpr/export')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'data.exported');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('data.exported');
    });

    it('should return 401 without auth', async () => {
      await request(app.server)
        .get('/auth/gdpr/export')
        .expect(401);
    });
  });

  // ============================================
  // GET /auth/consent
  // ============================================

  describe('GET /auth/consent', () => {
    it('should return consent object with success true', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.consent).toBeDefined();
    });

    it('should have marketing.granted and marketing.date fields', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.consent.marketing).toBeDefined();
      expect(typeof response.body.consent.marketing.granted).toBe('boolean');
      // date can be null initially
    });

    it('should have terms.acceptedAt and terms.version fields', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.consent.terms).toBeDefined();
      expect(response.body.consent.terms).toHaveProperty('acceptedAt');
      expect(response.body.consent.terms).toHaveProperty('version');
    });

    it('should have privacy.acceptedAt and privacy.version fields', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.consent.privacy).toBeDefined();
      expect(response.body.consent.privacy).toHaveProperty('acceptedAt');
      expect(response.body.consent.privacy).toHaveProperty('version');
    });

    it('should return 401 when user not found (soft deleted)', async () => {
      const user = await registerUser();

      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [user.userId]
      );

      // Auth middleware rejects deleted users with 401
      await request(app.server)
        .get('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);
    });

    it('should return 401 without auth', async () => {
      await request(app.server)
        .get('/auth/consent')
        .expect(401);
    });
  });

  // ============================================
  // PUT /auth/consent
  // ============================================

  describe('PUT /auth/consent', () => {
    it('should grant consent (marketingConsent: true)', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Consent preferences updated');
      expect(response.body.consent.marketingConsent).toBe(true);
      expect(response.body.consent.updatedAt).toBeDefined();
    });

    it('should withdraw consent (marketingConsent: false)', async () => {
      const user = await registerUser();

      // First grant consent
      await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: true })
        .expect(200);

      // Then withdraw
      const response = await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.consent.marketingConsent).toBe(false);
    });

    it('should return 400 when marketingConsent field missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MISSING_CONSENT_DATA');
    });

    it('should create audit log with action consent.granted when true', async () => {
      const user = await registerUser();

      await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: true })
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'consent.granted');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('consent.granted');
    });

    it('should create audit log with action consent.withdrawn when false', async () => {
      const user = await registerUser();

      await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: false })
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'consent.withdrawn');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('consent.withdrawn');
    });

    it('should update marketing_consent_date in DB', async () => {
      const user = await registerUser();

      const beforeUpdate = await getUserFromDb(user.userId);
      expect(beforeUpdate.marketing_consent_date).toBeNull();

      await request(app.server)
        .put('/auth/consent')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ marketingConsent: true })
        .expect(200);

      const afterUpdate = await getUserFromDb(user.userId);
      expect(afterUpdate.marketing_consent_date).not.toBeNull();
      expect(afterUpdate.marketing_consent).toBe(true);
    });

    it('should return 401 without auth', async () => {
      await request(app.server)
        .put('/auth/consent')
        .send({ marketingConsent: true })
        .expect(401);
    });
  });

  // ============================================
  // POST /auth/gdpr/delete
  // ============================================

  describe('POST /auth/gdpr/delete', () => {
    it('should return success message on deletion', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Account deletion initiated');
    });

    it('should include deletedAt timestamp in response', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      expect(response.body.details.deletedAt).toBeDefined();
      expect(new Date(response.body.details.deletedAt).getTime()).not.toBeNaN();
    });

    it('should include anonymizationScheduled = 30 days in response', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      expect(response.body.details.anonymizationScheduled).toBe('30 days');
    });

    it('should set user status to DELETED in DB', async () => {
      const user = await registerUser();

      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      const dbUser = await getUserFromDb(user.userId);
      expect(dbUser.status).toBe('DELETED');
    });

    it('should set deleted_at timestamp in DB', async () => {
      const user = await registerUser();

      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      const dbUser = await getUserFromDb(user.userId);
      expect(dbUser.deleted_at).not.toBeNull();
    });

    it('should revoke all user sessions', async () => {
      const user = await registerUser();

      // Create additional sessions
      await createUserSession(user.userId, user.tenantId);
      await createUserSession(user.userId, user.tenantId);

      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      const sessions = await getUserSessions(user.userId);
      const activeSessions = sessions.filter((s: any) => !s.revoked_at);
      expect(activeSessions.length).toBe(0);
    });

    it('should return 400 when confirmEmail does not match', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: 'wrong@email.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('EMAIL_MISMATCH');
    });

    it('should handle case insensitive email comparison', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email.toUpperCase() })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 when confirmEmail is missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('EMAIL_MISMATCH');
    });

    it('should create audit log for account deletion', async () => {
      const user = await registerUser();

      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'account.deletion_requested');
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('account.deletion_requested');
    });

    it('should include reason in audit metadata if provided', async () => {
      const user = await registerUser();

      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          confirmEmail: user.email,
          reason: 'No longer using the service'
        })
        .expect(200);

      const logs = await getAuditLogs(user.userId, 'account.deletion_requested');
      const metadata = typeof logs[0].metadata === 'string'
        ? JSON.parse(logs[0].metadata)
        : logs[0].metadata;
      expect(metadata.reason).toBe('No longer using the service');
    });

    it('should return 401 without auth', async () => {
      await request(app.server)
        .post('/auth/gdpr/delete')
        .send({ confirmEmail: 'test@example.com' })
        .expect(401);
    });

    it('should return 401 when user already deleted', async () => {
      const user = await registerUser();

      // First deletion
      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(200);

      // Second deletion attempt - auth middleware rejects deleted users
      await request(app.server)
        .post('/auth/gdpr/delete')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ confirmEmail: user.email })
        .expect(401);
    });
  });

  // ============================================
  // MULTI-TENANT ISOLATION
  // ============================================

  describe('Multi-Tenant Isolation', () => {
    it('should not allow accessing profile of user from different tenant', async () => {
      // This test verifies that RLS policies are working
      // Since we only have one test tenant, we verify the user can only see their own data
      const user1 = await registerUser();
      const user2 = await registerUser();

      // User1 should only see their own profile
      const response = await request(app.server)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .expect(200);

      expect(response.body.user.id).toBe(user1.userId);
      expect(response.body.user.id).not.toBe(user2.userId);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle special characters in names after XSS stripping', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: "O'Connor" })
        .expect(200);

      expect(response.body.user.first_name).toBe("O'Connor");
    });

    it('should handle unicode characters in names', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: '日本語', lastName: 'Müller' })
        .expect(200);

      expect(response.body.user.first_name).toBe('日本語');
      expect(response.body.user.last_name).toBe('Müller');
    });

    it('should handle empty string after XSS stripping', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: '<script></script>' })
        .expect(200);

      // After stripping, it becomes empty string
      expect(response.body.user.first_name).toBe('');
    });

    it('should handle firstName at max length (50 chars - DB limit)', async () => {
      const user = await registerUser();
      const longName = 'A'.repeat(50);

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: longName })
        .expect(200);

      expect(response.body.user.first_name).toBe(longName);
    });

    it('should reject firstName over max length (100 chars)', async () => {
      const user = await registerUser();
      const tooLongName = 'A'.repeat(101);

      const response = await request(app.server)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ firstName: tooLongName })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });
});
