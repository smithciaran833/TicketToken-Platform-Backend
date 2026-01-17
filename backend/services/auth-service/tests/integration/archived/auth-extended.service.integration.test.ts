import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuthExtendedService } from '../../src/services/auth-extended.service';
import { EmailService } from '../../src/services/email.service';
import { ValidationError } from '../../src/errors';
import bcrypt from 'bcrypt';

// Override the database and redis imports
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

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock rate limiter to not block tests
jest.mock('../../src/utils/rateLimiter', () => ({
  passwordResetRateLimiter: {
    consume: jest.fn().mockResolvedValue({}),
  },
}));

describe('AuthExtendedService Integration Tests', () => {
  let authExtendedService: AuthExtendedService;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeAll(async () => {
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendMFABackupCodesEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    authExtendedService = new AuthExtendedService(mockEmailService);
  });

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
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
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
       RETURNING id, email, tenant_id, first_name, last_name, email_verified`,
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
        overrides.email_verified ?? false
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to check ValidationError with specific message
  async function expectValidationError(promise: Promise<any>, expectedMessage: string) {
    try {
      await promise;
      fail('Expected ValidationError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors).toContainEqual(
        expect.stringContaining(expectedMessage)
      );
    }
  }

  describe('requestPasswordReset', () => {
    it('should send password reset email for existing user', async () => {
      const user = await createDbUser();

      await authExtendedService.requestPasswordReset(user.email, '127.0.0.1');

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.id,
        user.email,
        user.first_name,
        TEST_TENANT_ID
      );
    });

    it('should create audit log for password reset request', async () => {
      const user = await createDbUser();

      await authExtendedService.requestPasswordReset(user.email, '127.0.0.1');

      const auditLog = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'password_reset_requested'`,
        [user.id]
      );

      expect(auditLog.rows.length).toBe(1);
      expect(auditLog.rows[0].ip_address).toBe('127.0.0.1');
    });

    it('should not throw for non-existent user (prevents enumeration)', async () => {
      await expect(
        authExtendedService.requestPasswordReset('nobody@example.com', '127.0.0.1')
      ).resolves.not.toThrow();

      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive email lookup', async () => {
      const user = await createDbUser({ email: 'test@example.com' });

      await authExtendedService.requestPasswordReset('TEST@EXAMPLE.COM', '127.0.0.1');

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const user = await createDbUser();
      const token = 'valid-reset-token-123';
      const newPassword = 'NewSecurePass123!';

      // Store token in Redis (simulating what emailService would do)
      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.resetPassword(token, newPassword, '127.0.0.1');

      // Verify password was updated
      const dbUser = await testPool.query(
        'SELECT password_hash, password_changed_at FROM users WHERE id = $1',
        [user.id]
      );

      const isNewPasswordValid = await bcrypt.compare(newPassword, dbUser.rows[0].password_hash);
      expect(isNewPasswordValid).toBe(true);
      expect(dbUser.rows[0].password_changed_at).not.toBeNull();
    });

    it('should delete reset token after use', async () => {
      const user = await createDbUser();
      const token = 'delete-after-use-token';
      const newPassword = 'NewSecurePass123!';

      const redisKey = `tenant:${TEST_TENANT_ID}:password-reset:${token}`;
      await testRedis.setex(
        redisKey,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.resetPassword(token, newPassword, '127.0.0.1');

      const tokenExists = await testRedis.get(redisKey);
      expect(tokenExists).toBeNull();
    });

    it('should create audit log for password reset', async () => {
      const user = await createDbUser();
      const token = 'audit-log-token';
      const newPassword = 'NewSecurePass123!';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.resetPassword(token, newPassword, '127.0.0.1');

      const auditLog = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'password_reset_completed'`,
        [user.id]
      );

      expect(auditLog.rows.length).toBe(1);
    });

    it('should reject invalid token', async () => {
      await expectValidationError(
        authExtendedService.resetPassword('invalid-token', 'NewPassword123!', '127.0.0.1'),
        'Invalid or expired reset token'
      );
    });

    it('should reject weak password', async () => {
      const user = await createDbUser();
      const token = 'weak-password-token';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await expectValidationError(
        authExtendedService.resetPassword(token, 'weak', '127.0.0.1'),
        'Password must be at least 8 characters'
      );
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const user = await createDbUser({ email_verified: false });
      const token = 'valid-verify-token';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:email-verify:${token}`,
        86400,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.verifyEmail(token);

      const dbUser = await testPool.query(
        'SELECT email_verified, email_verified_at FROM users WHERE id = $1',
        [user.id]
      );

      expect(dbUser.rows[0].email_verified).toBe(true);
      expect(dbUser.rows[0].email_verified_at).not.toBeNull();
    });

    it('should delete verification token after use', async () => {
      const user = await createDbUser({ email_verified: false });
      const token = 'delete-verify-token';

      const redisKey = `tenant:${TEST_TENANT_ID}:email-verify:${token}`;
      await testRedis.setex(
        redisKey,
        86400,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.verifyEmail(token);

      const tokenExists = await testRedis.get(redisKey);
      expect(tokenExists).toBeNull();
    });

    it('should create audit log for email verification', async () => {
      const user = await createDbUser({ email_verified: false });
      const token = 'audit-verify-token';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:email-verify:${token}`,
        86400,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      await authExtendedService.verifyEmail(token);

      const auditLog = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'email_verified'`,
        [user.id]
      );

      expect(auditLog.rows.length).toBe(1);
    });

    it('should reject invalid verification token', async () => {
      await expectValidationError(
        authExtendedService.verifyEmail('invalid-token'),
        'Invalid or expired verification token'
      );
    });

    it('should reject if email changed since token was issued', async () => {
      const user = await createDbUser({ email_verified: false });
      const token = 'email-mismatch-token';

      // Token was issued for original email
      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:email-verify:${token}`,
        86400,
        JSON.stringify({ userId: user.id, email: 'different@example.com', tenantId: TEST_TENANT_ID })
      );

      await expectValidationError(
        authExtendedService.verifyEmail(token),
        'Email mismatch'
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('should resend verification email', async () => {
      const user = await createDbUser({ email_verified: false });

      await authExtendedService.resendVerificationEmail(user.id);

      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        user.id,
        user.email,
        user.first_name,
        TEST_TENANT_ID
      );
    });

    it('should reject if email already verified', async () => {
      const user = await createDbUser({ email_verified: true });

      await expectValidationError(
        authExtendedService.resendVerificationEmail(user.id),
        'Email already verified'
      );
    });

    it('should reject for non-existent user', async () => {
      await expectValidationError(
        authExtendedService.resendVerificationEmail('00000000-0000-0000-0000-000000000099'),
        'User not found'
      );
    });

    it('should rate limit resend attempts', async () => {
      const user = await createDbUser({ email_verified: false });

      // First 3 should succeed
      await authExtendedService.resendVerificationEmail(user.id);
      await authExtendedService.resendVerificationEmail(user.id);
      await authExtendedService.resendVerificationEmail(user.id);

      // 4th should fail
      await expectValidationError(
        authExtendedService.resendVerificationEmail(user.id),
        'Too many resend attempts'
      );
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      const user = await createDbUser();
      const newPassword = 'NewSecurePass456!';

      await authExtendedService.changePassword(user.id, user.password, newPassword);

      // Verify new password works
      const dbUser = await testPool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [user.id]
      );

      const isNewPasswordValid = await bcrypt.compare(newPassword, dbUser.rows[0].password_hash);
      expect(isNewPasswordValid).toBe(true);
    });

    it('should invalidate all sessions after password change', async () => {
      const user = await createDbUser();

      // Create some sessions
      await testPool.query(
        `INSERT INTO user_sessions (id, user_id, started_at, tenant_id) VALUES ($1, $2, NOW(), $3)`,
        ['11111111-1111-1111-1111-111111111111', user.id, TEST_TENANT_ID]
      );
      await testPool.query(
        `INSERT INTO user_sessions (id, user_id, started_at, tenant_id) VALUES ($1, $2, NOW(), $3)`,
        ['22222222-2222-2222-2222-222222222222', user.id, TEST_TENANT_ID]
      );

      await authExtendedService.changePassword(user.id, user.password, 'NewSecurePass456!');

      const sessions = await testPool.query(
        `SELECT revoked_at FROM user_sessions WHERE user_id = $1`,
        [user.id]
      );

      expect(sessions.rows.every(s => s.revoked_at !== null)).toBe(true);
    });

    it('should create audit log for password change', async () => {
      const user = await createDbUser();

      await authExtendedService.changePassword(user.id, user.password, 'NewSecurePass456!');

      const auditLog = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'password_changed'`,
        [user.id]
      );

      expect(auditLog.rows.length).toBe(1);
    });

    it('should reject incorrect current password', async () => {
      const user = await createDbUser();

      await expect(
        authExtendedService.changePassword(user.id, 'WrongPassword123!', 'NewSecurePass456!')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should reject same password', async () => {
      const user = await createDbUser();

      await expectValidationError(
        authExtendedService.changePassword(user.id, user.password, user.password),
        'New password must be different'
      );
    });

    it('should reject weak new password', async () => {
      const user = await createDbUser();

      await expectValidationError(
        authExtendedService.changePassword(user.id, user.password, 'weak'),
        'Password must be at least 8 characters'
      );
    });

    it('should reject for non-existent user', async () => {
      await expect(
        authExtendedService.changePassword(
          '00000000-0000-0000-0000-000000000099',
          'OldPass123!',
          'NewPass456!'
        )
      ).rejects.toThrow('User not found');
    });
  });
});
