import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuthExtendedController } from '../../src/controllers/auth-extended.controller';
import { AuthExtendedService } from '../../src/services/auth-extended.service';
import { EmailService } from '../../src/services/email.service';
import bcrypt from 'bcrypt';

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

jest.mock('../../src/utils/rateLimiter', () => ({
  passwordResetRateLimiter: {
    consume: jest.fn().mockResolvedValue({}),
  },
}));

describe('AuthExtendedController Integration Tests', () => {
  let authExtendedController: AuthExtendedController;
  let authExtendedService: AuthExtendedService;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeAll(async () => {
    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendMFABackupCodesEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    authExtendedService = new AuthExtendedService(mockEmailService);
    authExtendedController = new AuthExtendedController(authExtendedService);
  });

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

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

  function createMockRequest(overrides: Partial<any> = {}) {
    return {
      body: overrides.body || {},
      params: overrides.params || {},
      query: overrides.query || {},
      user: overrides.user || null,
      ip: overrides.ip || '127.0.0.1',
      headers: {
        'user-agent': 'Jest Test Agent',
        ...overrides.headers,
      },
      ...overrides,
    };
  }

  function createMockReply() {
    const reply: any = {
      statusCode: 200,
      body: null,
      status: jest.fn().mockImplementation((code) => {
        reply.statusCode = code;
        return reply;
      }),
      send: jest.fn().mockImplementation((body) => {
        reply.body = body;
        return reply;
      }),
    };
    return reply;
  }

  describe('forgotPassword', () => {
    it('should return success message for existing user', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        body: { email: user.email },
      });
      const reply = createMockReply();

      await authExtendedController.forgotPassword(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('If an account exists');
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return same success message for non-existent user (prevents enumeration)', async () => {
      const request = createMockRequest({
        body: { email: 'nonexistent@example.com' },
      });
      const reply = createMockReply();

      await authExtendedController.forgotPassword(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('If an account exists');
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should handle rate limit errors', async () => {
      const { passwordResetRateLimiter } = require('../../src/utils/rateLimiter');
      passwordResetRateLimiter.consume.mockRejectedValueOnce(new Error('Too many requests'));

      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });
      const reply = createMockReply();

      await authExtendedController.forgotPassword(request, reply);

      expect(reply.statusCode).toBe(429);
      expect(reply.body.error).toContain('Too many');
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const user = await createDbUser();
      const token = 'valid-reset-token';
      const newPassword = 'NewSecurePass123!';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      const request = createMockRequest({
        body: { token, newPassword },
      });
      const reply = createMockReply();

      await authExtendedController.resetPassword(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('reset successfully');

      // Verify password was actually changed
      const dbUser = await testPool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [user.id]
      );
      const isNewPasswordValid = await bcrypt.compare(newPassword, dbUser.rows[0].password_hash);
      expect(isNewPasswordValid).toBe(true);
    });

    it('should return 400 for invalid token', async () => {
      const request = createMockRequest({
        body: { token: 'invalid-token', newPassword: 'NewSecurePass123!' },
      });
      const reply = createMockReply();

      await authExtendedController.resetPassword(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toContain('Invalid or expired');
    });

    it('should return 400 for weak password', async () => {
      const user = await createDbUser();
      const token = 'weak-pass-token';

      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
        3600,
        JSON.stringify({ userId: user.id, email: user.email, tenantId: TEST_TENANT_ID })
      );

      const request = createMockRequest({
        body: { token, newPassword: 'weak' },
      });
      const reply = createMockReply();

      await authExtendedController.resetPassword(request, reply);

      expect(reply.statusCode).toBe(400);
      // Controller extracts error.errors[0] for ValidationError
      expect(reply.body.error).toContain('8 characters');
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

      const request = createMockRequest({
        query: { token },
      });
      const reply = createMockReply();

      await authExtendedController.verifyEmail(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('verified successfully');

      // Verify in database
      const dbUser = await testPool.query(
        'SELECT email_verified FROM users WHERE id = $1',
        [user.id]
      );
      expect(dbUser.rows[0].email_verified).toBe(true);
    });

    it('should return 400 when token is missing', async () => {
      const request = createMockRequest({
        query: {},
      });
      const reply = createMockReply();

      await authExtendedController.verifyEmail(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toContain('token is required');
    });

    it('should return 400 for invalid token', async () => {
      const request = createMockRequest({
        query: { token: 'invalid-token' },
      });
      const reply = createMockReply();

      await authExtendedController.verifyEmail(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toContain('Invalid or expired');
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email for authenticated user', async () => {
      const user = await createDbUser({ email_verified: false });

      const request = createMockRequest({
        user: { id: user.id },
      });
      const reply = createMockReply();

      await authExtendedController.resendVerification(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('Verification email sent');
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should return 401 for unauthenticated request', async () => {
      const request = createMockRequest({
        user: null,
      });
      const reply = createMockReply();

      await authExtendedController.resendVerification(request, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error).toBe('Unauthorized');
    });

    it('should return 400 if email already verified', async () => {
      const user = await createDbUser({ email_verified: true });

      const request = createMockRequest({
        user: { id: user.id },
      });
      const reply = createMockReply();

      await authExtendedController.resendVerification(request, reply);

      expect(reply.statusCode).toBe(400);
      // ValidationError.message is "Validation failed", not the specific error
      expect(reply.body.error).toBe('Validation failed');
    });

    it('should return 400 when rate limited', async () => {
      const user = await createDbUser({ email_verified: false });

      const request = createMockRequest({
        user: { id: user.id },
      });

      // Exhaust rate limit
      for (let i = 0; i < 3; i++) {
        const reply = createMockReply();
        await authExtendedController.resendVerification(request, reply);
      }

      // 4th request should fail
      const reply = createMockReply();
      await authExtendedController.resendVerification(request, reply);

      expect(reply.statusCode).toBe(400);
      // ValidationError.message is "Validation failed"
      expect(reply.body.error).toBe('Validation failed');
    });
  });

  describe('changePassword', () => {
    it('should change password for authenticated user', async () => {
      const user = await createDbUser();
      const newPassword = 'NewSecurePass456!';

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          currentPassword: user.password,
          newPassword,
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.message).toContain('changed successfully');

      // Verify password was changed
      const dbUser = await testPool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [user.id]
      );
      const isNewPasswordValid = await bcrypt.compare(newPassword, dbUser.rows[0].password_hash);
      expect(isNewPasswordValid).toBe(true);
    });

    it('should return 401 for unauthenticated request', async () => {
      const request = createMockRequest({
        user: null,
        body: {
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass456!',
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error).toBe('Unauthorized');
    });

    it('should return 401 for incorrect current password', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewSecurePass456!',
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error).toContain('incorrect');
    });

    it('should return 400 for weak new password', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          currentPassword: user.password,
          newPassword: 'weak',
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(400);
      // ValidationError.message is "Validation failed"
      expect(reply.body.error).toBe('Validation failed');
    });

    it('should return 400 when new password same as current', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          currentPassword: user.password,
          newPassword: user.password,
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(400);
      // ValidationError.message is "Validation failed"
      expect(reply.body.error).toBe('Validation failed');
    });

    it('should invalidate all sessions after password change', async () => {
      const user = await createDbUser();

      // Create sessions with tenant_id
      await testPool.query(
        `INSERT INTO user_sessions (id, tenant_id, user_id, started_at) VALUES ($1, $2, $3, NOW())`,
        ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', TEST_TENANT_ID, user.id]
      );
      await testPool.query(
        `INSERT INTO user_sessions (id, tenant_id, user_id, started_at) VALUES ($1, $2, $3, NOW())`,
        ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', TEST_TENANT_ID, user.id]
      );

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          currentPassword: user.password,
          newPassword: 'NewSecurePass456!',
        },
      });
      const reply = createMockReply();

      await authExtendedController.changePassword(request, reply);

      expect(reply.statusCode).toBe(200);

      // Verify sessions were revoked
      const sessions = await testPool.query(
        `SELECT revoked_at FROM user_sessions WHERE user_id = $1`,
        [user.id]
      );
      expect(sessions.rows.every(s => s.revoked_at !== null)).toBe(true);
    });
  });
});
