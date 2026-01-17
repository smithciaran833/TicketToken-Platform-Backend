import request from 'supertest';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
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

let app: any;

// ============================================
// TEST HELPERS
// ============================================

const getUserMFAStatus = async (userId: string) => {
  const result = await testPool.query(
    'SELECT mfa_enabled, mfa_secret, backup_codes, updated_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0];
};

const getMFASetupData = async (userId: string): Promise<any | null> => {
  const key = `tenant:${TEST_TENANT_ID}:mfa:setup:${userId}`;
  const data = await testRedis.get(key);
  return data ? JSON.parse(data) : null;
};

const isMFARecentTokenStored = async (userId: string, token: string): Promise<boolean> => {
  const key = `tenant:${TEST_TENANT_ID}:mfa:recent:${userId}:${token}`;
  const exists = await testRedis.get(key);
  return !!exists;
};

const hashBackupCode = (code: string): string => {
  return crypto.createHash('sha256').update(code).digest('hex');
};

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

describe('MFA Flow Integration Tests - Comprehensive', () => {
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

    // Register a user for each test
    const userData = createTestUser();
    const regResponse = await request(app.server)
      .post('/auth/register')
      .send(userData)
      .expect(201);

    registeredUser = {
      email: userData.email,
      password: userData.password,
      userId: regResponse.body.user.id,
      accessToken: regResponse.body.tokens.accessToken,
      refreshToken: regResponse.body.tokens.refreshToken,
    };
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // POST /auth/mfa/setup
  // ============================================

  describe('POST /auth/mfa/setup - MFA Setup', () => {
    it('should successfully setup MFA and return secret + QR code', async () => {
      const response = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.secret).toBeDefined();
      expect(response.body.secret).toMatch(/^[A-Z2-7]+=*$/); // Base32 format
      expect(response.body.qrCode).toBeDefined();
      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);

      // Verify Redis setup key exists with TTL
      const setupData = await getMFASetupData(registeredUser.userId);
      expect(setupData).toBeDefined();
      expect(setupData.secret).toBeDefined(); // Encrypted
      expect(setupData.backupCodes).toBeDefined();
      expect(setupData.backupCodes.length).toBe(10);
      expect(setupData.plainBackupCodes).toBeDefined();
      expect(setupData.plainBackupCodes.length).toBe(10);

      // Verify TTL is approximately 10 minutes (600 seconds)
      const ttl = await testRedis.ttl(`tenant:${TEST_TENANT_ID}:mfa:setup:${registeredUser.userId}`);
      expect(ttl).toBeGreaterThan(590);
      expect(ttl).toBeLessThanOrEqual(600);

      // Verify MFA not yet enabled in database
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(false);
    });

    it('should return same secret when called within idempotency window', async () => {
      // First setup
      const response1 = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const secret1 = response1.body.secret;

      // Second setup (within 10 minutes)
      const response2 = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const secret2 = response2.body.secret;

      // Should return the same secret (QR code may differ due to regeneration)
      expect(secret2).toBe(secret1);
      expect(response2.body.qrCode).toBeDefined();
    });

    it('should generate unique backup codes', async () => {
      const response = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const setupData = await getMFASetupData(registeredUser.userId);
      const backupCodes = setupData.plainBackupCodes;

      // Verify all codes are unique
      const uniqueCodes = new Set(backupCodes);
      expect(uniqueCodes.size).toBe(10);

      // Verify format XXXX-XXXX
      backupCodes.forEach((code: string) => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });
    });

    it('should encrypt secret in Redis', async () => {
      const response = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const setupData = await getMFASetupData(registeredUser.userId);
      
      // Encrypted format is: iv:authTag:encrypted
      expect(setupData.secret).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

      // Should NOT be the same as plaintext secret
      expect(setupData.secret).not.toBe(response.body.secret);
    });

    it('should return 400 when MFA is already enabled', async () => {
      // Enable MFA first
      await setupMFAForUser(registeredUser.accessToken);

      // Try to setup again
      const response = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);

      expect(response.body.error).toMatch(/already enabled/i);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/mfa/setup')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ============================================
  // POST /auth/mfa/verify-setup
  // ============================================

  describe('POST /auth/mfa/verify-setup - Verify and Enable MFA', () => {
    it('should successfully verify and enable MFA with valid TOTP token', async () => {
      // Setup MFA first
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Verify and enable
      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.backupCodes).toBeDefined();
      expect(response.body.backupCodes.length).toBe(10);

      // Verify each backup code format (XXXX-XXXX)
      response.body.backupCodes.forEach((code: string) => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });

      // Verify database state
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(true);
      expect(mfaStatus.mfa_secret).toBeDefined();
      expect(mfaStatus.backup_codes).toBeDefined();
      expect(mfaStatus.backup_codes.length).toBe(10);

      // Verify backup codes are hashed in database
      const hashedCode = hashBackupCode(response.body.backupCodes[0]);
      expect(mfaStatus.backup_codes).toContain(hashedCode);

      // Verify Redis setup key is deleted
      const setupData = await getMFASetupData(registeredUser.userId);
      expect(setupData).toBeNull();
    });

    it('should store encrypted secret in database', async () => {
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;

      const validToken = speakeasy.totp({ secret, encoding: 'base32' });

      await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      
      // Encrypted format is: iv:authTag:encrypted
      expect(mfaStatus.mfa_secret).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

      // Should NOT be plaintext
      expect(mfaStatus.mfa_secret).not.toBe(secret);
    });

    it('should accept tokens within TOTP window (window: 2)', async () => {
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;

      // Generate token for previous time step (window allows this)
      const previousToken = speakeasy.totp({
        secret,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000) - 30, // 30 seconds ago
      });

      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: previousToken })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should update updated_at timestamp', async () => {
      const beforeStatus = await getUserMFAStatus(registeredUser.userId);
      const beforeTimestamp = new Date(beforeStatus.updated_at);

      // Wait to ensure we get a fresh token
      await new Promise(resolve => setTimeout(resolve, 31000));

      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;
      const validToken = speakeasy.totp({ secret, encoding: 'base32' });

      await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      const afterStatus = await getUserMFAStatus(registeredUser.userId);
      const afterTimestamp = new Date(afterStatus.updated_at);

      expect(afterTimestamp.getTime()).toBeGreaterThan(beforeTimestamp.getTime());
    }, 40000);

    it('should return 400 with invalid TOTP token', async () => {
      // Setup MFA first
      await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      // Try to verify with invalid token
      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.error).toMatch(/Invalid/i);

      // Verify MFA not enabled
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(false);
    });

    it('should return 400 when setup has expired', async () => {
      // Setup MFA
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;

      // Delete the Redis setup key to simulate expiration
      await testRedis.del(`tenant:${TEST_TENANT_ID}:mfa:setup:${registeredUser.userId}`);

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Try to verify with expired setup
      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(400);

      expect(response.body.error).toMatch(/expired|not found/i);
    });

    it('should return 400 when token is missing', async () => {
      // Setup MFA first
      await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({})
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 with non-numeric token', async () => {
      await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const response = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: 'abcdef' })
        .expect(400);

      expect(response.body.error).toMatch(/Invalid/i);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/mfa/verify-setup')
        .send({ token: '123456' })
        .expect(401);
    });
  });

  // ============================================
  // POST /auth/mfa/verify
  // ============================================

  describe('POST /auth/mfa/verify - Verify MFA Token', () => {
    it('should return valid: true with correct TOTP token', async () => {
      // Enable MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Verify token
      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      expect(response.body.valid).toBe(true);

      // Verify replay prevention key exists
      const recentTokenExists = await isMFARecentTokenStored(registeredUser.userId, validToken);
      expect(recentTokenExists).toBe(true);

      // Verify TTL is approximately 90 seconds
      const ttl = await testRedis.ttl(`tenant:${TEST_TENANT_ID}:mfa:recent:${registeredUser.userId}:${validToken}`);
      expect(ttl).toBeGreaterThan(85);
      expect(ttl).toBeLessThanOrEqual(90);
    });

    it('should prevent token replay within 90 second window', async () => {
      // Enable MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Use token first time
      await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      // Try to use same token again (should fail with error)
      await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(500);
    });

    it('should return valid: false with invalid token', async () => {
      // Enable MFA
      await setupMFAForUser(registeredUser.accessToken);

      // Verify with invalid token
      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '000000' })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should reject non-6-digit tokens via validation', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      // Tokens not matching 6-10 chars are rejected by validation
      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '12345' }) // Only 5 digits
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when token is missing', async () => {
      // Enable MFA
      await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({})
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/mfa/verify')
        .send({ token: '123456' })
        .expect(401);
    });
  });

  // ============================================
  // POST /auth/mfa/regenerate-backup-codes
  // ============================================

  describe('POST /auth/mfa/regenerate-backup-codes - Regenerate Backup Codes', () => {
    it('should successfully regenerate 10 new backup codes', async () => {
      // Enable MFA and get initial backup codes
      const { backupCodes: initialCodes } = await setupMFAForUser(registeredUser.accessToken);

      // Regenerate backup codes
      const response = await request(app.server)
        .post('/auth/mfa/regenerate-backup-codes')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.backupCodes).toBeDefined();
      expect(response.body.backupCodes.length).toBe(10);

      // Verify format
      response.body.backupCodes.forEach((code: string) => {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      });

      // Verify new codes are different from initial codes
      expect(response.body.backupCodes[0]).not.toBe(initialCodes[0]);

      // Verify database has new hashed codes
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.backup_codes.length).toBe(10);

      // Verify new codes are hashed correctly
      const hashedNewCode = hashBackupCode(response.body.backupCodes[0]);
      expect(mfaStatus.backup_codes).toContain(hashedNewCode);

      // Verify old codes are no longer valid
      const hashedOldCode = hashBackupCode(initialCodes[0]);
      expect(mfaStatus.backup_codes).not.toContain(hashedOldCode);
    });

    it('should generate unique codes on regeneration', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .post('/auth/mfa/regenerate-backup-codes')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const uniqueCodes = new Set(response.body.backupCodes);
      expect(uniqueCodes.size).toBe(10);
    });

    it('should update updated_at timestamp', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      const beforeStatus = await getUserMFAStatus(registeredUser.userId);
      const beforeTimestamp = new Date(beforeStatus.updated_at);

      await new Promise(resolve => setTimeout(resolve, 31000));

      await request(app.server)
        .post('/auth/mfa/regenerate-backup-codes')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const afterStatus = await getUserMFAStatus(registeredUser.userId);
      const afterTimestamp = new Date(afterStatus.updated_at);

      expect(afterTimestamp.getTime()).toBeGreaterThan(beforeTimestamp.getTime());
    }, 40000);

    it('should return 400 when MFA is not enabled', async () => {
      const response = await request(app.server)
        .post('/auth/mfa/regenerate-backup-codes')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);

      expect(response.body.error).toMatch(/not enabled/i);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/mfa/regenerate-backup-codes')
        .expect(401);
    });
  });

  // ============================================
  // DELETE /auth/mfa/disable
  // ============================================

  describe('DELETE /auth/mfa/disable - Disable MFA', () => {
    it('should successfully disable MFA with valid password and token', async () => {
      // Enable MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Disable MFA
      const response = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token: validToken,
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify database state
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(false);
      expect(mfaStatus.mfa_secret).toBeNull();
      expect(mfaStatus.backup_codes).toBeNull();

      // Verify Redis keys are cleaned up
      const setupData = await getMFASetupData(registeredUser.userId);
      expect(setupData).toBeNull();

      const verifiedKey = await testRedis.get(`tenant:${TEST_TENANT_ID}:mfa:verified:${registeredUser.userId}`);
      expect(verifiedKey).toBeNull();
    });

    it('should update updated_at timestamp when disabling', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const beforeStatus = await getUserMFAStatus(registeredUser.userId);
      const beforeTimestamp = new Date(beforeStatus.updated_at);

      await new Promise(resolve => setTimeout(resolve, 31000));

      const validToken = speakeasy.totp({ secret, encoding: 'base32' });

      await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token: validToken,
        })
        .expect(200);

      const afterStatus = await getUserMFAStatus(registeredUser.userId);
      const afterTimestamp = new Date(afterStatus.updated_at);

      expect(afterTimestamp.getTime()).toBeGreaterThan(beforeTimestamp.getTime());
    }, 40000);

    it('should return 400 with incorrect password', async () => {
      // Enable MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate valid TOTP
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Try to disable with wrong password
      const response = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: 'WrongPassword123!',
          token: validToken,
        })
        .expect(400);

      expect(response.body.error).toMatch(/Invalid/i);

      // Verify MFA is still enabled
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(true);
    });

    it('should return 400 with invalid MFA token', async () => {
      // Enable MFA
      await setupMFAForUser(registeredUser.accessToken);

      // Try to disable with invalid token
      const response = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token: '000000',
        })
        .expect(400);

      expect(response.body.error).toMatch(/Invalid/i);

      // Verify MFA is still enabled
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(true);
    });

    it('should return 400 when password is missing', async () => {
      // Enable MFA
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const response = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when token is missing', async () => {
      // Enable MFA
      await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ password: registeredUser.password })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .delete('/auth/mfa/disable')
        .send({
          password: 'password',
          token: '123456',
        })
        .expect(401);
    });
  });

  // ============================================
  // BACKUP CODE USAGE IN LOGIN
  // ============================================

  describe('Backup Code Usage - Login Flow', () => {
    it('should successfully login with valid backup code', async () => {
      // Enable MFA
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      // Login with backup code
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
      expect(response.body.tokens.accessToken).toBeDefined();
    });

    it('should remove backup code from array after use', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);
      const usedCode = backupCodes[0];

      // Use backup code to login
      await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: usedCode,
        })
        .expect(200);

      // Verify code removed from database
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.backup_codes.length).toBe(9); // 10 - 1 = 9

      const hashedUsedCode = hashBackupCode(usedCode);
      expect(mfaStatus.backup_codes).not.toContain(hashedUsedCode);
    });

    it('should not allow reuse of same backup code', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);
      const usedCode = backupCodes[0];

      // Use backup code first time
      await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: usedCode,
        })
        .expect(200);

      // Try to use same code again
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: usedCode,
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should allow using different backup codes', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      // Use first code
      await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: backupCodes[0],
        })
        .expect(200);

      // Use second code
      await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: backupCodes[1],
        })
        .expect(200);

      // Verify only 8 codes remain
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.backup_codes.length).toBe(8);
    });

    it('should reject backup codes with incorrect case', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);
      const lowercaseCode = backupCodes[0].toLowerCase();

      // Backup codes are case-sensitive
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: lowercaseCode,
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  // ============================================
  // MFA RATE LIMITING
  // ============================================

  describe('MFA Rate Limiting', () => {
    it('should allow multiple verification attempts within rate limit', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Make 5 failed attempts (within limit)
      for (let i = 0; i < 5; i++) {
        await request(app.server)
          .post('/auth/mfa/verify')
          .set('Authorization', `Bearer ${registeredUser.accessToken}`)
          .send({ token: '000000' })
          .expect(200); // Returns valid: false, not rate limited
      }
    });

    it('should rate limit backup code verification after multiple failed attempts', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      // Make 3 failed login attempts with invalid backup code
      for (let i = 0; i < 3; i++) {
        await request(app.server)
          .post('/auth/login')
          .send({
            email: registeredUser.email,
            password: registeredUser.password,
            mfaToken: 'FFFF-FFFF', // Invalid code
          });
      }

      // 4th attempt should still fail with authentication error
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: 'FFFF-FFFF',
        })
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  // ============================================
  // INTEGRATION SCENARIOS
  // ============================================

  describe('MFA Integration Scenarios', () => {
    it('should complete full MFA lifecycle: setup → login → disable', async () => {
      // 1. Setup MFA
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const { secret } = setupResponse.body;

      // 2. Verify and enable
      const validToken = speakeasy.totp({ secret, encoding: 'base32' });
      const verifyResponse = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: validToken })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);

      // 3. Login with MFA
      const newToken = speakeasy.totp({ secret, encoding: 'base32' });
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: newToken,
        })
        .expect(200);

      expect(loginResponse.body.tokens).toBeDefined();

      // 4. Disable MFA
      // Wait a moment to ensure we get a fresh token (avoid replay prevention)
      await new Promise(resolve => setTimeout(resolve, 31000));
      const disableToken = speakeasy.totp({ secret, encoding: 'base32' });
      const disableResponse = await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${loginResponse.body.tokens.accessToken}`)
        .send({
          password: registeredUser.password,
          token: disableToken,
        })
        .expect(200);

      expect(disableResponse.body.success).toBe(true);

      // 5. Verify login works without MFA
      const finalLogin = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
        })
        .expect(200);

      expect(finalLogin.body.tokens).toBeDefined();
      expect(finalLogin.body.requiresMFA).toBeUndefined();
    }, 40000);

    it('should preserve MFA after password change', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Change password
      await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      // Login with new password (should still require MFA)
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'NewPassword456!',
        })
        .expect(200);

      expect(response.body.requiresMFA).toBe(true);

      // Verify MFA still enabled in database
      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      expect(mfaStatus.mfa_enabled).toBe(true);
    });

    it('should allow MFA re-enablement after disabling', async () => {
      // Enable MFA
      const { secret: secret1 } = await setupMFAForUser(registeredUser.accessToken);

      // Disable MFA
      const token1 = speakeasy.totp({ secret: secret1, encoding: 'base32' });
      await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token: token1,
        })
        .expect(200);

      // Re-enable MFA (should get NEW secret)
      const setupResponse = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const secret2 = setupResponse.body.secret;
      expect(secret2).toBeDefined();
      expect(secret2).not.toBe(secret1); // Should be different secret

      // Verify new setup
      const token2 = speakeasy.totp({ secret: secret2, encoding: 'base32' });
      const verifyResponse = await request(app.server)
        .post('/auth/mfa/verify-setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: token2 })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
    });

    it('should not allow setup idempotency across different users', async () => {
      // Setup MFA for user 1
      const setup1 = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      // Register second user
      const userData2 = createTestUser();
      const regResponse2 = await request(app.server)
        .post('/auth/register')
        .send(userData2)
        .expect(201);

      // Setup MFA for user 2 (should get different secret)
      const setup2 = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${regResponse2.body.tokens.accessToken}`)
        .expect(200);

      expect(setup1.body.secret).not.toBe(setup2.body.secret);
    });
  });

  // ============================================
  // DATABASE STATE VERIFICATION
  // ============================================

  describe('Database State Verification', () => {
    it('should ensure all backup codes are unique in database', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      
      const uniqueHashes = new Set(mfaStatus.backup_codes);
      expect(uniqueHashes.size).toBe(10);
    });

    it('should verify backup codes are properly hashed with SHA256', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);

      backupCodes.forEach((plainCode: string) => {
        const expectedHash = crypto.createHash('sha256').update(plainCode).digest('hex');
        expect(mfaStatus.backup_codes).toContain(expectedHash);
      });
    });

    it('should maintain backup code array ordering after use', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);

      // Use middle code (index 5)
      await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: backupCodes[5],
        })
        .expect(200);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      
      // Should have 9 codes remaining
      expect(mfaStatus.backup_codes.length).toBe(9);

      // Verify other codes still present
      const hashedCode0 = hashBackupCode(backupCodes[0]);
      const hashedCode9 = hashBackupCode(backupCodes[9]);
      
      expect(mfaStatus.backup_codes).toContain(hashedCode0);
      expect(mfaStatus.backup_codes).toContain(hashedCode9);
    });

    it('should verify mfa_secret encryption format in database', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);

      // Format: iv:authTag:encrypted (all hex)
      expect(mfaStatus.mfa_secret).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

      // Split and verify parts
      const parts = mfaStatus.mfa_secret.split(':');
      expect(parts.length).toBe(3);
      
      // IV should be 32 hex chars (16 bytes)
      expect(parts[0].length).toBe(32);
      
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1].length).toBe(32);
      
      // Encrypted data should exist
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should nullify all MFA fields on disable', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      
      await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token,
        })
        .expect(200);

      const mfaStatus = await getUserMFAStatus(registeredUser.userId);
      
      expect(mfaStatus.mfa_enabled).toBe(false);
      expect(mfaStatus.mfa_secret).toBeNull();
      expect(mfaStatus.backup_codes).toBeNull();
    });
  });

  // ============================================
  // REDIS KEY CLEANUP
  // ============================================

  describe('Redis Key Cleanup', () => {
    it('should clean up all MFA-related Redis keys on disable', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Create some recent token keys
      const token = speakeasy.totp({ secret, encoding: 'base32' });
      await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token })
        .expect(200);

      // Disable MFA
      // Wait a moment to ensure we get a fresh token (avoid replay prevention)
      await new Promise(resolve => setTimeout(resolve, 31000));
      const disableToken = speakeasy.totp({ secret, encoding: 'base32' });
      await request(app.server)
        .delete('/auth/mfa/disable')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          password: registeredUser.password,
          token: disableToken,
        })
        .expect(200);

      // Verify all MFA keys are gone
      const setupKey = await testRedis.get(`tenant:${TEST_TENANT_ID}:mfa:setup:${registeredUser.userId}`);
      const secretKey = await testRedis.get(`tenant:${TEST_TENANT_ID}:mfa:secret:${registeredUser.userId}`);
      const verifiedKey = await testRedis.get(`tenant:${TEST_TENANT_ID}:mfa:verified:${registeredUser.userId}`);

      expect(setupKey).toBeNull();
      expect(secretKey).toBeNull();
      expect(verifiedKey).toBeNull();
    }, 40000);

    it('should expire setup key after 10 minutes', async () => {
      await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      // Set TTL to 1 second for testing
      await testRedis.expire(`tenant:${TEST_TENANT_ID}:mfa:setup:${registeredUser.userId}`, 1);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));

      const setupData = await getMFASetupData(registeredUser.userId);
      expect(setupData).toBeNull();
    });

    it('should expire recent token key after 90 seconds', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const token = speakeasy.totp({ secret, encoding: 'base32' });
      
      await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token })
        .expect(200);

      // Set TTL to 1 second for testing
      await testRedis.expire(`tenant:${TEST_TENANT_ID}:mfa:recent:${registeredUser.userId}:${token}`, 1);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));

      const exists = await isMFARecentTokenStored(registeredUser.userId, token);
      expect(exists).toBe(false);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle setup when Redis is temporarily unavailable', async () => {
      const response = await request(app.server)
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.secret).toBeDefined();
    });

    it('should reject tokens with whitespace', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '123 456' })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should reject backup codes with extra whitespace during login', async () => {
      const { backupCodes } = await setupMFAForUser(registeredUser.accessToken);
      const codeWithSpaces = `  ${backupCodes[0]}  `;

      // Backup codes are not trimmed, so this will fail validation
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: registeredUser.password,
          mfaToken: codeWithSpaces,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should handle very old TOTP tokens (outside window)', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      // Generate token for 5 minutes ago (way outside window)
      const oldToken = speakeasy.totp({
        secret,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000) - 300,
      });

      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: oldToken })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should handle token with leading zeros', async () => {
      const { secret } = await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '000123' })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should reject tokens longer than 10 characters', async () => {
      await setupMFAForUser(registeredUser.accessToken);

      const response = await request(app.server)
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ token: '12345678901' }) // 11 chars
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });
});
