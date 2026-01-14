import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuthController } from '../../src/controllers/auth.controller';
import { AuthService } from '../../src/services/auth.service';
import { MFAService } from '../../src/services/mfa.service';
import { JWTService } from '../../src/services/jwt.service';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';

// Override the database and redis imports to use test instances
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

// Mock email service
jest.mock('../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock captcha service
jest.mock('../../src/services/captcha.service', () => ({
  captchaService: {
    isCaptchaRequired: jest.fn().mockResolvedValue(false),
    verify: jest.fn().mockResolvedValue({ success: true }),
    recordFailure: jest.fn().mockResolvedValue({ requiresCaptcha: false, attempts: 1 }),
    clearFailures: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock cache services
jest.mock('../../src/services/cache-integration', () => ({
  userCache: {
    getUser: jest.fn().mockResolvedValue(null),
    setUser: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn().mockResolvedValue(undefined),
  },
  sessionCache: {
    setSession: jest.fn().mockResolvedValue(undefined),
    deleteUserSessions: jest.fn().mockResolvedValue(undefined),
  },
  getCacheStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
}));

// Mock rate limiters
jest.mock('../../src/utils/rateLimiter', () => ({
  otpRateLimiter: {
    consume: jest.fn().mockResolvedValue({}),
    reset: jest.fn().mockResolvedValue({}),
  },
  mfaSetupRateLimiter: {
    consume: jest.fn().mockResolvedValue({}),
    reset: jest.fn().mockResolvedValue({}),
  },
  backupCodeRateLimiter: {
    consume: jest.fn().mockResolvedValue({}),
    reset: jest.fn().mockResolvedValue({}),
  },
}));

describe('AuthController Integration Tests', () => {
  let authController: AuthController;
  let authService: AuthService;
  let mfaService: MFAService;
  let jwtService: JWTService;

  beforeAll(async () => {
    jwtService = new JWTService();
    await jwtService.initialize();
    authService = new AuthService(jwtService);
    mfaService = new MFAService();
    authController = new AuthController(authService, mfaService);
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
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified, mfa_enabled)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true, $6)
       RETURNING id, email, tenant_id, mfa_enabled`,
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
        overrides.mfa_enabled || false,
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to create mock request
  function createMockRequest(overrides: Partial<any> = {}) {
    return {
      body: overrides.body || {},
      user: overrides.user || null,
      ip: overrides.ip || '10.0.0.1',
      headers: {
        'user-agent': 'Jest Test Agent',
        ...overrides.headers,
      },
      ...overrides,
    };
  }

  // Helper to create mock reply
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

  describe('register', () => {
    it('should register a new user and return 201', async () => {
      const userData = createTestUser();
      const request = createMockRequest({
        body: {
          email: userData.email,
          password: userData.password,
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
      });
      const reply = createMockReply();

      await authController.register(request, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply.body.user).toBeDefined();
      expect(reply.body.tokens).toBeDefined();
      expect(reply.body.user.email).toBe(userData.email.toLowerCase());
    });

    it('should return 409 for duplicate email', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        body: {
          email: user.email,
          password: 'NewPassword123!',
          firstName: 'New',
          lastName: 'User',
        },
      });
      const reply = createMockReply();

      await authController.register(request, reply);

      expect(reply.statusCode).toBe(409);
      expect(reply.body.error).toContain('already exists');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        body: {
          email: user.email,
          password: user.password,
        },
      });
      const reply = createMockReply();

      await authController.login(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.user).toBeDefined();
      expect(reply.body.tokens).toBeDefined();
      expect(reply.body.tokens.accessToken).toBeDefined();
      expect(reply.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 for invalid password', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        body: {
          email: user.email,
          password: 'WrongPassword123!',
        },
      });
      const reply = createMockReply();

      await authController.login(request, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const request = createMockRequest({
        body: {
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        },
      });
      const reply = createMockReply();

      await authController.login(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should return requiresMFA when MFA enabled but no token provided', async () => {
      const user = await createDbUser({ mfa_enabled: true });

      // Setup MFA secret for user
      const secret = speakeasy.generateSecret({ length: 32 });
      await testPool.query(
        'UPDATE users SET mfa_secret = $1 WHERE id = $2',
        [secret.base32, user.id]
      );

      const request = createMockRequest({
        body: {
          email: user.email,
          password: user.password,
        },
      });
      const reply = createMockReply();

      await authController.login(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.requiresMFA).toBe(true);
      expect(reply.body.userId).toBe(user.id);
      expect(reply.body.tokens).toBeUndefined();
    });

    it('should return 428 when CAPTCHA required but not provided', async () => {
      const { captchaService } = require('../../src/services/captcha.service');
      captchaService.isCaptchaRequired.mockResolvedValueOnce(true);

      const request = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'password',
        },
      });
      const reply = createMockReply();

      await authController.login(request, reply);

      expect(reply.statusCode).toBe(428);
      expect(reply.body.code).toBe('CAPTCHA_REQUIRED');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const user = await createDbUser();

      // First login to get tokens
      const loginRequest = createMockRequest({
        body: { email: user.email, password: user.password },
      });
      const loginReply = createMockReply();
      await authController.login(loginRequest, loginReply);

      const { refreshToken } = loginReply.body.tokens;

      // Now refresh
      const request = createMockRequest({
        body: { refreshToken },
      });
      const reply = createMockReply();

      await authController.refreshTokens(request, reply);

      expect(reply.statusCode).toBe(200);
      // Response could be flat or nested under tokens
      const accessToken = reply.body.tokens?.accessToken || reply.body.accessToken;
      const newRefreshToken = reply.body.tokens?.refreshToken || reply.body.refreshToken;
      expect(accessToken).toBeDefined();
      expect(newRefreshToken).toBeDefined();
    });

    it('should return 401 for invalid refresh token', async () => {
      const request = createMockRequest({
        body: { refreshToken: 'invalid-token' },
      });
      const reply = createMockReply();

      await authController.refreshTokens(request, reply);

      expect(reply.statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('should logout and return 204', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id },
      });
      const reply = createMockReply();

      await authController.logout(request, reply);

      expect(reply.statusCode).toBe(204);
    });
  });

  describe('getMe', () => {
    it('should return current user', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id },
      });
      const reply = createMockReply();

      await authController.getMe(request, reply);

      expect(reply.body.user).toBeDefined();
      expect(reply.body.user.email).toBe(user.email);
    });

    it('should return 404 for deleted user', async () => {
      const user = await createDbUser();
      await testPool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [user.id]);

      const request = createMockRequest({
        user: { id: user.id },
      });
      const reply = createMockReply();

      await authController.getMe(request, reply);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('MFA endpoints', () => {
    it('setupMFA should return secret and QR code', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id, tenant_id: TEST_TENANT_ID },
      });
      const reply = createMockReply();

      await authController.setupMFA(request, reply);

      expect(reply.body.secret).toBeDefined();
      expect(reply.body.qrCode).toBeDefined();
    });

    it('setupMFA should return 400 if already enabled', async () => {
      const user = await createDbUser({ mfa_enabled: true });

      const request = createMockRequest({
        user: { id: user.id, tenant_id: TEST_TENANT_ID },
      });
      const reply = createMockReply();

      await authController.setupMFA(request, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.error).toContain('already enabled');
    });

    it('verifyMFASetup should enable MFA with valid token', async () => {
      const user = await createDbUser();

      // Setup first
      const setupRequest = createMockRequest({
        user: { id: user.id, tenant_id: TEST_TENANT_ID },
      });
      const setupReply = createMockReply();
      await authController.setupMFA(setupRequest, setupReply);

      const { secret } = setupReply.body;

      // Generate valid token
      const validToken = speakeasy.totp({ secret, encoding: 'base32' });

      const request = createMockRequest({
        user: { id: user.id, tenant_id: TEST_TENANT_ID },
        body: { token: validToken },
      });
      const reply = createMockReply();

      await authController.verifyMFASetup(request, reply);

      expect(reply.body.backupCodes).toBeDefined();
      expect(reply.body.backupCodes.length).toBe(10);

      // Verify MFA is enabled in DB
      const result = await testPool.query('SELECT mfa_enabled FROM users WHERE id = $1', [user.id]);
      expect(result.rows[0].mfa_enabled).toBe(true);
    });

    it('verifyMFA should return false for user without MFA', async () => {
      const user = await createDbUser({ mfa_enabled: false });

      const request = createMockRequest({
        user: { id: user.id, tenant_id: TEST_TENANT_ID },
        body: { token: '123456' },
      });
      const reply = createMockReply();

      await authController.verifyMFA(request, reply);

      expect(reply.body.valid).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      const request = createMockRequest({});
      const reply = createMockReply();

      await authController.getCacheStats(request, reply);

      expect(reply.body).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    it('should return valid true with user', async () => {
      const user = await createDbUser();

      const request = createMockRequest({
        user: { id: user.id, email: user.email },
      });
      const reply = createMockReply();

      await authController.verifyToken(request, reply);

      expect(reply.body.valid).toBe(true);
      expect(reply.body.user).toBeDefined();
    });
  });
});
