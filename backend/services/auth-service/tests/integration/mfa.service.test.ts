import { MFAService } from '../../src/services/mfa.service';
import { pool } from '../../src/config/database';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR MFA SERVICE
 * 
 * These tests verify Multi-Factor Authentication functionality:
 * - TOTP setup and verification
 * - Backup code generation and verification
 * - MFA enforcement for sensitive operations
 * - Biometric device management
 */

// Safety check
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
  
  console.log(`✓ Running MFA service integration tests against test database: ${dbName}`);
});

describe('MFAService Integration Tests', () => {
  let mfaService: MFAService;
  let testTenantId: string;
  let testUserId: string;
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    mfaService = new MFAService();

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, status) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [`MFA Test Tenant ${Date.now()}`, `mfa-test-${Date.now()}`, 'active']
    );
    testTenantId = tenantResult.rows[0].id;

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        `mfa-test-${Date.now()}@example.com`,
        '$2b$12$dummyhash',
        'MFA',
        'Test',
        testTenantId,
        true
      ]
    );
    testUserId = userResult.rows[0].id;
    createdUserIds.push(testUserId);
  });

  afterEach(async () => {
    // Clean up Redis keys created during tests
    const keys = await redis.keys('mfa:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    // Cleanup users and tenant
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    
    // Close connections
    await pool.end();
    await redis.quit();
  });

  describe('setupTOTP()', () => {
    it('should generate secret and QR code for valid user', async () => {
      const result = await mfaService.setupTOTP(testUserId);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBeGreaterThan(0);
      // QR code is base64 PNG data URL, not otpauth:// string
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it('should store encrypted secret in Redis with 10 min TTL', async () => {
      await mfaService.setupTOTP(testUserId);

      const redisKey = `mfa:setup:${testUserId}`;
      const storedData = await redis.get(redisKey);
      
      expect(storedData).toBeDefined();
      const parsedData = JSON.parse(storedData!);
      expect(parsedData).toHaveProperty('secret');
      expect(parsedData).toHaveProperty('backupCodes');
      
      // Check TTL is approximately 10 minutes
      const ttl = await redis.ttl(redisKey);
      expect(ttl).toBeGreaterThan(590); // At least 9m 50s
      expect(ttl).toBeLessThanOrEqual(600); // At most 10m
    });

    it('should generate backup codes in Redis for later use', async () => {
      await mfaService.setupTOTP(testUserId);

      const redisKey = `mfa:setup:${testUserId}`;
      const storedData = await redis.get(redisKey);
      const parsedData = JSON.parse(storedData!);
      
      // Backup codes are stored in Redis but not returned by setupTOTP
      expect(parsedData.backupCodes).toBeDefined();
      expect(Array.isArray(parsedData.backupCodes)).toBe(true);
      expect(parsedData.backupCodes.length).toBe(10);
      
      // plainBackupCodes should also be stored temporarily
      expect(parsedData.plainBackupCodes).toBeDefined();
      expect(parsedData.plainBackupCodes.length).toBe(10);
      
      // Check format: XXXX-XXXX (9 chars total)
      parsedData.plainBackupCodes.forEach((code: string) => {
        expect(code.length).toBe(9);
        expect(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)).toBe(true);
      });
    });

    it('should throw "User not found" for invalid userId', async () => {
      await expect(mfaService.setupTOTP('00000000-0000-0000-0000-000000000999'))
        .rejects.toThrow('User not found');
    });

    it('should throw "MFA is already enabled" when mfa_enabled=true', async () => {
      // Enable MFA for user
      await pool.query(
        'UPDATE users SET mfa_enabled = true WHERE id = $1',
        [testUserId]
      );

      await expect(mfaService.setupTOTP(testUserId))
        .rejects.toThrow('MFA is already enabled for this account');

      // Reset for other tests
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1',
        [testUserId]
      );
    });
  });

  describe('verifyAndEnableTOTP()', () => {
    let setupSecret: string;

    beforeEach(async () => {
      const setup = await mfaService.setupTOTP(testUserId);
      setupSecret = setup.secret;
    });

    afterEach(async () => {
      // Reset MFA state
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should enable MFA and return backup codes on success', async () => {
      // Generate valid TOTP token
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: setupSecret,
        encoding: 'base32'
      });

      const result = await mfaService.verifyAndEnableTOTP(testUserId, token);

      expect(result).toHaveProperty('backupCodes');
      expect(result.backupCodes.length).toBe(10);
      
      // Verify MFA is enabled in database
      const userResult = await pool.query(
        'SELECT mfa_enabled, mfa_secret, backup_codes FROM users WHERE id = $1',
        [testUserId]
      );
      expect(userResult.rows[0].mfa_enabled).toBe(true);
      expect(userResult.rows[0].mfa_secret).toBeDefined();
      expect(userResult.rows[0].backup_codes).toBeDefined();
    });

    it('should throw "MFA setup expired" when Redis data not found', async () => {
      // Delete Redis setup data
      await redis.del(`mfa:setup:${testUserId}`);

      await expect(mfaService.verifyAndEnableTOTP(testUserId, '123456'))
        .rejects.toThrow('MFA setup expired or not found');
    });

    it('should throw "Invalid MFA token" for wrong code', async () => {
      await expect(mfaService.verifyAndEnableTOTP(testUserId, '000000'))
        .rejects.toThrow('Invalid MFA token');
    });

    it('should delete Redis setup data after success', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: setupSecret,
        encoding: 'base32'
      });

      await mfaService.verifyAndEnableTOTP(testUserId, token);

      // Verify Redis key is deleted
      const setupData = await redis.get(`mfa:setup:${testUserId}`);
      expect(setupData).toBeNull();
    });
  });

  describe('verifyTOTP()', () => {
    let mfaSecret: string;

    beforeEach(async () => {
      // Setup and enable MFA
      const setup = await mfaService.setupTOTP(testUserId);
      mfaSecret = setup.secret;
      
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });
      
      await mfaService.verifyAndEnableTOTP(testUserId, token);
    });

    afterEach(async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should return true for valid TOTP', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const isValid = await mfaService.verifyTOTP(testUserId, token);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid TOTP', async () => {
      const isValid = await mfaService.verifyTOTP(testUserId, '000000');
      expect(isValid).toBe(false);
    });

    it('should return false when user not found', async () => {
      const isValid = await mfaService.verifyTOTP('00000000-0000-0000-0000-000000000999', '123456');
      expect(isValid).toBe(false);
    });

    it('should return false when MFA not enabled', async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false WHERE id = $1',
        [testUserId]
      );

      const isValid = await mfaService.verifyTOTP(testUserId, '123456');
      expect(isValid).toBe(false);
    });

    it('should return false for non-6-digit tokens', async () => {
      const isValid1 = await mfaService.verifyTOTP(testUserId, '12345');
      const isValid2 = await mfaService.verifyTOTP(testUserId, '1234567');
      
      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });

    it('should throw "token recently used" for replay attack', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      // Use token once
      await mfaService.verifyTOTP(testUserId, token);

      // Try to use same token again
      await expect(mfaService.verifyTOTP(testUserId, token))
        .rejects.toThrow('MFA token recently used');
    });

    it('should mark token as used in Redis for 90s', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      await mfaService.verifyTOTP(testUserId, token);

      const usedKey = `mfa:used:${testUserId}:${token}`;
      const isUsed = await redis.get(usedKey);
      expect(isUsed).toBe('1');

      const ttl = await redis.ttl(usedKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(90);
    });
  });

  describe('verifyBackupCode()', () => {
    let backupCodes: string[];

    beforeEach(async () => {
      const setup = await mfaService.setupTOTP(testUserId);
      
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: setup.secret,
        encoding: 'base32'
      });
      
      // verifyAndEnableTOTP returns the backup codes
      const result = await mfaService.verifyAndEnableTOTP(testUserId, token);
      backupCodes = result.backupCodes;
    });

    afterEach(async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should return true and remove used code', async () => {
      const codeToUse = backupCodes[0];
      
      const isValid = await mfaService.verifyBackupCode(testUserId, codeToUse);
      expect(isValid).toBe(true);

      // Verify code was removed from database
      const userResult = await pool.query(
        'SELECT backup_codes FROM users WHERE id = $1',
        [testUserId]
      );
      const remainingCodes = userResult.rows[0].backup_codes;
      expect(remainingCodes.length).toBe(9);
      expect(remainingCodes).not.toContain(codeToUse);
    });

    it('should return false for invalid code', async () => {
      const isValid = await mfaService.verifyBackupCode(testUserId, 'INVALID1');
      expect(isValid).toBe(false);
    });

    it('should return false when user not found', async () => {
      const isValid = await mfaService.verifyBackupCode('00000000-0000-0000-0000-000000000999', backupCodes[0]);
      expect(isValid).toBe(false);
    });

    it('should return false when backup_codes is null', async () => {
      await pool.query(
        'UPDATE users SET backup_codes = NULL WHERE id = $1',
        [testUserId]
      );

      const isValid = await mfaService.verifyBackupCode(testUserId, backupCodes[0]);
      expect(isValid).toBe(false);
    });

    it('should return false when backup_codes is empty array', async () => {
      await pool.query(
        'UPDATE users SET backup_codes = $1 WHERE id = $2',
        [JSON.stringify([]), testUserId]
      );

      const isValid = await mfaService.verifyBackupCode(testUserId, backupCodes[0]);
      expect(isValid).toBe(false);
    });
  });

  describe('regenerateBackupCodes()', () => {
    beforeEach(async () => {
      const setup = await mfaService.setupTOTP(testUserId);
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: setup.secret,
        encoding: 'base32'
      });
      await mfaService.verifyAndEnableTOTP(testUserId, token);
    });

    afterEach(async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should generate 10 new backup codes', async () => {
      const result = await mfaService.regenerateBackupCodes(testUserId);

      expect(result.backupCodes.length).toBe(10);
      // Correct format: XXXX-XXXX (9 characters)
      result.backupCodes.forEach(code => {
        expect(code.length).toBe(9);
        expect(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)).toBe(true);
      });
    });

    it('should throw "User not found" for invalid userId', async () => {
      await expect(mfaService.regenerateBackupCodes('00000000-0000-0000-0000-000000000999'))
        .rejects.toThrow('User not found');
    });

    it('should throw "MFA not enabled" when disabled', async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false WHERE id = $1',
        [testUserId]
      );

      await expect(mfaService.regenerateBackupCodes(testUserId))
        .rejects.toThrow('MFA is not enabled for this account');
    });

    it('should store hashed codes in DB', async () => {
      const result = await mfaService.regenerateBackupCodes(testUserId);

      const userResult = await pool.query(
        'SELECT backup_codes FROM users WHERE id = $1',
        [testUserId]
      );
      const storedCodes = userResult.rows[0].backup_codes;
      
      expect(storedCodes.length).toBe(10);
      // Stored codes should be hashed (not match plain codes)
      expect(storedCodes[0]).not.toBe(result.backupCodes[0]);
    });
  });

  describe('requireMFAForOperation()', () => {
    beforeEach(async () => {
      const setup = await mfaService.setupTOTP(testUserId);
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: setup.secret,
        encoding: 'base32'
      });
      await mfaService.verifyAndEnableTOTP(testUserId, token);
    });

    afterEach(async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should pass for non-sensitive operations', async () => {
      await expect(mfaService.requireMFAForOperation(testUserId, 'view_profile'))
        .resolves.not.toThrow();
    });

    it('should pass when MFA recently verified', async () => {
      // Mark MFA as recently verified
      await mfaService.markMFAVerified(testUserId);

      await expect(mfaService.requireMFAForOperation(testUserId, 'change_password'))
        .resolves.not.toThrow();
    });

    it('should throw "MFA required" when no recent verification', async () => {
      await expect(mfaService.requireMFAForOperation(testUserId, 'change_password'))
        .rejects.toThrow('MFA required for this operation');
    });

    it('should recognize all sensitive operations', async () => {
      // Actual service uses colon-separated format
      const sensitiveOps = [
        'withdraw:funds',
        'update:bank-details',
        'delete:venue',
        'export:customer-data',
        'disable:mfa',
      ];

      for (const operation of sensitiveOps) {
        await expect(mfaService.requireMFAForOperation(testUserId, operation))
          .rejects.toThrow('MFA required');
      }
    });
  });

  describe('markMFAVerified()', () => {
    it('should set Redis key with 5 min TTL', async () => {
      await mfaService.markMFAVerified(testUserId);

      const key = `mfa:verified:${testUserId}`;
      const value = await redis.get(key);
      expect(value).toBe('1');

      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(290); // At least 4m 50s
      expect(ttl).toBeLessThanOrEqual(300); // At most 5m
    });
  });

  describe('disableTOTP()', () => {
    let mfaSecret: string;
    const userPassword = 'TestPassword123!';

    beforeEach(async () => {
      // Update user with known password
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(userPassword, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, testUserId]
      );

      // Setup and enable MFA
      const setup = await mfaService.setupTOTP(testUserId);
      mfaSecret = setup.secret;
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });
      await mfaService.verifyAndEnableTOTP(testUserId, token);
    });

    afterEach(async () => {
      await pool.query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, backup_codes = NULL WHERE id = $1',
        [testUserId]
      );
    });

    it('should throw "User not found" for invalid userId', async () => {
      await expect(mfaService.disableTOTP('00000000-0000-0000-0000-000000000999', userPassword, '123456'))
        .rejects.toThrow('User not found');
    });

    it('should throw "Invalid password" for wrong password', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      await expect(mfaService.disableTOTP(testUserId, 'WrongPassword123!', token))
        .rejects.toThrow('Invalid password');
    });

    it('should throw "Invalid MFA token" for wrong TOTP', async () => {
      await expect(mfaService.disableTOTP(testUserId, userPassword, '000000'))
        .rejects.toThrow('Invalid MFA token');
    });

    it('should clear mfa_enabled, mfa_secret, backup_codes', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      await mfaService.disableTOTP(testUserId, userPassword, token);

      const userResult = await pool.query(
        'SELECT mfa_enabled, mfa_secret, backup_codes FROM users WHERE id = $1',
        [testUserId]
      );
      expect(userResult.rows[0].mfa_enabled).toBe(false);
      expect(userResult.rows[0].mfa_secret).toBeNull();
      expect(userResult.rows[0].backup_codes).toBeNull();
    });

    it('should clear Redis keys for user', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      // Set some MFA-related Redis keys
      await redis.set(`mfa:verified:${testUserId}`, '1');
      await redis.set(`mfa:setup:${testUserId}`, 'data');

      await mfaService.disableTOTP(testUserId, userPassword, token);

      const keys = await redis.keys(`mfa:*${testUserId}*`);
      expect(keys.length).toBe(0);
    });
  });
});
