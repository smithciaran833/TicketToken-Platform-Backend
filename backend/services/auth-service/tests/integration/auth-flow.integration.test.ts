import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
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

// Import the app after mocking
let app: any;

// ============================================
// TEST HELPERS
// ============================================

const getUserByEmail = async (email: string) => {
  const result = await testPool.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );
  return result.rows[0];
};

const getUserSessions = async (userId: string) => {
  const result = await testPool.query(
    'SELECT * FROM user_sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows;
};

const getInvalidatedTokens = async (userId: string) => {
  const result = await testPool.query(
    'SELECT * FROM invalidated_tokens WHERE user_id = $1',
    [userId]
  );
  return result.rows;
};

const redisKeyExists = async (pattern: string): Promise<boolean> => {
  const keys = await testRedis.keys(pattern);
  return keys.length > 0;
};

const extractJti = (token: string): string | null => {
  const decoded = jwt.decode(token) as any;
  return decoded?.jti || null;
};

const getRedisValue = async (key: string): Promise<any | null> => {
  const data = await testRedis.get(key);
  return data ? JSON.parse(data) : null;
};

// Helper to create a verification token manually (since EmailService is mocked)
const createVerificationToken = async (userId: string, email: string): Promise<string> => {
  const token = `test-verify-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  await testRedis.setex(
    `tenant:${TEST_TENANT_ID}:email-verify:${token}`,
    24 * 60 * 60,
    JSON.stringify({ userId, email, tenantId: TEST_TENANT_ID })
  );
  return token;
};

// Helper to create a password reset token manually (since EmailService is mocked)
const createPasswordResetToken = async (userId: string, email: string): Promise<string> => {
  const token = `test-reset-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  await testRedis.setex(
    `tenant:${TEST_TENANT_ID}:password-reset:${token}`,
    60 * 60,
    JSON.stringify({ userId, email, tenantId: TEST_TENANT_ID })
  );
  return token;
};

// Helper to set up MFA for a user and return the secret
const setupMFAForUser = async (accessToken: string): Promise<{ secret: string; backupCodes: string[] }> => {
  const setupResponse = await request(app.server)
    .post('/auth/mfa/setup')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const { secret } = setupResponse.body;

  const validToken = speakeasy.totp({
    secret,
    encoding: 'base32',
  });

  const verifyResponse = await request(app.server)
    .post('/auth/mfa/verify-setup')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ token: validToken })
    .expect(200);

  return {
    secret,
    backupCodes: verifyResponse.body.backupCodes,
  };
};

const getAuditLogs = async (userId: string, action?: string): Promise<any[]> => {
  let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
  const params: any[] = [userId];

  if (action) {
    query += ' AND action = $2';
    params.push(action);
  }

  query += ' ORDER BY created_at DESC';

  const result = await testPool.query(query, params);
  return result.rows;
};

// ============================================
// MAIN TEST SUITE
// ============================================

describe('Auth Flow Integration Tests', () => {
  let registeredUser: {
    email: string;
    password: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
  };

  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // POST /auth/register
  // ============================================

  describe('POST /auth/register - User Registration', () => {
    it('should successfully register a new user with valid data', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.email_verified).toBe(false);
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();

      const dbUser = await getUserByEmail(userData.email);
      expect(dbUser).toBeDefined();
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.password_hash).toBeDefined();
      expect(dbUser.password_hash).not.toBe(userData.password);

      const isValidHash = await bcrypt.compare(userData.password, dbUser.password_hash);
      expect(isValidHash).toBe(true);

      const sessions = await getUserSessions(dbUser.id);
      expect(sessions.length).toBeGreaterThan(0);

      const jti = extractJti(response.body.tokens.refreshToken);
      const refreshTokenExists = await redisKeyExists(`*refresh_token:${jti}`);
      expect(refreshTokenExists).toBe(true);
    });

    it('should return 409 when registering with duplicate email', async () => {
      const userData = createTestUser();

      await request(app.server).post('/auth/register').send(userData).expect(201);

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.code).toBe('CONFLICT');
    });

    it('should return 400 when registering with invalid tenant_id', async () => {
      const userData = createTestUser({
        tenant_id: '00000000-0000-0000-0000-000000000099',
      });

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.code).toBe('TENANT_INVALID');
    });

    it('should return 400 when email is missing', async () => {
      const { email, ...userData } = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when password is missing', async () => {
      const { password, ...userData } = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when firstName is missing', async () => {
      const { firstName, ...userData } = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when lastName is missing', async () => {
      const { lastName, ...userData } = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when tenant_id is missing', async () => {
      const { tenant_id, ...userData } = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when email format is invalid', async () => {
      const userData = createTestUser({ email: 'not-an-email' });

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when password is too short', async () => {
      const userData = createTestUser({ password: 'short' });

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when tenant_id is not a valid UUID', async () => {
      const userData = createTestUser({ tenant_id: 'not-a-uuid' });

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /auth/login
  // ============================================

  describe('POST /auth/login - User Login', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully login with valid credentials', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
        })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();

      const dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.last_login_at).toBeDefined();
      expect(dbUser.login_count).toBeGreaterThan(0);
      expect(dbUser.failed_login_attempts).toBe(0);
    });

    it('should return 401 with invalid password', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');

      const dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.failed_login_attempts).toBeGreaterThan(0);
    });

    it('should return 401 with non-existent email', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should lock account after 5 failed login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.server)
          .post('/auth/login')
          .send({
            email: registeredUser.email,
            password: 'WrongPassword123!',
          });
      }

      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      const dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.failed_login_attempts).toBeGreaterThanOrEqual(5);
      expect(dbUser.locked_until).toBeDefined();
    });

    it('should reset failed_login_attempts on successful login', async () => {
      // Fail twice
      await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: 'WrongPassword123!' });
      await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: 'WrongPassword123!' });

      let dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.failed_login_attempts).toBe(2);

      // Succeed
      await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: registeredUser.password })
        .expect(200);

      dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.failed_login_attempts).toBe(0);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({ password: 'SomePassword123!' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return requiresMFA when user has MFA enabled', async () => {
      // Setup MFA for the user
      await setupMFAForUser(registeredUser.accessToken);

      // Now login should require MFA
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
        })
        .expect(200);

      expect(response.body.requiresMFA).toBe(true);
      expect(response.body.userId).toBe(registeredUser.userId);
      expect(response.body.tokens).toBeUndefined();
    });

    it('should login successfully with valid MFA token', async () => {
      // Setup MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate valid TOTP
      const mfaToken = speakeasy.totp({ secret, encoding: 'base32' });

      // Login with MFA token
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken,
        })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
    });

    it('should return 401 with invalid MFA token', async () => {
      // Setup MFA
      await setupMFAForUser(registeredUser.accessToken);

      // Login with invalid MFA token
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: '000000',
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should login successfully with valid backup code', async () => {
      // Setup MFA
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      // Login with backup code (use first one)
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: backupCodes[0],
        })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
    });
  });

  // ============================================
  // POST /auth/refresh
  // ============================================

  describe('POST /auth/refresh - Token Refresh', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully refresh tokens with valid refresh token', async () => {
      const response = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.accessToken).not.toBe(registeredUser.accessToken);
      expect(response.body.refreshToken).not.toBe(registeredUser.refreshToken);
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.code).toBe('TOKEN_INVALID');
    });

    it('should return 400 when refreshToken is missing', async () => {
      const response = await request(app.server)
        .post('/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should invalidate old refresh token after use', async () => {
      const oldJti = extractJti(registeredUser.refreshToken);

      // Use refresh token
      const response = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(200);

      // Old token should be removed from Redis
      const oldTokenExists = await redisKeyExists(`*refresh_token:${oldJti}`);
      expect(oldTokenExists).toBe(false);

      // New token should exist
      const newJti = extractJti(response.body.refreshToken);
      const newTokenExists = await redisKeyExists(`*refresh_token:${newJti}`);
      expect(newTokenExists).toBe(true);
    });

    it('should return 401 when reusing a refresh token', async () => {
      const originalRefreshToken = registeredUser.refreshToken;

      // Use refresh token first time
      await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(200);

      // Try to reuse the same refresh token
      const response = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(401);

      expect(response.body.code).toBe('TOKEN_INVALID');
    });
  });

  // ============================================
  // POST /auth/logout
  // ============================================

  describe('POST /auth/logout - User Logout', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully logout and invalidate tokens', async () => {
      const response = await request(app.server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/logout')
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(401);
    });

    it('should end all active sessions on logout', async () => {
      await request(app.server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(200);

      const sessions = await getUserSessions(registeredUser.userId);
      const activeSessions = sessions.filter(s => s.ended_at === null);
      expect(activeSessions.length).toBe(0);
    });
  });

  // ============================================
  // PUT /auth/change-password
  // ============================================

  describe('PUT /auth/change-password - Change Password', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully change password with correct current password', async () => {
      const newPassword = 'NewPassword456!';
      const oldPasswordHash = (await getUserByEmail(registeredUser.email)).password_hash;

      const response = await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword,
        })
        .expect(200);

      expect(response.body.message).toBeDefined();

      const dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.password_hash).not.toBe(oldPasswordHash);

      const isValidNewPassword = await bcrypt.compare(newPassword, dbUser.password_hash);
      expect(isValidNewPassword).toBe(true);
    });

    it('should return 401 with incorrect current password', async () => {
      const response = await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when new password is same as current', async () => {
      const response = await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword: registeredUser.password,
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when new password is too short', async () => {
      const response = await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword: 'short',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .put('/auth/change-password')
        .send({
          currentPassword: registeredUser.password,
          newPassword: 'NewPassword456!',
        })
        .expect(401);
    });

    it('should invalidate all sessions after password change', async () => {
      await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      const sessions = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND revoked_at IS NOT NULL',
        [registeredUser.userId]
      );
      expect(sessions.rows.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // POST /auth/forgot-password
  // ============================================

  describe('POST /auth/forgot-password - Forgot Password', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should return 200 with generic message for existing email', async () => {
      const response = await request(app.server)
        .post('/auth/forgot-password')
        .send({ email: registeredUser.email })
        .expect(200);

      expect(response.body.message).toMatch(/if an account exists/i);
    });

    it('should return 200 with same generic message for non-existent email', async () => {
      const response = await request(app.server)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toMatch(/if an account exists/i);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app.server)
        .post('/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when email format is invalid', async () => {
      const response = await request(app.server)
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /auth/reset-password
  // ============================================

  describe('POST /auth/reset-password - Reset Password', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully reset password with valid token', async () => {
      const resetToken = await createPasswordResetToken(registeredUser.userId, registeredUser.email);
      const newPassword = 'NewPassword456!';

      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword })
        .expect(200);

      expect(response.body.message).toMatch(/reset successfully/i);

      // Verify new password works
      await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: newPassword })
        .expect(200);
    });

    it('should return 400 with invalid token', async () => {
      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPassword456!' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 with expired token', async () => {
      const expiredToken = `expired-${Date.now()}`;
      // Create token with 1 second TTL
      await testRedis.setex(
        `tenant:${TEST_TENANT_ID}:password-reset:${expiredToken}`,
        1,
        JSON.stringify({ userId: registeredUser.userId, email: registeredUser.email, tenantId: TEST_TENANT_ID })
      );

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: expiredToken, newPassword: 'NewPassword456!' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ newPassword: 'NewPassword456!' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when newPassword is missing', async () => {
      const resetToken = await createPasswordResetToken(registeredUser.userId, registeredUser.email);

      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: resetToken })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when newPassword is too short', async () => {
      const resetToken = await createPasswordResetToken(registeredUser.userId, registeredUser.email);

      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'short' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should consume token after successful reset (cannot reuse)', async () => {
      const resetToken = await createPasswordResetToken(registeredUser.userId, registeredUser.email);

      // First reset should succeed
      await request(app.server)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPassword456!' })
        .expect(200);

      // Second reset with same token should fail
      const response = await request(app.server)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherPassword789!' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  // ============================================
  // GET /auth/verify-email
  // ============================================

  describe('GET /auth/verify-email - Email Verification', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully verify email with valid token', async () => {
      const verifyToken = await createVerificationToken(registeredUser.userId, registeredUser.email);

      const response = await request(app.server)
        .get(`/auth/verify-email?token=${verifyToken}`)
        .expect(200);

      expect(response.body.message).toMatch(/verified successfully/i);

      const dbUser = await getUserByEmail(registeredUser.email);
      expect(dbUser.email_verified).toBe(true);
    });

    it('should return 400 with invalid token', async () => {
      const response = await request(app.server)
        .get('/auth/verify-email?token=invalid-token')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app.server)
        .get('/auth/verify-email')
        .expect(400);

      // Validation middleware catches this, returns detail
      expect(response.body.detail).toBeDefined();
    });

    it('should consume token after successful verification (cannot reuse)', async () => {
      const verifyToken = await createVerificationToken(registeredUser.userId, registeredUser.email);

      // First verification should succeed
      await request(app.server)
        .get(`/auth/verify-email?token=${verifyToken}`)
        .expect(200);

      // Second verification with same token should fail
      const response = await request(app.server)
        .get(`/auth/verify-email?token=${verifyToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  // ============================================
  // GET /auth/verify
  // ============================================

  describe('GET /auth/verify - Token Verification', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should return valid true with user data for valid token', async () => {
      const response = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(registeredUser.userId);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .get('/auth/verify')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.server)
        .get('/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 401 with malformed authorization header', async () => {
      await request(app.server)
        .get('/auth/verify')
        .set('Authorization', 'NotBearer token')
        .expect(401);
    });
  });

  // ============================================
  // GET /auth/me
  // ============================================

  describe('GET /auth/me - Get Current User', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should return current user data with valid token', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(registeredUser.userId);
      expect(response.body.user.email).toBe(registeredUser.email);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .get('/auth/me')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.server)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================
  // POST /auth/resend-verification
  // ============================================

  describe('POST /auth/resend-verification - Resend Verification Email', () => {
    beforeEach(async () => {
      const userData = createTestUser();
      const regResponse = await request(app.server).post('/auth/register').send(userData).expect(201);

      registeredUser = {
        email: userData.email,
        password: userData.password,
        userId: regResponse.body.user.id,
        accessToken: regResponse.body.tokens.accessToken,
        refreshToken: regResponse.body.tokens.refreshToken,
      };
    });

    it('should successfully resend verification email', async () => {
      const response = await request(app.server)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.message).toMatch(/verification email sent/i);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/resend-verification')
        .expect(401);
    });

    it('should return 400 when email is already verified', async () => {
      // Verify the email first
      const verifyToken = await createVerificationToken(registeredUser.userId, registeredUser.email);
      await request(app.server)
        .get(`/auth/verify-email?token=${verifyToken}`)
        .expect(200);

      // Try to resend verification
      const response = await request(app.server)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);

      // ValidationError puts message in errors array
      expect(response.body.error).toMatch(/already verified/i);
    });

    it('should rate limit resend requests', async () => {
      // Send 4 requests (limit is 3 per hour)
      for (let i = 0; i < 3; i++) {
        await request(app.server)
          .post('/auth/resend-verification')
          .set('Authorization', `Bearer ${registeredUser.accessToken}`);
      }

      // Fourth request should be rate limited
      const response = await request(app.server)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);

      // ValidationError puts message in errors array
      expect(response.body.error).toMatch(/too many/i);
    });
  });
});
