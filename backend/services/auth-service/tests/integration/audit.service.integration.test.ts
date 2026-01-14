import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuditService } from '../../src/services/audit.service';
import bcrypt from 'bcrypt';

// Override the database import to use test instance
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

// Mock logger to avoid noise in tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
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
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to get audit logs from DB
  async function getAuditLogs(filters: { userId?: string; action?: string } = {}) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      params.push(filters.userId);
      query += ` AND user_id = $${params.length}`;
    }
    if (filters.action) {
      params.push(filters.action);
      query += ` AND action = $${params.length}`;
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
        ipAddress: '192.168.1.100',
        userAgent: 'Jest Test Agent',
        metadata: { key: 'value' },
        status: 'success',
      });

      const logs = await getAuditLogs({ userId: user.id });

      expect(logs.length).toBe(1);
      expect(logs[0].service).toBe('auth-service');
      expect(logs[0].action).toBe('test.action');
      expect(logs[0].action_type).toBe('authentication');
      expect(logs[0].resource_type).toBe('user');
      expect(logs[0].resource_id).toBe(user.id);
      expect(logs[0].ip_address).toBe('192.168.1.100');
      expect(logs[0].user_agent).toBe('Jest Test Agent');
      expect(logs[0].success).toBe(true);
      expect(logs[0].tenant_id).toBe(TEST_TENANT_ID);

      const metadata = logs[0].metadata;
      expect(metadata.key).toBe('value');
      expect(metadata.correlationId).toBe('test-correlation-id');
    });

    it('should insert audit log with failure status', async () => {
      const user = await createDbUser();

      await auditService.log({
        userId: user.id,
        action: 'test.failed_action',
        actionType: 'security',
        status: 'failure',
        errorMessage: 'Something went wrong',
      });

      const logs = await getAuditLogs({ userId: user.id });

      expect(logs[0].success).toBe(false);
      expect(logs[0].error_message).toBe('Something went wrong');
    });

    it('should handle missing optional fields', async () => {
      await auditService.log({
        action: 'minimal.action',
        actionType: 'data_access',
        status: 'success',
      });

      const logs = await getAuditLogs({ action: 'minimal.action' });

      expect(logs.length).toBe(1);
      expect(logs[0].user_id).toBeNull();
      expect(logs[0].tenant_id).toBeNull();
      expect(logs[0].resource_type).toBe('unknown');
    });
  });

  describe('logLogin', () => {
    it('should log successful login', async () => {
      const user = await createDbUser();

      await auditService.logLogin(user.id, '10.0.0.1', 'Chrome/100', true, undefined, TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.login' });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('user.login');
      expect(logs[0].action_type).toBe('authentication');
      expect(logs[0].success).toBe(true);
      expect(logs[0].ip_address).toBe('10.0.0.1');
      expect(logs[0].user_agent).toBe('Chrome/100');
    });

    it('should log failed login', async () => {
      const user = await createDbUser();

      await auditService.logLogin(user.id, '10.0.0.1', 'Chrome/100', false, 'Invalid password');

      const logs = await getAuditLogs({ userId: user.id, action: 'user.login' });

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
      expect(logs[0].action).toBe('user.logout');
      expect(logs[0].resource_type).toBe('session');
      expect(logs[0].resource_id).toBe(sessionId);

      const metadata = logs[0].metadata;
      expect(metadata.sessionId).toBe(sessionId);
    });
  });

  describe('logRegistration', () => {
    it('should log user registration', async () => {
      const user = await createDbUser();

      await auditService.logRegistration(user.id, user.email, '192.168.1.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.registration' });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('user.registration');
      expect(logs[0].resource_type).toBe('user');

      const metadata = logs[0].metadata;
      expect(metadata.email).toBe(user.email);
    });
  });

  describe('logTokenRefresh', () => {
    it('should log token refresh', async () => {
      const user = await createDbUser();

      await auditService.logTokenRefresh(user.id, '10.0.0.5', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'token.refreshed' });

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('token.refreshed');
      expect(logs[0].resource_type).toBe('token');
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
      const admin = await createDbUser();
      const sessionId = '00000000-0000-0000-0000-000000000789';

      await auditService.logSessionRevoked(user.id, sessionId, admin.id, 'Security concern', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'session.revoked' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.revokedBy).toBe(admin.id);
      expect(metadata.reason).toBe('Security concern');
    });
  });

  describe('logAllSessionsRevoked', () => {
    it('should log all sessions revocation', async () => {
      const user = await createDbUser();

      await auditService.logAllSessionsRevoked(user.id, user.id, 'Password changed', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'session.all_revoked' });

      expect(logs.length).toBe(1);
      expect(logs[0].resource_type).toBe('user');
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

      const metadata = logs[0].metadata;
      expect(metadata.method).toBe('email');
    });

    it('should log password reset via admin', async () => {
      const user = await createDbUser();

      await auditService.logPasswordReset(user.id, '10.0.0.1', 'admin', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.password_reset' });

      const metadata = logs[0].metadata;
      expect(metadata.method).toBe('admin');
    });
  });

  describe('logMFAEnabled', () => {
    it('should log MFA enabled with default method', async () => {
      const user = await createDbUser();

      await auditService.logMFAEnabled(user.id, undefined, '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_enabled' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.method).toBe('totp');
    });

    it('should log MFA enabled with specific method', async () => {
      const user = await createDbUser();

      await auditService.logMFAEnabled(user.id, 'sms', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_enabled' });

      const metadata = logs[0].metadata;
      expect(metadata.method).toBe('sms');
    });
  });

  describe('logMFADisabled', () => {
    it('should log MFA disabled', async () => {
      const user = await createDbUser();
      const admin = await createDbUser();

      await auditService.logMFADisabled(user.id, admin.id, 'User request', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_disabled' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.disabledBy).toBe(admin.id);
      expect(metadata.reason).toBe('User request');
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

      await auditService.logMFAVerification(user.id, false, 'backup_code', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.mfa_failed' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(false);

      const metadata = logs[0].metadata;
      expect(metadata.method).toBe('backup_code');
    });
  });

  describe('logFailedLoginAttempt', () => {
    it('should log failed login attempt without user ID', async () => {
      await auditService.logFailedLoginAttempt('unknown@example.com', '10.0.0.1', 'Chrome', 'User not found', TEST_TENANT_ID);

      const logs = await getAuditLogs({ action: 'user.login_failed' });

      expect(logs.length).toBe(1);
      expect(logs[0].user_id).toBeNull();
      expect(logs[0].success).toBe(false);

      const metadata = logs[0].metadata;
      expect(metadata.email).toBe('unknown@example.com');
      expect(metadata.reason).toBe('User not found');
    });
  });

  describe('logAccountLockout', () => {
    it('should log account lockout', async () => {
      const user = await createDbUser();

      await auditService.logAccountLockout(user.id, user.email, '10.0.0.1', 900, TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'user.account_locked' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.email).toBe(user.email);
      expect(metadata.lockoutDuration).toBe(900);
    });
  });

  describe('logRoleGrant', () => {
    it('should log role grant', async () => {
      const admin = await createDbUser();
      const user = await createDbUser();
      const venueId = '00000000-0000-0000-0000-000000000099';

      await auditService.logRoleGrant(admin.id, user.id, venueId, 'venue-manager', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: admin.id, action: 'role.granted' });

      expect(logs.length).toBe(1);
      expect(logs[0].action_type).toBe('authorization');
      expect(logs[0].resource_type).toBe('venue');
      expect(logs[0].resource_id).toBe(venueId);

      const metadata = logs[0].metadata;
      expect(metadata.targetUserId).toBe(user.id);
      expect(metadata.role).toBe('venue-manager');
    });
  });

  describe('logRoleRevoke', () => {
    it('should log role revoke', async () => {
      const admin = await createDbUser();
      const user = await createDbUser();
      const venueId = '00000000-0000-0000-0000-000000000099';

      await auditService.logRoleRevoke(admin.id, user.id, venueId, 'box-office', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: admin.id, action: 'role.revoked' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.targetUserId).toBe(user.id);
      expect(metadata.role).toBe('box-office');
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied', async () => {
      const user = await createDbUser();

      await auditService.logPermissionDenied(user.id, 'venue', 'delete', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'permission.denied' });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].resource_type).toBe('venue');

      const metadata = logs[0].metadata;
      expect(metadata.attemptedAction).toBe('delete');
    });
  });

  describe('logDataExport', () => {
    it('should log data export', async () => {
      const user = await createDbUser();

      await auditService.logDataExport(user.id, 'full_profile', '10.0.0.1', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'data.exported' });

      expect(logs.length).toBe(1);
      expect(logs[0].action_type).toBe('data_access');

      const metadata = logs[0].metadata;
      expect(metadata.exportType).toBe('full_profile');
    });
  });

  describe('logDataDeletion', () => {
    it('should log data deletion', async () => {
      const user = await createDbUser();
      const admin = await createDbUser();

      await auditService.logDataDeletion(user.id, admin.id, 'GDPR request', TEST_TENANT_ID);

      const logs = await getAuditLogs({ userId: user.id, action: 'data.deleted' });

      expect(logs.length).toBe(1);

      const metadata = logs[0].metadata;
      expect(metadata.deletedBy).toBe(admin.id);
      expect(metadata.reason).toBe('GDPR request');
    });
  });
});
