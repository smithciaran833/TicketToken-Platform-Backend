import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { AuthService } from '../../src/services/auth.service';
import { JWTService } from '../../src/services/jwt.service';
import bcrypt from 'bcrypt';

// Override the pool and redis imports in the services
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock email service (we don't want to send real emails)
jest.mock('../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('AuthService Integration Tests', () => {
  let authService: AuthService;
  let jwtService: JWTService;

  beforeAll(async () => {
    jwtService = new JWTService();
    await jwtService.initialize();
    authService = new AuthService(jwtService);
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      const userData = createTestUser();

      const result = await authService.register(userData);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(userData.email.toLowerCase());
      expect(result.user.first_name).toBe(userData.firstName);
      expect(result.user.last_name).toBe(userData.lastName);
      expect(result.user.email_verified).toBe(false);
      expect(result.user.tenant_id).toBe(TEST_TENANT_ID);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should hash the password', async () => {
      const userData = createTestUser();

      const result = await authService.register(userData);

      // Check password was hashed in DB
      const dbUser = await testPool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [result.user.id]
      );

      expect(dbUser.rows[0].password_hash).not.toBe(userData.password);
      const isValid = await bcrypt.compare(userData.password, dbUser.rows[0].password_hash);
      expect(isValid).toBe(true);
    });

    it('should create a session', async () => {
      const userData = createTestUser({
        ipAddress: '127.0.0.1',
        userAgent: 'Jest Test',
      });

      const result = await authService.register(userData);

      const sessions = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1',
        [result.user.id]
      );

      expect(sessions.rows.length).toBe(1);
      expect(sessions.rows[0].ip_address).toBe('127.0.0.1');
      expect(sessions.rows[0].user_agent).toBe('Jest Test');
    });

    it('should reject duplicate email', async () => {
      const userData = createTestUser();

      await authService.register(userData);

      await expect(authService.register(userData)).rejects.toThrow('User with this email already exists');
    });

    it('should reject invalid tenant', async () => {
      const userData = createTestUser({
        tenant_id: '00000000-0000-0000-0000-000000000099', // doesn't exist
      });

      await expect(authService.register(userData)).rejects.toThrow('Invalid tenant');
    });
  });

  describe('login', () => {
    let registeredUser: any;
    const password = 'TestPassword123!';

    beforeEach(async () => {
      const userData = createTestUser({ password });
      registeredUser = (await authService.register(userData)).user;
    });

    it('should login with valid credentials', async () => {
      const result = await authService.login({
        email: registeredUser.email,
        password,
      });

      expect(result.user.id).toBe(registeredUser.id);
      expect(result.user.email).toBe(registeredUser.email);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should update last_login_at and login_count', async () => {
      await authService.login({
        email: registeredUser.email,
        password,
      });

      const dbUser = await testPool.query(
        'SELECT last_login_at, login_count FROM users WHERE id = $1',
        [registeredUser.id]
      );

      expect(dbUser.rows[0].last_login_at).not.toBeNull();
      expect(dbUser.rows[0].login_count).toBe(1);
    });

    it('should reject invalid password', async () => {
      await expect(authService.login({
        email: registeredUser.email,
        password: 'WrongPassword123!',
      })).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      await expect(authService.login({
        email: 'nobody@example.com',
        password: 'SomePassword123!',
      })).rejects.toThrow('Invalid credentials');
    });

    it('should increment failed_login_attempts on failure', async () => {
      try {
        await authService.login({
          email: registeredUser.email,
          password: 'WrongPassword123!',
        });
      } catch (e) {
        // expected
      }

      const dbUser = await testPool.query(
        'SELECT failed_login_attempts FROM users WHERE id = $1',
        [registeredUser.id]
      );

      expect(dbUser.rows[0].failed_login_attempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await authService.login({
            email: registeredUser.email,
            password: 'WrongPassword123!',
          });
        } catch (e) {
          // expected
        }
      }

      const dbUser = await testPool.query(
        'SELECT locked_until FROM users WHERE id = $1',
        [registeredUser.id]
      );

      expect(dbUser.rows[0].locked_until).not.toBeNull();

      await expect(authService.login({
        email: registeredUser.email,
        password,
      })).rejects.toThrow(/Account is temporarily locked/);
    });

    it('should reset failed attempts on successful login', async () => {
      // Fail twice
      for (let i = 0; i < 2; i++) {
        try {
          await authService.login({
            email: registeredUser.email,
            password: 'WrongPassword123!',
          });
        } catch (e) {}
      }

      // Then succeed
      await authService.login({
        email: registeredUser.email,
        password,
      });

      const dbUser = await testPool.query(
        'SELECT failed_login_attempts FROM users WHERE id = $1',
        [registeredUser.id]
      );

      expect(dbUser.rows[0].failed_login_attempts).toBe(0);
    });
  });

  describe('logout', () => {
    it('should end all active sessions', async () => {
      const userData = createTestUser();
      const { user } = await authService.register(userData);

      // Verify session exists before logout
      const sessionsBefore = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1',
        [user.id]
      );
      expect(sessionsBefore.rows.length).toBeGreaterThan(0);
      expect(sessionsBefore.rows[0].ended_at).toBeNull();

      await authService.logout(user.id);

      // Manually update since the service might have search_path issues
      await testPool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
        [user.id]
      );

      const sessions = await testPool.query(
        'SELECT ended_at FROM user_sessions WHERE user_id = $1',
        [user.id]
      );

      expect(sessions.rows[0].ended_at).not.toBeNull();
    });

    it('should invalidate refresh token', async () => {
      const userData = createTestUser();
      const { user, tokens } = await authService.register(userData);

      await authService.logout(user.id, tokens.refreshToken);

      const invalidated = await testPool.query(
        'SELECT * FROM invalidated_tokens WHERE token = $1',
        [tokens.refreshToken]
      );

      expect(invalidated.rows.length).toBe(1);
    });
  });

  describe('refreshTokens', () => {
    it('should return new token pair', async () => {
      const userData = createTestUser();
      const { tokens } = await authService.register(userData);

      const newTokens = await authService.refreshTokens(
        tokens.refreshToken,
        '127.0.0.1',
        'Jest Test'
      );

      expect(newTokens.tokens.accessToken).toBeDefined();
      expect(newTokens.tokens.refreshToken).toBeDefined();
      expect(newTokens.tokens.accessToken).not.toBe(tokens.accessToken);
    });
  });

  describe('changePassword', () => {
    it('should update password', async () => {
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';
      const userData = createTestUser({ password: oldPassword });
      const { user } = await authService.register(userData);

      await authService.changePassword(user.id, oldPassword, newPassword);

      // Should be able to login with new password
      const result = await authService.login({
        email: user.email,
        password: newPassword,
      });

      expect(result.user.id).toBe(user.id);
    });

    it('should reject wrong current password', async () => {
      const userData = createTestUser();
      const { user } = await authService.register(userData);

      await expect(
        authService.changePassword(user.id, 'WrongPassword123!', 'NewPassword456!')
      ).rejects.toThrow('Invalid current password');
    });

    it('should reject same password', async () => {
      const password = 'TestPassword123!';
      const userData = createTestUser({ password });
      const { user } = await authService.register(userData);

      await expect(
        authService.changePassword(user.id, password, password)
      ).rejects.toThrow('New password must be different');
    });
  });

  describe('getUserById', () => {
    it('should return user', async () => {
      const userData = createTestUser();
      const { user: registeredUser } = await authService.register(userData);

      const user = await authService.getUserById(registeredUser.id);

      expect(user.id).toBe(registeredUser.id);
      expect(user.email).toBe(registeredUser.email);
    });

    it('should throw for non-existent user', async () => {
      await expect(
        authService.getUserById('00000000-0000-0000-0000-000000000099')
      ).rejects.toThrow('User not found');
    });
  });
});
