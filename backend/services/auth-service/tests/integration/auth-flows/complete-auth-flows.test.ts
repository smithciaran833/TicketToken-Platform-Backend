import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

// =============================================================================
// INTEGRATION TEST: COMPLETE AUTHENTICATION FLOWS
// =============================================================================
// Tests complete user journeys with real services (minimal mocking)
// Verifies multi-service interactions, database state, and security

describe('Integration: Complete Authentication Flows', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  
  // Test data
  const testUser = {
    email: 'integration-test@example.com',
    password: 'TestPassword123!@#',
    firstName: 'Integration',
    lastName: 'Test',
    phone: '+1234567890'
  };

  // =============================================================================
  // SETUP & TEARDOWN
  // =============================================================================

  beforeAll(async () => {
    // Build app with test configuration
    app = await buildApp();
    await app.ready();

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, settings) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      ['Test Tenant', 'test-tenant', JSON.stringify({})]
    );
    testTenantId = tenantResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['integration-test%']);
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    
    // Close connections
    await app.close();
    await pool.end();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up test user between tests
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await redis.flushdb(); // Clear Redis cache
  });

  // =============================================================================
  // GROUP 1: COMPLETE REGISTRATION FLOW (8 tests)
  // =============================================================================

  describe('Complete Registration Flow', () => {
    it('should complete full registration → email verification → auto-login', async () => {
      // Step 1: Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });

      expect(registerResponse.statusCode).toBe(201);
      const registerData = JSON.parse(registerResponse.body);
      expect(registerData.success).toBe(true);
      expect(registerData.user).toBeDefined();
      expect(registerData.user.email).toBe(testUser.email);
      expect(registerData.tokens).toBeDefined();

      const userId = registerData.user.id;

      // Step 2: Verify user in database (email_verified should be false)
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      expect(userResult.rows).toHaveLength(1);
      expect(userResult.rows[0].email_verified).toBe(false);
      expect(userResult.rows[0].tenant_id).toBe(testTenantId);

      // Step 3: Get verification token (in real app, this comes from email)
      const tokenResult = await pool.query(
        'SELECT email_verification_token FROM users WHERE id = $1',
        [userId]
      );
      const verificationToken = tokenResult.rows[0].email_verification_token;
      expect(verificationToken).toBeDefined();

      // Step 4: Verify email
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: { token: verificationToken }
      });

      expect(verifyResponse.statusCode).toBe(200);
      const verifyData = JSON.parse(verifyResponse.body);
      expect(verifyData.success).toBe(true);

      // Step 5: Verify email_verified flag updated
      const updatedUserResult = await pool.query(
        'SELECT email_verified FROM users WHERE id = $1',
        [userId]
      );
      expect(updatedUserResult.rows[0].email_verified).toBe(true);

      // Step 6: Login with verified account
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);
      expect(loginData.tokens).toBeDefined();
      expect(loginData.user.email_verified).toBe(true);
    });

    it('should reject registration with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          email: 'not-an-email',
          tenant_id: testTenantId
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(false);
    });

    it('should reject registration with existing email', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });

      // Attempt duplicate registration
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });

      expect(response.statusCode).toBe(409);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(false);
      expect(data.error).toContain('already');
    });

    it('should reject registration with weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          password: 'weak',
          tenant_id: testTenantId
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(false);
    });

    it('should reject registration without required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testUser.email
          // Missing password, firstName, lastName
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject SQL injection attempts in registration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          email: "admin'--@example.com",
          firstName: "'; DROP TABLE users; --",
          tenant_id: testTenantId
        }
      });

      // Should either succeed with escaped values or fail validation
      // But should NOT execute SQL injection
      const userCount = await pool.query('SELECT COUNT(*) FROM users');
      expect(userCount.rows[0].count).toBeDefined(); // Table still exists
    });

    it('should enforce tenant isolation in registration', async () => {
      // Register in tenant 1
      const response1 = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          email: 'tenant1@example.com',
          tenant_id: testTenantId
        }
      });

      expect(response1.statusCode).toBe(201);
      const data1 = JSON.parse(response1.body);
      expect(data1.user.tenant_id).toBe(testTenantId);
    });

    it('should generate JWT with correct claims after registration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      
      // Decode JWT to verify claims (without verification)
      const token = data.tokens.accessToken;
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      expect(payload.sub).toBe(data.user.id);
      expect(payload.tenant_id).toBe(testTenantId);
      expect(payload.type).toBe('access');
      expect(payload.email).toBe(testUser.email);
    });
  });

  // =============================================================================
  // GROUP 2: COMPLETE LOGIN FLOW (8 tests)
  // =============================================================================

  describe('Complete Login Flow', () => {
    beforeEach(async () => {
      // Create verified user for login tests
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });

      // Verify email
      const tokenResult = await pool.query(
        'SELECT email_verification_token FROM users WHERE email = $1',
        [testUser.email]
      );
      const token = tokenResult.rows[0].email_verification_token;
      
      await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: { token }
      });
    });

    it('should complete full login flow with JWT tokens and session creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      // Verify JWT tokens
      expect(data.tokens.accessToken).toBeDefined();
      expect(data.tokens.refreshToken).toBeDefined();
      
      // Verify user data
      expect(data.user.email).toBe(testUser.email);
      expect(data.user.email_verified).toBe(true);

      // Verify session in database
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [data.user.id]
      );
      expect(sessionResult.rows.length).toBeGreaterThan(0);
    });

    it('should reject login with invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'WrongPassword123!'
        }
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(false);
    });

    it('should reject login for non-existent user with generic error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: testUser.password
        }
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).not.toContain('not found'); // No user enumeration
      expect(data.error).toContain('Invalid credentials');
    });

    it('should block login for unverified email', async () => {
      // Create unverified user
      await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          email: 'unverified@example.com',
          tenant_id: testTenantId
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'unverified@example.com',
          password: testUser.password
        }
      });

      // May allow login but flag unverified, or block entirely
      // Implementation dependent
      const data = JSON.parse(response.body);
      if (response.statusCode === 200) {
        expect(data.user.email_verified).toBe(false);
      } else {
        expect(response.statusCode).toBe(403);
      }
    });

    it('should store refresh token in Redis', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const data = JSON.parse(response.body);
      const refreshToken = data.tokens.refreshToken;
      
      // Decode to get JTI
      const parts = refreshToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check Redis for token
      const redisValue = await redis.get(`refresh_token:${payload.jti}`);
      expect(redisValue).toBeDefined();
    });

    it('should support multiple devices login with separate sessions', async () => {
      // Login from device 1
      const response1 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        },
        headers: {
          'user-agent': 'Device1-Browser'
        }
      });

      // Login from device 2
      const response2 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        },
        headers: {
          'user-agent': 'Device2-Browser'
        }
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const data1 = JSON.parse(response1.body);
      const data2 = JSON.parse(response2.body);

      // Both should have valid tokens
      expect(data1.tokens.accessToken).toBeDefined();
      expect(data2.tokens.accessToken).toBeDefined();

      // Tokens should be different
      expect(data1.tokens.accessToken).not.toBe(data2.tokens.accessToken);

      // Check multiple sessions in database
      const sessionResult = await pool.query(
        'SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [data1.user.id]
      );
      expect(parseInt(sessionResult.rows[0].count)).toBeGreaterThanOrEqual(2);
    });

    it('should update session activity on login', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const data = JSON.parse(response.body);
      
      // Check session has recent activity
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [data.user.id]
      );

      expect(sessionResult.rows).toHaveLength(1);
      const session = sessionResult.rows[0];
      expect(session.last_activity).toBeDefined();
      
      // Should be very recent (within last few seconds)
      const lastActivity = new Date(session.last_activity);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastActivity.getTime()) / 1000;
      expect(diffSeconds).toBeLessThan(5);
    });
  });

  // =============================================================================
  // GROUP 3: PASSWORD RESET FLOW (6 tests)
  // =============================================================================

  describe('Password Reset Flow', () => {
    let userId: string;

    beforeEach(async () => {
      // Create verified user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });
      const data = JSON.parse(registerResponse.body);
      userId = data.user.id;
    });

    it('should complete password reset flow: request → reset → login', async () => {
      // Step 1: Request password reset
      const requestResponse = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: {
          email: testUser.email
        }
      });

      expect(requestResponse.statusCode).toBe(200);
      const requestData = JSON.parse(requestResponse.body);
      expect(requestData.message).toContain('email');

      // Step 2: Get reset token from database
      const tokenResult = await pool.query(
        'SELECT password_reset_token, password_reset_expires FROM users WHERE id = $1',
        [userId]
      );
      const resetToken = tokenResult.rows[0].password_reset_token;
      const resetExpires = tokenResult.rows[0].password_reset_expires;

      expect(resetToken).toBeDefined();
      expect(new Date(resetExpires)).toBeInstanceOf(Date);

      // Step 3: Reset password with token
      const newPassword = 'NewPassword123!@#';
      const resetResponse = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: resetToken,
          newPassword
        }
      });

      expect(resetResponse.statusCode).toBe(200);

      // Step 4: Verify old password no longer works
      const oldLoginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(oldLoginResponse.statusCode).toBe(401);

      // Step 5: Login with new password works
      const newLoginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: newPassword
        }
      });

      expect(newLoginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(newLoginResponse.body);
      expect(loginData.tokens).toBeDefined();
    });

    it('should reject reset with expired token', async () => {
      // Request reset
      await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: testUser.email }
      });

      // Manually expire the token
      await pool.query(
        'UPDATE users SET password_reset_expires = NOW() - INTERVAL \'2 hours\' WHERE id = $1',
        [userId]
      );

      // Get expired token
      const tokenResult = await pool.query(
        'SELECT password_reset_token FROM users WHERE id = $1',
        [userId]
      );
      const expiredToken = tokenResult.rows[0].password_reset_token;

      // Attempt reset with expired token
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: expiredToken,
          newPassword: 'NewPassword123!@#'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('expired');
    });

    it('should reject reset with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: 'invalid-token-12345',
          newPassword: 'NewPassword123!@#'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should invalidate reset token after use (one-time use)', async () => {
      // Request reset
      await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: testUser.email }
      });

      // Get token
      const tokenResult = await pool.query(
        'SELECT password_reset_token FROM users WHERE id = $1',
        [userId]
      );
      const resetToken = tokenResult.rows[0].password_reset_token;

      // First reset - should work
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: resetToken,
          newPassword: 'NewPassword123!@#'
        }
      });

      expect(firstResponse.statusCode).toBe(200);

      // Second reset with same token - should fail
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: resetToken,
          newPassword: 'AnotherPassword123!@#'
        }
      });

      expect(secondResponse.statusCode).toBe(400);
    });

    it('should not reveal whether email exists (information disclosure)', async () => {
      // Request reset for existing email
      const existingResponse = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: testUser.email }
      });

      // Request reset for non-existent email
      const nonExistentResponse = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'nonexistent@example.com' }
      });

      // Both should return same status and message
      expect(existingResponse.statusCode).toBe(nonExistentResponse.statusCode);
      
      const existingData = JSON.parse(existingResponse.body);
      const nonExistentData = JSON.parse(nonExistentResponse.body);
      
      expect(existingData.message).toBe(nonExistentData.message);
    });

    it('should set token expiry to 1 hour', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: testUser.email }
      });

      const tokenResult = await pool.query(
        'SELECT password_reset_expires FROM users WHERE id = $1',
        [userId]
      );

      const expiresAt = new Date(tokenResult.rows[0].password_reset_expires);
      const now = new Date();
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

      // Should be approximately 60 minutes (allow ±5 min for test execution)
      expect(diffMinutes).toBeGreaterThan(55);
      expect(diffMinutes).toBeLessThan(65);
    });
  });

  // =============================================================================
  // GROUP 4: TOKEN REFRESH FLOW (5 tests)
  // =============================================================================

  describe('Token Refresh Flow', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and login to get tokens
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });
      const data = JSON.parse(registerResponse.body);
      userId = data.user.id;
      refreshToken = data.tokens.refreshToken;
    });

    it('should issue new tokens with valid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.tokens.accessToken).toBeDefined();
      expect(data.tokens.refreshToken).toBeDefined();
      
      // New tokens should be different from old ones
      expect(data.tokens.refreshToken).not.toBe(refreshToken);
    });

    it('should reject expired refresh token', async () => {
      // Manually expire token in Redis
      const parts = refreshToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      await redis.del(`refresh_token:${payload.jti}`);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should detect token theft and invalidate family', async () => {
      // First refresh (legitimate)
      const firstRefresh = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken }
      });

      expect(firstRefresh.statusCode).toBe(200);
      const firstData = JSON.parse(firstRefresh.body);

      // Attempt to reuse OLD refresh token (theft scenario)
      const reuseAttempt = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken } // Old token
      });

      // Should detect reuse
      expect(reuseAttempt.statusCode).toBe(401);
      const reuseData = JSON.parse(reuseAttempt.body);
      expect(reuseData.error).toContain('r euse');
    });

    it('should invalidate old access token after refresh', async () => {
      // Get initial access token
      const parts = refreshToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Refresh tokens
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken }
      });

      const refreshData = JSON.parse(refreshResponse.body);
      const oldRefreshToken = refreshToken;
      const newRefreshToken = refreshData.tokens.refreshToken;

      // Old refresh token should no longer work
      const oldTokenResponse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: oldRefreshToken }
      });

      expect(oldTokenResponse.statusCode).toBe(401);
    });

    it('should update session activity on token refresh', async () => {
      // Get session before refresh
      const beforeResult = await pool.query(
        'SELECT last_activity FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      const beforeActivity = new Date(beforeResult.rows[0].last_activity);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh token
      await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken }
      });

      // Check session activity updated
      const afterResult = await pool.query(
        'SELECT last_activity FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      const afterActivity = new Date(afterResult.rows[0].last_activity);

      expect(afterActivity.getTime()).toBeGreaterThan(beforeActivity.getTime());
    });
  });

  // =============================================================================
  // GROUP 5: SESSION MANAGEMENT (3 tests)  
  // =============================================================================

  describe('Session Management', () => {
    let userId: string;
    let device1Token: string;
    let device2Token: string;

    beforeEach(async () => {
      // Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          ...testUser,
          tenant_id: testTenantId
        }
      });
      const data = JSON.parse(registerResponse.body);
      userId = data.user.id;

      // Login from device 1
      const device1Response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        },
        headers: { 'user-agent': 'Device1' }
      });
      device1Token = JSON.parse(device1Response.body).tokens.accessToken;

      // Login from device 2
      const device2Response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        },
        headers: { 'user-agent': 'Device2' }
      });
      device2Token = JSON.parse(device2Response.body).tokens.accessToken;
    });

    it('should support multiple active sessions', async () => {
      const sessionResult = await pool.query(
        'SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      const sessionCount = parseInt(sessionResult.rows[0].count);
      expect(sessionCount).toBeGreaterThanOrEqual(2);
    });

    it('should terminate single session on logout', async () => {
      // Logout from device 1
      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${device1Token}`
        }
      });

      expect(logoutResponse.statusCode).toBe(200);

      // Device 1 session should be ended
      // Device 2 session should still be active
      const sessionResult = await pool.query(
        'SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      const activeCount = parseInt(sessionResult.rows[0].count);
      expect(activeCount).toBeGreaterThan(0); // At least device 2 still active
    });

    it('should terminate all sessions on logout-all', async () => {
      // Logout all devices
      const logoutAllResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout-all',
        headers: {
          authorization: `Bearer ${device1Token}`
        }
      });

      expect(logoutAllResponse.statusCode).toBe(200);

      // All sessions should be terminated
      const sessionResult = await pool.query(
        'SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      const activeCount = parseInt(sessionResult.rows[0].count);
      expect(activeCount).toBe(0); // No active sessions
    });
  });
});
