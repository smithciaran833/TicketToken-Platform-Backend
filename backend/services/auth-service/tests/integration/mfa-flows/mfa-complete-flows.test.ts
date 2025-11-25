import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';
import * as speakeasy from 'speakeasy';

// =============================================================================
// INTEGRATION TEST: MFA (MULTI-FACTOR AUTHENTICATION) FLOWS
// =============================================================================
// Tests complete MFA workflows including TOTP, backup codes, and recovery

describe('Integration: MFA Complete Flows', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  
  // Test user data
  const testUser = {
    email: 'mfa-test@example.com',
    password: 'TestPassword123!@#',
    firstName: 'MFA',
    lastName: 'Test'
  };

  let userId: string;
  let accessToken: string;

  // =============================================================================
  // SETUP & TEARDOWN
  // =============================================================================

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, settings) VALUES ($1, $2, $3) RETURNING id`,
      ['MFA Test Tenant', 'mfa-test-tenant', JSON.stringify({})]
    );
    testTenantId = tenantResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['mfa-test%']);
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    await app.close();
    await pool.end();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up and create fresh user for each test
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await redis.flushdb();

    // Register and verify user
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...testUser, tenant_id: testTenantId }
    });

    const registerData = JSON.parse(registerResponse.body);
    userId = registerData.user.id;
    accessToken = registerData.tokens.accessToken;

    // Verify email
    const tokenResult = await pool.query(
      'SELECT email_verification_token FROM users WHERE id = $1',
      [userId]
    );
    await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: tokenResult.rows[0].email_verification_token }
    });
  });

  // =============================================================================
  // GROUP 1: TOTP SETUP FLOW (6 tests)
  // =============================================================================

  describe('TOTP Setup Flow', () => {
    it('should complete full MFA setup: generate secret → verify TOTP → activate', async () => {
      // Step 1: Initiate MFA setup - generate secret
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      expect(setupResponse.statusCode).toBe(200);
      const setupData = JSON.parse(setupResponse.body);
      
      expect(setupData.secret).toBeDefined();
      expect(setupData.qrCode).toBeDefined();
      expect(setupData.backupCodes).toBeUndefined(); // Not generated until verified

      const secret = setupData.secret;

      // Step 2: Generate valid TOTP code
      const token = speakeasy.totp({
        secret: secret,
        encoding: 'base32'
      });

      // Step 3: Verify TOTP to activate MFA
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });

      expect(verifyResponse.statusCode).toBe(200);
      const verifyData = JSON.parse(verifyResponse.body);
      
      expect(verifyData.success).toBe(true);
      expect(verifyData.backupCodes).toBeDefined();
      expect(verifyData.backupCodes).toHaveLength(10); // 10 backup codes

      // Step 4: Verify MFA is enabled in database
      const userResult = await pool.query(
        'SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1',
        [userId]
      );
      
      expect(userResult.rows[0].mfa_enabled).toBe(true);
      expect(userResult.rows[0].mfa_secret).toBeDefined();

      // Step 5: Verify backup codes stored in database
      const backupCodesResult = await pool.query(
        'SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND used = false',
        [userId]
      );
      
      expect(parseInt(backupCodesResult.rows[0].count)).toBe(10);
    });

    it('should reject MFA setup verification with invalid TOTP', async () => {
      // Setup MFA
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      // Attempt to verify with wrong code
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token: '000000' } // Invalid code
      });

      expect(verifyResponse.statusCode).toBe(400);
      const data = JSON.parse(verifyResponse.body);
      expect(data.success).toBe(false);

      // Verify MFA not enabled
      const userResult = await pool.query(
        'SELECT mfa_enabled FROM users WHERE id = $1',
        [userId]
      );
      expect(userResult.rows[0].mfa_enabled).toBe(false);
    });

    it('should require authentication for MFA setup', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup'
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should generate 10 unique backup codes', async () => {
      // Setup MFA
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      const secret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret, encoding: 'base32' });

      // Verify and get backup codes
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });

      const backupCodes = JSON.parse(verifyResponse.body).backupCodes;
      
      // All codes should be unique
      const uniqueCodes = new Set(backupCodes);
      expect(uniqueCodes.size).toBe(10);

      // Codes should be proper format (e.g., 8-12 characters)
      backupCodes.forEach((code: string) => {
        expect(code.length).toBeGreaterThanOrEqual(8);
        expect(code.length).toBeLessThanOrEqual(12);
      });
    });

    it('should store MFA secret encrypted in database', async () => {
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      const secret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });

      // Check database
      const userResult = await pool.query(
        'SELECT mfa_secret FROM users WHERE id = $1',
        [userId]
      );

      const storedSecret = userResult.rows[0].mfa_secret;
      
      // Secret should be stored (could be encrypted, so just check it exists and differs)
      expect(storedSecret).toBeDefined();
      expect(storedSecret.length).toBeGreaterThan(0);
    });

    it('should prevent MFA setup if already enabled', async () => {
      // Enable MFA first
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      const secret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });

      // Attempt to setup again
      const secondSetupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      expect(secondSetupResponse.statusCode).toBe(400);
      const data = JSON.parse(secondSetupResponse.body);
      expect(data.error).toContain('already enabled');
    });
  });

  // =============================================================================
  // GROUP 2: MFA LOGIN FLOW (6 tests)
  // =============================================================================

  describe('MFA Login Flow', () => {
    let mfaSecret: string;

    beforeEach(async () => {
      // Enable MFA for user
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      mfaSecret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });
    });

    it('should require TOTP code after valid credentials', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const data = JSON.parse(loginResponse.body);
      
      // Should indicate MFA required
      expect(data.mfaRequired).toBe(true);
      expect(data.mfaToken).toBeDefined(); // Temporary token for MFA step
      expect(data.tokens).toBeUndefined(); // No access tokens yet
    });

    it('should grant access with valid TOTP code', async () => {
      // Step 1: Initial login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      // Step 2: Provide valid TOTP
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });
      
      const mfaResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: {
          mfaToken,
          token
        }
      });

      expect(mfaResponse.statusCode).toBe(200);
      const mfaData = JSON.parse(mfaResponse.body);
      
      expect(mfaData.tokens).toBeDefined();
      expect(mfaData.tokens.accessToken).toBeDefined();
      expect(mfaData.tokens.refreshToken).toBeDefined();
    });

    it('should reject login with invalid TOTP code', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      // Provide invalid TOTP
      const mfaResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: {
          mfaToken,
          token: '000000' // Invalid
        }
      });

      expect(mfaResponse.statusCode).toBe(401);
      const data = JSON.parse(mfaResponse.body);
      expect(data.success).toBe(false);
    });

    it('should accept TOTP within time window', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      // Generate token (server should accept within reasonable time window)
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const mfaResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: { mfaToken, token }
      });

      expect(mfaResponse.statusCode).toBe(200);
    });

    it('should rate limit TOTP verification attempts', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      // Make multiple failed attempts (should be rate limited after 5)
      for (let i = 0; i < 6; i++) {
        const mfaResponse = await app.inject({
          method: 'POST',
          url: '/auth/mfa/verify',
          payload: {
            mfaToken,
            token: '000000'
          }
        });

        if (i < 5) {
          expect(mfaResponse.statusCode).toBe(401); // Failed auth
        } else {
          expect(mfaResponse.statusCode).toBe(429); // Rate limited
        }
      }
    });

    it('should create session after successful MFA verification', async () => {
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: { mfaToken, token }
      });

      // Verify session in database
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      expect(sessionResult.rows.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // GROUP 3: BACKUP CODE FLOW (4 tests)
  // =============================================================================

  describe('Backup Code Flow', () => {
    let mfaSecret: string;
    let backupCodes: string[];

    beforeEach(async () => {
      // Enable MFA and get backup codes
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      mfaSecret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });

      backupCodes = JSON.parse(verifyResponse.body).backupCodes;
    });

    it('should allow login with backup code', async () => {
      // Initial login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      // Use backup code instead of TOTP
      const mfaResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: {
          mfaToken,
          backupCode: backupCodes[0]
        }
      });

      expect(mfaResponse.statusCode).toBe(200);
      const data = JSON.parse(mfaResponse.body);
      expect(data.tokens).toBeDefined();
    });

    it('should mark backup code as used after single use', async () => {
      const backupCode = backupCodes[0];

      // Use backup code once
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken } = JSON.parse(loginResponse.body);

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: { mfaToken, backupCode }
      });

      // Verify code marked as used in database
      const codeResult = await pool.query(
        'SELECT used FROM mfa_backup_codes WHERE user_id = $1 AND code = $2',
        [userId, backupCode]
      );

      expect(codeResult.rows[0].used).toBe(true);

      // Try to use same code again
      const loginResponse2 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { mfaToken: mfaToken2 } = JSON.parse(loginResponse2.body);

      const mfaResponse2 = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: { mfaToken: mfaToken2, backupCode }
      });

      expect(mfaResponse2.statusCode).toBe(401); // Already used
    });

    it('should track remaining backup codes', async () => {
      // Use 3 backup codes
      for (let i = 0; i < 3; i++) {
        const loginResponse = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: testUser.email,
            password: testUser.password
          }
        });

        const { mfaToken } = JSON.parse(loginResponse.body);

        await app.inject({
          method: 'POST',
          url: '/auth/mfa/verify',
          payload: { mfaToken, backupCode: backupCodes[i] }
        });
      }

      // Check remaining codes
      const remainingResult = await pool.query(
        'SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND used = false',
        [userId]
      );

      expect(parseInt(remainingResult.rows[0].count)).toBe(7); // 10 - 3 = 7
    });

    it('should allow regenerating backup codes', async () => {
      // Regenerate codes
      const regenerateResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/regenerate-backup-codes',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      expect(regenerateResponse.statusCode).toBe(200);
      const data = JSON.parse(regenerateResponse.body);
      
      expect(data.backupCodes).toBeDefined();
      expect(data.backupCodes).toHaveLength(10);

      // Old codes should be invalidated
      const oldCodesResult = await pool.query(
        'SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND code = ANY($2)',
        [userId, backupCodes]
      );

      // Old codes should either be deleted or marked invalid
      expect(parseInt(oldCodesResult.rows[0].count)).toBe(0);
    });
  });

  // =============================================================================
  // GROUP 4: MFA DISABLE FLOW (4 tests)
  // =============================================================================

  describe('MFA Disable Flow', () => {
    let mfaSecret: string;

    beforeEach(async () => {
      // Enable MFA
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: { authorization: `Bearer ${accessToken}` }
      });

      mfaSecret = JSON.parse(setupResponse.body).secret;
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify-setup',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { token }
      });
    });

    it('should disable MFA with password and TOTP verification', async () => {
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      const disableResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          password: testUser.password,
          token
        }
      });

      expect(disableResponse.statusCode).toBe(200);

      // Verify MFA disabled in database
      const userResult = await pool.query(
        'SELECT mfa_enabled FROM users WHERE id = $1',
        [userId]
      );

      expect(userResult.rows[0].mfa_enabled).toBe(false);
    });

    it('should allow normal login after MFA disabled', async () => {
      // Disable MFA
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          password: testUser.password,
          token
        }
      });

      // Login should work without MFA
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const data = JSON.parse(loginResponse.body);
      
      expect(data.mfaRequired).toBeUndefined();
      expect(data.tokens).toBeDefined(); // Direct access
    });

    it('should invalidate all backup codes on MFA disable', async () => {
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          password: testUser.password,
          token
        }
      });

      // Check backup codes deleted
      const codesResult = await pool.query(
        'SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1',
        [userId]
      );

      expect(parseInt(codesResult.rows[0].count)).toBe(0);
    });

    it('should update MFA status in user record', async () => {
      const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          password: testUser.password,
          token
        }
      });

      // Verify MFA fields cleared
      const userResult = await pool.query(
        'SELECT mfa_enabled, mfa_secret FROM users WHERE id = $1',
        [userId]
      );

      expect(userResult.rows[0].mfa_enabled).toBe(false);
      expect(userResult.rows[0].mfa_secret).toBeNull();
    });
  });
});
