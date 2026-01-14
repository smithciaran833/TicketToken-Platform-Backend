import { AuditService } from '../../src/services/audit.service';
import { pool } from '../../src/config/database';

/**
 * INTEGRATION TESTS FOR AUDIT SERVICE
 * 
 * These tests verify audit logging functionality:
 * - Database logging of audit events
 * - Convenience methods for common events
 * - Metadata JSON storage
 * - Silent failure handling
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
  
  console.log(`✓ Running audit service integration tests against test environment`);
});

describe('AuditService Integration Tests', () => {
  let service: AuditService;
  let testUserId: string;
  const testUserIds: string[] = [];

  beforeAll(async () => {
    service = new AuditService();
    
    // Create test user
    const result = await pool.query(
      `INSERT INTO auth.users (email, password_hash, is_verified) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`audit-test-${Date.now()}@example.com`, 'hash', true]
    );
    testUserId = result.rows[0].id;
    testUserIds.push(testUserId);
  });

  afterEach(async () => {
    // Clean up audit logs after each test
    await pool.query('DELETE FROM audit.audit_logs WHERE user_id = ANY($1)', [testUserIds]);
  });

  afterAll(async () => {
    // Clean up test users
    await pool.query('DELETE FROM auth.users WHERE id = ANY($1)', [testUserIds]);
    await pool.end();
  });

  describe('log()', () => {
    it('should insert audit log to database', async () => {
      await service.log({
        userId: testUserId,
        action: 'test.action',
        actionType: 'authentication',
        resourceType: 'user',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        status: 'success'
      });

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'test.action']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].service).toBe('auth-service');
      expect(result.rows[0].action_type).toBe('authentication');
      expect(result.rows[0].status).toBe('success');
    });

    it('should stringify metadata to JSON', async () => {
      const metadata = { key1: 'value1', key2: 123 };

      await service.log({
        userId: testUserId,
        action: 'test.metadata',
        actionType: 'data_access',
        metadata,
        status: 'success'
      });

      const result = await pool.query(
        'SELECT metadata FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'test.metadata']
      );

      const storedMetadata = JSON.parse(result.rows[0].metadata);
      expect(storedMetadata).toEqual(metadata);
    });

    it('should use null for undefined metadata', async () => {
      await service.log({
        userId: testUserId,
        action: 'test.no-metadata',
        actionType: 'authentication',
        status: 'success'
      });

      const result = await pool.query(
        'SELECT metadata FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'test.no-metadata']
      );

      expect(result.rows[0].metadata).toBeNull();
    });

    it('should store error message for failures', async () => {
      await service.log({
        userId: testUserId,
        action: 'test.failure',
        actionType: 'authentication',
        status: 'failure',
        errorMessage: 'Invalid credentials'
      });

      const result = await pool.query(
        'SELECT error_message FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'test.failure']
      );

      expect(result.rows[0].error_message).toBe('Invalid credentials');
    });

    it('should store all event fields correctly', async () => {
      await service.log({
        userId: testUserId,
        action: 'test.complete',
        actionType: 'authorization',
        resourceType: 'venue',
        resourceId: 'venue-123',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
        metadata: { test: 'data' },
        status: 'success'
      });

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'test.complete']
      );

      const log = result.rows[0];
      expect(log.action_type).toBe('authorization');
      expect(log.resource_type).toBe('venue');
      expect(log.resource_id).toBe('venue-123');
      expect(log.ip_address).toBe('10.0.0.1');
      expect(log.user_agent).toBe('Mozilla/5.0');
    });

    it('should not throw on database error (silent fail)', async () => {
      // This should not throw even if there's an issue
      await expect(
        service.log({
          userId: 'invalid-uuid',
          action: 'test.invalid',
          actionType: 'authentication',
          status: 'success'
        })
      ).resolves.not.toThrow();
    });
  });

  describe('logLogin()', () => {
    it('should log successful login', async () => {
      await service.logLogin(testUserId, '192.168.1.1', 'Chrome', true);

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'user.login']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action_type).toBe('authentication');
      expect(result.rows[0].status).toBe('success');
      expect(result.rows[0].ip_address).toBe('192.168.1.1');
      expect(result.rows[0].user_agent).toBe('Chrome');
    });

    it('should log failed login with error message', async () => {
      await service.logLogin(testUserId, '10.0.0.1', 'Firefox', false, 'Invalid password');

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1',
        [testUserId, 'user.login']
      );

      expect(result.rows[0].status).toBe('failure');
      expect(result.rows[0].error_message).toBe('Invalid password');
    });
  });

  describe('logRegistration()', () => {
    it('should log user registration', async () => {
      const email = 'newuser@example.com';

      await service.logRegistration(testUserId, email, '192.168.1.50');

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'user.registration']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action_type).toBe('authentication');
      expect(result.rows[0].status).toBe('success');
      
      const metadata = JSON.parse(result.rows[0].metadata);
      expect(metadata.email).toBe(email);
    });
  });

  describe('logPasswordChange()', () => {
    it('should log password change', async () => {
      await service.logPasswordChange(testUserId, '172.16.0.1');

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'user.password_changed']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action_type).toBe('security');
      expect(result.rows[0].resource_type).toBe('user');
      expect(result.rows[0].status).toBe('success');
    });
  });

  describe('logMFAEnabled()', () => {
    it('should log MFA enablement', async () => {
      await service.logMFAEnabled(testUserId);

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'user.mfa_enabled']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action_type).toBe('security');
      expect(result.rows[0].status).toBe('success');
    });
  });

  describe('logTokenRefresh()', () => {
    it('should log token refresh', async () => {
      await service.logTokenRefresh(testUserId, '10.20.30.40');

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'token.refreshed']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].action_type).toBe('authentication');
      expect(result.rows[0].resource_type).toBe('token');
      expect(result.rows[0].ip_address).toBe('10.20.30.40');
    });
  });

  describe('logRoleGrant()', () => {
    it('should log role grant with metadata', async () => {
      // Create second user
      const result = await pool.query(
        `INSERT INTO auth.users (email, password_hash, is_verified) 
         VALUES ($1, $2, $3) RETURNING id`,
        [`role-grantee-${Date.now()}@example.com`, 'hash', true]
      );
      const granteeUserId = result.rows[0].id;
      testUserIds.push(granteeUserId);

      await service.logRoleGrant(testUserId, granteeUserId, 'venue-123', 'venue-manager');

      const auditResult = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1 AND action = $2',
        [testUserId, 'role.granted']
      );

      expect(auditResult.rows).toHaveLength(1);
      expect(auditResult.rows[0].action_type).toBe('authorization');
      expect(auditResult.rows[0].resource_type).toBe('venue');
      expect(auditResult.rows[0].resource_id).toBe('venue-123');
      
      const metadata = JSON.parse(auditResult.rows[0].metadata);
      expect(metadata.targetUserId).toBe(granteeUserId);
      expect(metadata.role).toBe('venue-manager');
    });
  });

  describe('Multiple audit logs', () => {
    it('should handle multiple logs for same user', async () => {
      await service.logLogin(testUserId, '1.1.1.1', 'Agent1', true);
      await service.logPasswordChange(testUserId, '2.2.2.2');
      await service.logMFAEnabled(testUserId);

      const result = await pool.query(
        'SELECT * FROM audit.audit_logs WHERE user_id = $1',
        [testUserId]
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(3);
    });

    it('should maintain chronological order', async () => {
      await service.logLogin(testUserId, '1.1.1.1', 'Agent', true);
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.logPasswordChange(testUserId, '1.1.1.1');

      const result = await pool.query(
        'SELECT action, created_at FROM audit.audit_logs WHERE user_id = $1 ORDER BY created_at',
        [testUserId]
      );

      const actions = result.rows.map(r => r.action);
      expect(actions.indexOf('user.login')).toBeLessThan(actions.indexOf('user.password_changed'));
    });
  });
});
