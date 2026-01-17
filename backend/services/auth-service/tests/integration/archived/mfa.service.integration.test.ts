import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { MFAService } from '../../src/services/mfa.service';
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

// Mock rate limiters to avoid interference between tests
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

describe('MFAService Integration Tests', () => {
  let mfaService: MFAService;

  beforeAll(async () => {
    mfaService = new MFAService();
  });

  beforeEach(async () => {
    await cleanupAll();
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
        overrides.mfa_enabled ?? false
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  describe('setupTOTP', () => {
    it('should generate secret and QR code', async () => {
      const user = await createDbUser();

      const result = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(20); // Base32 secret
      expect(result.qrCode).toBeDefined();
      expect(result.qrCode).toContain('data:image/png;base64');
    });

    it('should store setup data in Redis', async () => {
      const user = await createDbUser();

      await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:mfa:setup:${user.id}`;
      const storedData = await testRedis.get(redisKey);

      expect(storedData).not.toBeNull();
      const parsed = JSON.parse(storedData!);
      expect(parsed.secret).toBeDefined(); // Encrypted
      expect(parsed.backupCodes).toBeDefined();
      expect(parsed.backupCodes.length).toBe(10);
      expect(parsed.plainBackupCodes.length).toBe(10);
    });

    it('should return same secret on idempotent call', async () => {
      const user = await createDbUser();

      const result1 = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);
      const result2 = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      expect(result1.secret).toBe(result2.secret);
    });

    it('should reject if MFA already enabled', async () => {
      const user = await createDbUser({ mfa_enabled: true });

      await expect(
        mfaService.setupTOTP(user.id, TEST_TENANT_ID)
      ).rejects.toThrow('MFA is already enabled');
    });

    it('should reject for non-existent user', async () => {
      await expect(
        mfaService.setupTOTP('00000000-0000-0000-0000-000000000099', TEST_TENANT_ID)
      ).rejects.toThrow('User not found');
    });
  });

  describe('verifyAndEnableTOTP', () => {
    it('should enable MFA with valid token', async () => {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      // Generate valid TOTP token
      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });

      const result = await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);

      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes.length).toBe(10);

      // Verify user was updated in DB
      const dbUser = await testPool.query(
        'SELECT mfa_enabled, mfa_secret, backup_codes FROM users WHERE id = $1',
        [user.id]
      );

      expect(dbUser.rows[0].mfa_enabled).toBe(true);
      expect(dbUser.rows[0].mfa_secret).not.toBeNull();
      expect(dbUser.rows[0].backup_codes.length).toBe(10);
    });

    it('should delete setup data from Redis after enabling', async () => {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });

      await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:mfa:setup:${user.id}`;
      const storedData = await testRedis.get(redisKey);

      expect(storedData).toBeNull();
    });

    it('should reject invalid token', async () => {
      const user = await createDbUser();
      await mfaService.setupTOTP(user.id, TEST_TENANT_ID);

      await expect(
        mfaService.verifyAndEnableTOTP(user.id, '000000', TEST_TENANT_ID)
      ).rejects.toThrow('Invalid MFA token');
    });

    it('should reject if setup expired', async () => {
      const user = await createDbUser();

      await expect(
        mfaService.verifyAndEnableTOTP(user.id, '123456', TEST_TENANT_ID)
      ).rejects.toThrow('MFA setup expired or not found');
    });
  });

  describe('verifyTOTP', () => {
    async function setupUserWithMFA() {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);
      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });
      await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);
      return { user, secret: setupResult.secret };
    }

    it('should verify valid TOTP token', async () => {
      const { user, secret } = await setupUserWithMFA();

      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const result = await mfaService.verifyTOTP(user.id, validToken, TEST_TENANT_ID);

      expect(result).toBe(true);
    });

    it('should reject invalid TOTP token', async () => {
      const { user } = await setupUserWithMFA();

      const result = await mfaService.verifyTOTP(user.id, '000000', TEST_TENANT_ID);

      expect(result).toBe(false);
    });

    it('should reject non-6-digit token', async () => {
      const { user } = await setupUserWithMFA();

      const result = await mfaService.verifyTOTP(user.id, '12345', TEST_TENANT_ID);

      expect(result).toBe(false);
    });

    it('should prevent token reuse within window', async () => {
      const { user, secret } = await setupUserWithMFA();

      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // First use should succeed
      const result1 = await mfaService.verifyTOTP(user.id, validToken, TEST_TENANT_ID);
      expect(result1).toBe(true);

      // Second use should fail
      await expect(
        mfaService.verifyTOTP(user.id, validToken, TEST_TENANT_ID)
      ).rejects.toThrow('MFA token recently used');
    });

    it('should return false for user without MFA enabled', async () => {
      const user = await createDbUser({ mfa_enabled: false });

      const result = await mfaService.verifyTOTP(user.id, '123456', TEST_TENANT_ID);

      expect(result).toBe(false);
    });
  });

  describe('verifyBackupCode', () => {
    async function setupUserWithMFA() {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);
      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });
      const { backupCodes } = await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);
      return { user, backupCodes };
    }

    it('should verify valid backup code', async () => {
      const { user, backupCodes } = await setupUserWithMFA();

      const result = await mfaService.verifyBackupCode(user.id, backupCodes[0], TEST_TENANT_ID);

      expect(result).toBe(true);
    });

    it('should remove used backup code', async () => {
      const { user, backupCodes } = await setupUserWithMFA();

      await mfaService.verifyBackupCode(user.id, backupCodes[0], TEST_TENANT_ID);

      // Should not work again
      const result = await mfaService.verifyBackupCode(user.id, backupCodes[0], TEST_TENANT_ID);

      expect(result).toBe(false);
    });

    it('should reject invalid backup code', async () => {
      const { user } = await setupUserWithMFA();

      const result = await mfaService.verifyBackupCode(user.id, 'XXXX-XXXX', TEST_TENANT_ID);

      expect(result).toBe(false);
    });

    it('should allow using different backup codes', async () => {
      const { user, backupCodes } = await setupUserWithMFA();

      const result1 = await mfaService.verifyBackupCode(user.id, backupCodes[0], TEST_TENANT_ID);
      const result2 = await mfaService.verifyBackupCode(user.id, backupCodes[1], TEST_TENANT_ID);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Verify count decreased in DB
      const dbUser = await testPool.query(
        'SELECT backup_codes FROM users WHERE id = $1',
        [user.id]
      );

      expect(dbUser.rows[0].backup_codes.length).toBe(8);
    });
  });

  describe('regenerateBackupCodes', () => {
    async function setupUserWithMFA() {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);
      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });
      await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);
      return { user };
    }

    it('should generate new backup codes', async () => {
      const { user } = await setupUserWithMFA();

      const result = await mfaService.regenerateBackupCodes(user.id);

      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes.length).toBe(10);
    });

    it('should invalidate old backup codes', async () => {
      const { user } = await setupUserWithMFA();

      // Get original codes from DB
      const originalUser = await testPool.query(
        'SELECT backup_codes FROM users WHERE id = $1',
        [user.id]
      );
      const originalCodes = originalUser.rows[0].backup_codes;

      await mfaService.regenerateBackupCodes(user.id);

      // Get new codes
      const updatedUser = await testPool.query(
        'SELECT backup_codes FROM users WHERE id = $1',
        [user.id]
      );
      const newCodes = updatedUser.rows[0].backup_codes;

      // Codes should be different
      expect(newCodes).not.toEqual(originalCodes);
    });

    it('should reject if MFA not enabled', async () => {
      const user = await createDbUser({ mfa_enabled: false });

      await expect(
        mfaService.regenerateBackupCodes(user.id)
      ).rejects.toThrow('MFA is not enabled');
    });
  });

  describe('requireMFAForOperation', () => {
    it('should not require MFA for non-sensitive operations', async () => {
      const user = await createDbUser();

      await expect(
        mfaService.requireMFAForOperation(user.id, 'view:profile', TEST_TENANT_ID)
      ).resolves.not.toThrow();
    });

    it('should require MFA for sensitive operations', async () => {
      const user = await createDbUser();

      await expect(
        mfaService.requireMFAForOperation(user.id, 'withdraw:funds', TEST_TENANT_ID)
      ).rejects.toThrow('MFA required for this operation');
    });

    it('should pass if MFA recently verified', async () => {
      const user = await createDbUser();

      // Mark MFA as verified
      await mfaService.markMFAVerified(user.id, TEST_TENANT_ID);

      await expect(
        mfaService.requireMFAForOperation(user.id, 'withdraw:funds', TEST_TENANT_ID)
      ).resolves.not.toThrow();
    });
  });

  describe('markMFAVerified', () => {
    it('should store verification in Redis with TTL', async () => {
      const user = await createDbUser();

      await mfaService.markMFAVerified(user.id, TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:mfa:verified:${user.id}`;
      const value = await testRedis.get(redisKey);
      const ttl = await testRedis.ttl(redisKey);

      expect(value).toBe('1');
      expect(ttl).toBeGreaterThan(250); // ~5 minutes
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('disableTOTP', () => {
    async function setupUserWithMFA() {
      const user = await createDbUser();
      const setupResult = await mfaService.setupTOTP(user.id, TEST_TENANT_ID);
      const validToken = speakeasy.totp({
        secret: setupResult.secret,
        encoding: 'base32',
      });
      await mfaService.verifyAndEnableTOTP(user.id, validToken, TEST_TENANT_ID);
      return { user, secret: setupResult.secret };
    }

    it('should disable MFA with valid password and token', async () => {
      const { user, secret } = await setupUserWithMFA();

      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      await mfaService.disableTOTP(user.id, user.password, validToken, TEST_TENANT_ID);

      const dbUser = await testPool.query(
        'SELECT mfa_enabled, mfa_secret, backup_codes FROM users WHERE id = $1',
        [user.id]
      );

      expect(dbUser.rows[0].mfa_enabled).toBe(false);
      expect(dbUser.rows[0].mfa_secret).toBeNull();
      expect(dbUser.rows[0].backup_codes).toBeNull();
    });

    it('should reject invalid password', async () => {
      const { user, secret } = await setupUserWithMFA();

      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      await expect(
        mfaService.disableTOTP(user.id, 'WrongPassword123!', validToken, TEST_TENANT_ID)
      ).rejects.toThrow('Invalid password');
    });

    it('should reject invalid MFA token', async () => {
      const { user } = await setupUserWithMFA();

      await expect(
        mfaService.disableTOTP(user.id, user.password, '000000', TEST_TENANT_ID)
      ).rejects.toThrow('Invalid MFA token');
    });
  });
});
