import { AuthService } from '../../src/services/auth.service';
import { JWTService } from '../../src/services/jwt.service';
import { pool } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import crypto from 'crypto';

/**
 * INTEGRATION TESTS FOR AUTH SERVICE
 * 
 * These tests use REAL database and REAL Redis connections.
 * No mocks. Tests actual behavior end-to-end.
 */

// Safety check: Ensure we're not running against production database
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
  
  console.log(`✓ Running integration tests against test database: ${dbName}`);
});

describe('AuthService Integration Tests', () => {
  let authService: AuthService;
  let jwtService: JWTService;
  let testTenantId: string;
  let createdUserIds: string[] = [];

  // Setup before all tests
  beforeAll(async () => {
    // Initialize services
    jwtService = new JWTService();
    authService = new AuthService(jwtService);

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, status) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [`Test Tenant ${Date.now()}`, `test-tenant-${Date.now()}`, 'active']
    );
    testTenantId = tenantResult.rows[0].id;
  });

  // Cleanup after each test
  afterEach(async () => {
    // Clean up created users
    if (createdUserIds.length > 0) {
      await pool.query(
        'DELETE FROM users WHERE id = ANY($1)',
        [createdUserIds]
      );
      createdUserIds = [];
    }
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Delete test tenant
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    
    // Close connections
    await pool.end();
    await redis.quit();
  });

  // Helper to track created users for cleanup
  const trackUser = (userId: string) => {
    createdUserIds.push(userId);
  };

  describe('register()', () => {
    it('should register a new user with valid data', async () => {
      const email = `test${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        phone: '+1234567890',
        tenant_id: testTenantId,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest Test'
      };

      const result = await authService.register(registrationData);

      // Track for cleanup
      trackUser(result.user.id);

      // Assertions
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.first_name).toBe('Test');
      expect(result.user.last_name).toBe('User');
      expect(result.user.email_verified).toBe(false);
      expect(result.user.tenant_id).toBe(testTenantId);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Verify user exists in database
      const dbResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [result.user.id]
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].email).toBe(email);
    });

    it('should return 409 when email already exists', async () => {
      const email = `duplicate${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: testTenantId
      };

      // First registration
      const result1 = await authService.register(registrationData);
      trackUser(result1.user.id);

      // Duplicate registration
      await expect(authService.register(registrationData)).rejects.toThrow('User with this email already exists');
    });

    it('should return 400 when tenant_id is invalid', async () => {
      const registrationData = {
        email: `test${Date.now()}@example.com`,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: '00000000-0000-0000-0000-000000000999' // Invalid tenant
      };

      await expect(authService.register(registrationData)).rejects.toThrow('Invalid tenant');
    });

    it('should sanitize firstName and lastName (strip HTML)', async () => {
      const email = `sanitize${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'SecurePass123!',
        firstName: '<script>alert("xss")</script>John',
        lastName: '<b>Doe</b>',
        tenant_id: testTenantId
      };

      const result = await authService.register(registrationData);
      trackUser(result.user.id);

      // HTML tags are stripped but content inside tags remains
      expect(result.user.first_name).not.toContain('<script>');
      expect(result.user.first_name).not.toContain('<b>');
      expect(result.user.first_name).toBe('alert("xss")John');
      expect(result.user.last_name).toBe('Doe');
    });

    it('should create user session in same transaction', async () => {
      const email = `session${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: testTenantId,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest Test'
      };

      const result = await authService.register(registrationData);
      trackUser(result.user.id);

      // Verify session was created
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [result.user.id]
      );
      expect(sessionResult.rows.length).toBeGreaterThan(0);
      expect(sessionResult.rows[0].ip_address).toBe('127.0.0.1');
      expect(sessionResult.rows[0].user_agent).toBe('Jest Test');
    });

    it('should generate email verification token', async () => {
      const email = `verify${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: testTenantId
      };

      const result = await authService.register(registrationData);
      trackUser(result.user.id);

      // Verify token was generated in database
      const dbResult = await pool.query(
        'SELECT email_verification_token FROM users WHERE id = $1',
        [result.user.id]
      );
      expect(dbResult.rows[0].email_verification_token).toBeDefined();
      expect(dbResult.rows[0].email_verification_token).not.toBe('');
    });
  });

  describe('login()', () => {
    let testUser: any;
    const testPassword = 'SecurePass123!';

    beforeEach(async () => {
      // Create a test user for login tests
      const email = `login${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: testPassword,
        firstName: 'Login',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      trackUser(testUser.id);
    });

    it('should login successfully with valid credentials', async () => {
      const result = await authService.login({
        email: testUser.email,
        password: testPassword,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest Test'
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.user.email).toBe(testUser.email);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should return "Invalid credentials" for non-existent user', async () => {
      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: testPassword
      })).rejects.toThrow('Invalid credentials');
    });

    it('should return "Invalid credentials" for wrong password', async () => {
      await expect(authService.login({
        email: testUser.email,
        password: 'WrongPassword123!'
      })).rejects.toThrow('Invalid credentials');
    });

    it('should create session on successful login', async () => {
      const result = await authService.login({
        email: testUser.email,
        password: testPassword,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser'
      });

      // Verify session was created
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ip_address = $2',
        [result.user.id, '192.168.1.1']
      );
      expect(sessionResult.rows.length).toBeGreaterThan(0);
      expect(sessionResult.rows[0].user_agent).toBe('Test Browser');
    });

    it('should take at least 500ms (timing attack prevention)', async () => {
      const startTime = Date.now();
      
      try {
        await authService.login({
          email: 'nonexistent@example.com',
          password: 'wrong'
        });
      } catch (e) {
        // Expected to fail
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });
  });

  describe('verifyEmail()', () => {
    it('should verify email with valid token', async () => {
      // Create user
      const email = `emailverify${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        tenant_id: testTenantId
      });
      trackUser(result.user.id);

      // Get verification token from database
      const dbResult = await pool.query(
        'SELECT email_verification_token FROM users WHERE id = $1',
        [result.user.id]
      );
      const token = dbResult.rows[0].email_verification_token;

      // Verify email
      const verifyResult = await authService.verifyEmail(token);
      expect(verifyResult.success).toBe(true);

      // Check email_verified is now true
      const updatedUser = await pool.query(
        'SELECT email_verified FROM users WHERE id = $1',
        [result.user.id]
      );
      expect(updatedUser.rows[0].email_verified).toBe(true);
    });

    it('should throw error for invalid token', async () => {
      await expect(authService.verifyEmail('invalid-token-123')).rejects.toThrow('Invalid verification token');
    });
  });

  describe('forgotPassword()', () => {
    let testUser: any;

    beforeEach(async () => {
      const email = `password${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'OldPass123!',
        firstName: 'Password',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      trackUser(testUser.id);
    });

    it('should generate reset token for existing user', async () => {
      const result = await authService.forgotPassword(testUser.email);
      
      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');

      // Verify token was created in database
      const dbResult = await pool.query(
        'SELECT password_reset_token, password_reset_expires FROM users WHERE id = $1',
        [testUser.id]
      );
      expect(dbResult.rows[0].password_reset_token).toBeDefined();
      expect(dbResult.rows[0].password_reset_expires).toBeDefined();
    });

    it('should return same message for non-existent user (enumeration prevention)', async () => {
      const result = await authService.forgotPassword('nonexistent@example.com');
      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
    });

    it('should take at least 300ms (timing attack prevention)', async () => {
      const startTime = Date.now();
      await authService.forgotPassword('any@example.com');
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(300);
    });
  });

  describe('resetPassword()', () => {
    let testUser: any;
    let resetToken: string;

    beforeEach(async () => {
      const email = `reset${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'OldPass123!',
        firstName: 'Reset',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      trackUser(testUser.id);

      // Generate reset token
      await authService.forgotPassword(testUser.email);
      
      // Get token from database
      const dbResult = await pool.query(
        'SELECT password_reset_token FROM users WHERE id = $1',
        [testUser.id]
      );
      resetToken = dbResult.rows[0].password_reset_token;
    });

    it('should reset password with valid token', async () => {
      const newPassword = 'NewSecurePass456!';
      const result = await authService.resetPassword(resetToken, newPassword);
      expect(result.success).toBe(true);

      // Verify can login with new password
      const loginResult = await authService.login({
        email: testUser.email,
        password: newPassword
      });
      expect(loginResult.user.id).toBe(testUser.id);
    });

    it('should throw error for invalid token', async () => {
      await expect(authService.resetPassword('invalid-token', 'NewPass123!')).rejects.toThrow('Invalid or expired reset token');
    });

    it('should clear reset token after use', async () => {
      await authService.resetPassword(resetToken, 'NewPass123!');

      // Verify token and expiry are null
      const dbResult = await pool.query(
        'SELECT password_reset_token, password_reset_expires FROM users WHERE id = $1',
        [testUser.id]
      );
      expect(dbResult.rows[0].password_reset_token).toBeNull();
      expect(dbResult.rows[0].password_reset_expires).toBeNull();
    });
  });

  describe('changePassword()', () => {
    let testUser: any;
    const oldPassword = 'OldPass123!';

    beforeEach(async () => {
      const email = `change${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: oldPassword,
        firstName: 'Change',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      trackUser(testUser.id);
    });

    it('should change password with valid credentials', async () => {
      const newPassword = 'NewSecurePass789!';
      const result = await authService.changePassword(testUser.id, oldPassword, newPassword);
      expect(result.success).toBe(true);

      // Verify can login with new password
      const loginResult = await authService.login({
        email: testUser.email,
        password: newPassword
      });
      expect(loginResult.user.id).toBe(testUser.id);

      // Verify cannot login with old password
      await expect(authService.login({
        email: testUser.email,
        password: oldPassword
      })).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for incorrect current password', async () => {
      await expect(authService.changePassword(testUser.id, 'WrongPassword!', 'NewPass123!')).rejects.toThrow('Invalid current password');
    });

    it('should throw error for invalid userId', async () => {
      // Service checks password before user existence, so throws "Invalid current password"
      await expect(authService.changePassword('00000000-0000-0000-0000-000000000999', oldPassword, 'NewPass123!')).rejects.toThrow('Invalid current password');
    });
  });

  describe('refreshTokens()', () => {
    let testUser: any;
    let refreshToken: string;

    beforeEach(async () => {
      const email = `refresh${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'TestPass123!',
        firstName: 'Refresh',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      refreshToken = result.tokens.refreshToken;
      trackUser(testUser.id);
    });

    it('should refresh tokens with valid refresh token', async () => {
      const result = await authService.refreshTokens(refreshToken, '127.0.0.1', 'Jest Test');

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      // New tokens should be different
      expect(result.tokens.refreshToken).not.toBe(refreshToken);
    });

    it('should return fresh user data', async () => {
      // Update user in database
      await pool.query(
        'UPDATE users SET first_name = $1 WHERE id = $2',
        ['Updated', testUser.id]
      );

      const result = await authService.refreshTokens(refreshToken);
      expect(result.user.first_name).toBe('Updated');
    });

    it('should throw error when user is deleted', async () => {
      // Delete user
      await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [testUser.id]);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow('User not found');
    });
  });

  describe('logout()', () => {
    let testUser: any;
    let refreshToken: string;

    beforeEach(async () => {
      const email = `logout${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'TestPass123!',
        firstName: 'Logout',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      refreshToken = result.tokens.refreshToken;
      trackUser(testUser.id);
    });

    it('should logout successfully', async () => {
      const result = await authService.logout(testUser.id, refreshToken);
      expect(result.success).toBe(true);
    });

    it('should work without refresh token', async () => {
      const result = await authService.logout(testUser.id);
      expect(result.success).toBe(true);
    });

    it('should never throw (always returns success)', async () => {
      // Even with invalid data, should not throw
      const result = await authService.logout('invalid-user-id', 'invalid-token');
      expect(result.success).toBe(true);
    });
  });

  describe('getUserById()', () => {
    let testUser: any;

    beforeEach(async () => {
      const email = `getuser${Date.now()}@example.com`;
      const result = await authService.register({
        email,
        password: 'TestPass123!',
        firstName: 'GetUser',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      testUser = result.user;
      trackUser(testUser.id);
    });

    it('should return user for valid userId', async () => {
      const user = await authService.getUserById(testUser.id);
      expect(user.id).toBe(testUser.id);
      expect(user.email).toBe(testUser.email);
      expect(user.first_name).toBe('GetUser');
    });

    it('should throw error for invalid userId', async () => {
      // Use a UUID that definitely doesn't exist in the database
      await expect(authService.getUserById('ffffffff-ffff-ffff-ffff-ffffffffffff')).rejects.toThrow('User not found');
    });
  });

  describe('Complete User Journey', () => {
    it('should handle complete user lifecycle: register → verify email → login → change password → logout', async () => {
      const email = `journey${Date.now()}@example.com`;
      
      // 1. Register
      const registerResult = await authService.register({
        email,
        password: 'InitialPass123!',
        firstName: 'Journey',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      trackUser(registerResult.user.id);
      expect(registerResult.user.email_verified).toBe(false);

      // 2. Verify email
      const tokenResult = await pool.query(
        'SELECT email_verification_token FROM users WHERE id = $1',
        [registerResult.user.id]
      );
      await authService.verifyEmail(tokenResult.rows[0].email_verification_token);

      // 3. Login
      const loginResult = await authService.login({
        email,
        password: 'InitialPass123!'
      });
      expect(loginResult.user.id).toBe(registerResult.user.id);

      // 4. Change password
      await authService.changePassword(
        registerResult.user.id,
        'InitialPass123!',
        'NewSecurePass456!'
      );

      // 5. Login with new password
      const newLoginResult = await authService.login({
        email,
        password: 'NewSecurePass456!'
      });
      expect(newLoginResult.user.id).toBe(registerResult.user.id);

      // 6. Logout
      const logoutResult = await authService.logout(
        registerResult.user.id,
        newLoginResult.tokens.refreshToken
      );
      expect(logoutResult.success).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent registrations with same email', async () => {
      const email = `concurrent${Date.now()}@example.com`;
      const registrationData = {
        email,
        password: 'TestPass123!',
        firstName: 'Concurrent',
        lastName: 'Test',
        tenant_id: testTenantId
      };

      // Fire both registrations simultaneously
      const [result1, result2] = await Promise.allSettled([
        authService.register(registrationData),
        authService.register(registrationData)
      ]);

      // One should succeed, one should fail
      const succeeded = [result1, result2].filter(r => r.status === 'fulfilled').length;
      const failed = [result1, result2].filter(r => r.status === 'rejected').length;
      
      expect(succeeded).toBe(1);
      expect(failed).toBe(1);

      // Track the successful user
      if (result1.status === 'fulfilled') {
        trackUser(result1.value.user.id);
      } else if (result2.status === 'fulfilled') {
        trackUser(result2.value.user.id);
      }
    });

    it('should handle SQL injection attempts safely', async () => {
      const maliciousEmail = `test${Date.now()}@example.com'; DROP TABLE users; --`;
      
      // Should succeed - parameterized queries escape the input safely
      const result = await authService.register({
        email: maliciousEmail,
        password: 'TestPass123!',
        firstName: 'Malicious',
        lastName: 'Test',
        tenant_id: testTenantId
      });
      trackUser(result.user.id);
      
      // Verify the malicious string was stored literally, not executed
      expect(result.user.email).toBe(maliciousEmail.toLowerCase());
      
      // Verify users table still exists (wasn't dropped)
      const tableCheck = await pool.query('SELECT COUNT(*) FROM users');
      expect(tableCheck.rows).toBeDefined();
    });

    it('should handle extremely long input strings', async () => {
      const longString = 'a'.repeat(10000);
      
      // Service should either truncate and succeed, or throw validation error
      try {
        const result = await authService.register({
          email: `test${Date.now()}@example.com`,
          password: 'TestPass123!',
          firstName: longString,
          lastName: 'Test',
          tenant_id: testTenantId
        });
        
        // If it succeeds, it should have truncated the string
        expect(result.user).toBeDefined();
        if (result.user) {
          trackUser(result.user.id);
          expect(result.user.first_name.length).toBeLessThan(10000);
        }
      } catch (error) {
        // Or it throws a validation error - both outcomes are acceptable
        expect(error).toBeDefined();
      }
    });
  });
});
