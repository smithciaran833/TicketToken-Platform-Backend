import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuditService } from '../../src/services/audit.service';
import bcrypt from 'bcrypt';

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

describe('AuditService Integration Tests', () => {
  let auditService: AuditService;

  beforeAll(async () => {
    auditService = new AuditService();
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
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id`,
      [userData.email, hashedPassword, userData.firstName, userData.lastName, userData.tenant_id]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to get audit logs
  async function getAuditLogs(filters: { userId?: string; action?: string; tenantId?: string } = {}) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }
    if (filters.action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(filters.action);
    }
    if (filters.tenantId) {
      query += ` AND tenant_id = $${paramIndex++}`;
      params.push(filters.tenantId);
    }

    query += ' ORDER BY created_at DESC';
    const result = await testPool.query(query, params);
    return result.rows;
  }

  describe('log', () => {
    it('should insert audit log with all fields', async () => {
      const user = await createDbUser();

      await auditService.log({
        userId: user.id,
        tenantId: TEST_TENANT_ID,
        action: 'test.action',
        actionType: 'authentication',
        resourceType: 'user',
        resourceId: user.id,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        metadata: { foo: 'bar' },
        status: 'success'
      });

      const logs = await getAuditLogs({ userId: user.id });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('test.action');
      expect(logs[0].action_type).toBe('authentication');
      expect(logs[0].resource_type).toBe('user');
      expect(logs[0].ip_address).toBe('192.168.1.1');
      expect(logs[0].success).toBe(true);
    });

    it('should insert audit log with failure status', async () => {
      const user = await createDbUser();

      await auditService.log({
        userId: user.id,
        tenantId: TEST_TENANT_ID,
        action: 'test.failed',
        actionType: 'authentication',
        status: 'failure',
        errorMessage: 'Something went wrong'
      });

      const logs = await getAuditLogs({ userId: user.id });

      expect(logs[0].success).toBe(false);
      expect(logs[0].error_message).toBe('Something went wrong');
    });

    it('should handle missing optional fields', async () => {
      await auditService.log({
        action: 'test.minimal',
        actionType: 'security',
        status: 'success'
      });

      const logs = await getAuditLogs({ action: 'test.minimal' });

      expect(logs.length).toBe(1);
      expect(logs[0].user_id).toBeNull();
    });
  });

  describe('logLogin', () => {
    it('should log successful login', async () => {
      const user = await createDbUser();

      await auditService.logLogin(user.id, '10.0.0.1', 'Chrome/100', true, undefined, TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.login' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(true);
      expect(logs[0].ip_address).toBe('10.0.0.1');
    });

    it('should log failed login', async () => {
      const user = await createDbUser();

      await auditService.logLogin(user.id, '10.0.0.1', 'Chrome/100', false, 'Invalid password', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.login' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error_message).toBe('Invalid password');
    });
  });

  describe('logLogout', () => {
    it('should log logout with session ID', async () => {
      const user = await createDbUser();
      const sessionId = '00000000-0000-0000-0000-000000000123';

      await auditService.logLogout(user.id, '10.0.0.1', 'Chrome/100', sessionId, TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.logout' });

      expect(logs.length).toBe(1);
      expect(logs[0].resource_id).toBe(sessionId);
    });
  });

  describe('logRegistration', () => {
    it('should log user registration', async () => {
      const user = await createDbUser();

      await auditService.logRegistration(user.id, user.email, '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.registration' });

      expect(logs.length).toBe(1);
      expect(logs[0].action_type).toBe('authentication');
      const metadata = logs[0].metadata;
      expect(metadata.email).toBe(user.email);
    });
  });

  describe('logTokenRefresh', () => {
    it('should log token refresh', async () => {
      const user = await createDbUser();

      await auditService.logTokenRefresh(user.id, '10.0.0.5', TEST_TENANT_ID);

      const result = await testPool.query(
        'SELECT * FROM token_refresh_log WHERE user_id = $1',
        [user.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].user_id).toBe(user.id);
      expect(result.rows[0].ip_address).toBe('10.0.0.5');
      expect(result.rows[0].tenant_id).toBe(TEST_TENANT_ID);
    });
  });

  describe('logSessionCreated', () => {
    it('should log session creation', async () => {
      const user = await createDbUser();
      const sessionId = '00000000-0000-0000-0000-000000000456';

      await auditService.logSessionCreated(user.id, sessionId, '10.0.0.1', 'Firefox/90', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'session.created' });

      expect(logs.length).toBe(1);
      expect(logs[0].action_type).toBe('session');
      expect(logs[0].resource_id).toBe(sessionId);
    });
  });

  describe('logSessionRevoked', () => {
    it('should log session revocation', async () => {
      const user = await createDbUser();
      const sessionId = '00000000-0000-0000-0000-000000000789';

      await auditService.logSessionRevoked(user.id, sessionId, user.id, 'User requested', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'session.revoked' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.reason).toBe('User requested');
    });
  });

  describe('logAllSessionsRevoked', () => {
    it('should log all sessions revocation', async () => {
      const user = await createDbUser();

      await auditService.logAllSessionsRevoked(user.id, user.id, 'Password changed', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'session.all_revoked' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.reason).toBe('Password changed');
    });
  });

  describe('logPasswordChange', () => {
    it('should log password change', async () => {
      const user = await createDbUser();

      await auditService.logPasswordChange(user.id, '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.password_changed' });

      expect(logs.length).toBe(1);
      expect(logs[0].action_type).toBe('security');
    });
  });

  describe('logPasswordReset', () => {
    it('should log password reset via email', async () => {
      const user = await createDbUser();

      await auditService.logPasswordReset(user.id, '10.0.0.1', 'email', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.password_reset' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.method).toBe('email');
    });

    it('should log password reset via admin', async () => {
      const user = await createDbUser();

      await auditService.logPasswordReset(user.id, '10.0.0.1', 'admin', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.password_reset' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.method).toBe('admin');
    });
  });

  describe('logMFAEnabled', () => {
    it('should log MFA enabled with default method', async () => {
      const user = await createDbUser();

      await auditService.logMFAEnabled(user.id, undefined, '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_enabled' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.method).toBe('totp');
    });

    it('should log MFA enabled with specific method', async () => {
      const user = await createDbUser();

      await auditService.logMFAEnabled(user.id, 'sms', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_enabled' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.method).toBe('sms');
    });
  });

  describe('logMFADisabled', () => {
    it('should log MFA disabled', async () => {
      const user = await createDbUser();

      await auditService.logMFADisabled(user.id, user.id, 'User requested', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_disabled' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.reason).toBe('User requested');
    });
  });

  describe('logMFAVerification', () => {
    it('should log successful MFA verification', async () => {
      const user = await createDbUser();

      await auditService.logMFAVerification(user.id, true, 'totp', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_verified' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(true);
    });

    it('should log failed MFA verification', async () => {
      const user = await createDbUser();

      await auditService.logMFAVerification(user.id, false, 'totp', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_failed' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(false);
    });
  });

  describe('logFailedLoginAttempt', () => {
    it('should log failed login attempt without user ID', async () => {
      await auditService.logFailedLoginAttempt('unknown@example.com', '10.0.0.1', 'Chrome', 'User not found', TEST_TENANT_ID);

      const logs = await getAuditLogs({ action: 'user.login_failed' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.email).toBe('unknown@example.com');
      expect(logs[0].error_message).toBe('User not found');
    });
  });

  describe('logAccountLockout', () => {
    it('should log account lockout', async () => {
      const user = await createDbUser();

      await auditService.logAccountLockout(user.id, user.email, '10.0.0.1', 900, TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.account_locked' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.lockoutDuration).toBe(900);
    });
  });

  describe('logRoleGrant', () => {
    it('should log role grant', async () => {
      const admin = await createDbUser({ email: 'admin@test.com' });
      const user = await createDbUser({ email: 'user@test.com' });
      const venueId = '00000000-0000-0000-0000-000000000001';

      await auditService.logRoleGrant(admin.id, user.id, venueId, 'venue-manager', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: admin.id, action: 'role.granted' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.targetUserId).toBe(user.id);
      expect(logs[0].metadata.role).toBe('venue-manager');
    });
  });

  describe('logRoleRevoke', () => {
    it('should log role revoke', async () => {
      const admin = await createDbUser({ email: 'admin@test.com' });
      const user = await createDbUser({ email: 'user@test.com' });
      const venueId = '00000000-0000-0000-0000-000000000001';

      await auditService.logRoleRevoke(admin.id, user.id, venueId, 'venue-manager', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: admin.id, action: 'role.revoked' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.targetUserId).toBe(user.id);
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied', async () => {
      const user = await createDbUser();

      await auditService.logPermissionDenied(user.id, 'event', 'delete', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'permission.denied' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.attemptedAction).toBe('delete');
      expect(logs[0].success).toBe(false);
    });
  });

  describe('logDataExport', () => {
    it('should log data export', async () => {
      const user = await createDbUser();

      await auditService.logDataExport(user.id, 'full_profile', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'data.exported' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.exportType).toBe('full_profile');
    });
  });

  describe('logDataDeletion', () => {
    it('should log data deletion', async () => {
      const user = await createDbUser();

      await auditService.logDataDeletion(user.id, user.id, 'GDPR request', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'data.deleted' });

      expect(logs.length).toBe(1);
      expect(logs[0].metadata.reason).toBe('GDPR request');
    });
  });
});
