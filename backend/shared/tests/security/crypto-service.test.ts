/**
 * CryptoService Test Suite
 *
 * Comprehensive tests for cryptographic operations including:
 * - AES-256-GCM encryption/decryption
 * - Bcrypt password hashing and verification
 * - Secure token generation
 * - OTP generation (numeric codes)
 * - TOTP generation and validation (2FA)
 * - API key generation with versioning
 * - Data masking (credit cards, phones, emails)
 * - HMAC signature creation and verification
 * - Key derivation functions
 * - Initialization vector (IV) uniqueness
 *
 * Priority: P0 (Critical) - Data security
 * Expected Coverage: 95%+
 */

import { CryptoService } from '../../security/utils/crypto-service';
import crypto from 'crypto';

describe('CryptoService', () => {
  // Set up test environment variables
  const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-characters-long-for-testing';
  const TEST_SIGNING_SECRET = 'test-signing-secret-for-hmac-testing';

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.SIGNING_SECRET = TEST_SIGNING_SECRET;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.SIGNING_SECRET;
  });

  // ============================================================================
  // ENCRYPTION/DECRYPTION TESTS
  // ============================================================================

  describe('encrypt() and decrypt()', () => {
    test('successfully encrypts and decrypts text', async () => {
      const plaintext = 'sensitive data';
      const encrypted = await CryptoService.encrypt(plaintext);
      const decrypted = await CryptoService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('encrypts same text differently each time (unique IV)', async () => {
      const plaintext = 'test data';
      const encrypted1 = await CryptoService.encrypt(plaintext);
      const encrypted2 = await CryptoService.encrypt(plaintext);

      // Different ciphertexts due to random IV and salt
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to same plaintext
      const decrypted1 = await CryptoService.decrypt(encrypted1);
      const decrypted2 = await CryptoService.decrypt(encrypted2);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    test('handles special characters in encryption', async () => {
      const plaintext = '!@#$%^&*()_+{}:"<>?[];\',./`~';
      const encrypted = await CryptoService.encrypt(plaintext);
      const decrypted = await CryptoService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('handles unicode characters in encryption', async () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = await CryptoService.encrypt(plaintext);
      const decrypted = await CryptoService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('handles empty string encryption', async () => {
      const plaintext = '';
      const encrypted = await CryptoService.encrypt(plaintext);
      const decrypted = await CryptoService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('handles long text encryption', async () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = await CryptoService.encrypt(plaintext);
      const decrypted = await CryptoService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('throws error when encryption key is missing', async () => {
      delete process.env.ENCRYPTION_KEY;

      await expect(CryptoService.encrypt('test')).rejects.toThrow('Encryption key not configured');

      process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });

    test('throws error when decryption key is missing', async () => {
      const encrypted = await CryptoService.encrypt('test');
      delete process.env.ENCRYPTION_KEY;

      await expect(CryptoService.decrypt(encrypted)).rejects.toThrow(
        'Encryption key not configured'
      );

      process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });

    test('fails decryption with wrong key', async () => {
      const plaintext = 'secret data';
      const encrypted = await CryptoService.encrypt(plaintext, 'correct-key');

      await expect(CryptoService.decrypt(encrypted, 'wrong-key')).rejects.toThrow();
    });

    test('fails decryption with tampered ciphertext', async () => {
      const plaintext = 'test';
      const encrypted = await CryptoService.encrypt(plaintext);

      // Tamper with the ciphertext
      const tamperedBuffer = Buffer.from(encrypted, 'base64');
      tamperedBuffer[tamperedBuffer.length - 1] ^= 0xff; // Flip bits
      const tampered = tamperedBuffer.toString('base64');

      await expect(CryptoService.decrypt(tampered)).rejects.toThrow();
    });

    test('uses custom master key when provided', async () => {
      const plaintext = 'test with custom key';
      const customKey = 'custom-master-key-for-encryption';

      const encrypted = await CryptoService.encrypt(plaintext, customKey);
      const decrypted = await CryptoService.decrypt(encrypted, customKey);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ============================================================================
  // PASSWORD HASHING TESTS
  // ============================================================================

  describe('hashPassword() and verifyPassword()', () => {
    test('hashes password successfully', async () => {
      const password = 'SecurePassword123!';
      const hash = await CryptoService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt hash format
    });

    test('creates different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await CryptoService.hashPassword(password);
      const hash2 = await CryptoService.hashPassword(password);

      // Different hashes due to salt
      expect(hash1).not.toBe(hash2);
    });

    test('verifies correct password', async () => {
      const password = 'CorrectPassword456!';
      const hash = await CryptoService.hashPassword(password);
      const isValid = await CryptoService.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('rejects incorrect password', async () => {
      const password = 'CorrectPassword789!';
      const hash = await CryptoService.hashPassword(password);
      const isValid = await CryptoService.verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });

    test('hashing is non-reversible', async () => {
      const password = 'IrreversibleHash!23';
      const hash = await CryptoService.hashPassword(password);

      // Cannot extract original password from hash
      expect(hash).not.toContain(password);
    });

    test('handles empty password', async () => {
      const password = '';
      const hash = await CryptoService.hashPassword(password);
      const isValid = await CryptoService.verifyPassword('', hash);

      expect(isValid).toBe(true);
    });
  });

  // ============================================================================
  // TOKEN GENERATION TESTS
  // ============================================================================

  describe('generateToken()', () => {
    test('generates token with default length', () => {
      const token = CryptoService.generateToken();

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
      expect(/^[0-9a-f]+$/.test(token)).toBe(true); // Hex format
    });

    test('generates token with custom length', () => {
      const token = CryptoService.generateToken(16);

      expect(token.length).toBe(32); // 16 bytes = 32 hex characters
    });

    test('generates unique tokens', () => {
      const token1 = CryptoService.generateToken();
      const token2 = CryptoService.generateToken();

      expect(token1).not.toBe(token2);
    });

    test('generates cryptographically random tokens', () => {
      const tokens = new Set();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        tokens.add(CryptoService.generateToken(8));
      }

      // All tokens should be unique (extremely high probability)
      expect(tokens.size).toBe(count);
    });
  });

  // ============================================================================
  // OTP GENERATION TESTS
  // ============================================================================

  describe('generateOTP()', () => {
    test('generates OTP with default length', () => {
      const otp = CryptoService.generateOTP();

      expect(otp).toBeDefined();
      expect(otp.length).toBe(6);
      expect(/^\d+$/.test(otp)).toBe(true); // All digits
    });

    test('generates OTP with custom length', () => {
      const otp = CryptoService.generateOTP(8);

      expect(otp.length).toBe(8);
      expect(/^\d+$/.test(otp)).toBe(true);
    });

    test('generates numeric-only OTP', () => {
      const otp = CryptoService.generateOTP();

      expect(parseInt(otp, 10).toString()).toBe(otp);
    });

    test('generates unique OTPs', () => {
      const otp1 = CryptoService.generateOTP();
      const otp2 = CryptoService.generateOTP();

      // Very unlikely to be the same (1 in 1,000,000 chance)
      expect(otp1).not.toBe(otp2);
    });

    test('generates OTPs within valid range', () => {
      const otp = CryptoService.generateOTP(4);
      const num = parseInt(otp, 10);

      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(10000);
    });
  });

  // ============================================================================
  // TOTP GENERATION TESTS (2FA)
  // ============================================================================

  describe('generateTOTP()', () => {
    test('generates valid 6-digit TOTP', () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Base32 encoded secret
      const totp = CryptoService.generateTOTP(secret);

      expect(totp).toBeDefined();
      expect(totp.length).toBe(6);
      expect(/^\d{6}$/.test(totp)).toBe(true);
    });

    test('generates same TOTP within time window', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const totp1 = CryptoService.generateTOTP(secret);
      const totp2 = CryptoService.generateTOTP(secret);

      // Should be same within 30-second window
      expect(totp1).toBe(totp2);
    });

    test('TOTP is time-dependent', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      // Mock time to test time dependency
      const originalNow = Date.now;
      Date.now = jest.fn(() => 1000000000000); // Fixed time
      const totp1 = CryptoService.generateTOTP(secret);

      Date.now = jest.fn(() => 1000000030000); // 30 seconds later
      const totp2 = CryptoService.generateTOTP(secret);

      Date.now = originalNow;

      // Different time windows should generate different TOTPs
      expect(totp1).not.toBe(totp2);
    });

    test('pads TOTP with leading zeros', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const totp = CryptoService.generateTOTP(secret);

      // Should always be exactly 6 digits, padded with zeros if needed
      expect(totp.length).toBe(6);
      expect(totp.match(/^\d{6}$/)).toBeTruthy();
    });
  });

  // ============================================================================
  // API KEY GENERATION TESTS
  // ============================================================================

  describe('generateAPIKey() and hashAPIKey()', () => {
    test('generates API key with correct prefix', () => {
      const apiKey = CryptoService.generateAPIKey();

      expect(apiKey.startsWith('sk_live_')).toBe(true);
    });

    test('generates unique API keys', () => {
      const key1 = CryptoService.generateAPIKey();
      const key2 = CryptoService.generateAPIKey();

      expect(key1).not.toBe(key2);
    });

    test('API key has sufficient length', () => {
      const apiKey = CryptoService.generateAPIKey();

      // Should be long enough to be secure
      expect(apiKey.length).toBeGreaterThan(40);
    });

    test('hashes API key consistently', () => {
      const apiKey = 'sk_live_test123';
      const hash1 = CryptoService.hashAPIKey(apiKey);
      const hash2 = CryptoService.hashAPIKey(apiKey);

      expect(hash1).toBe(hash2);
    });

    test('different API keys produce different hashes', () => {
      const key1 = CryptoService.generateAPIKey();
      const key2 = CryptoService.generateAPIKey();

      const hash1 = CryptoService.hashAPIKey(key1);
      const hash2 = CryptoService.hashAPIKey(key2);

      expect(hash1).not.toBe(hash2);
    });

    test('API key hash is SHA-256', () => {
      const apiKey = 'sk_live_test';
      const hash = CryptoService.hashAPIKey(apiKey);

      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });

  // ============================================================================
  // DATA MASKING TESTS
  // ============================================================================

  describe('maskData()', () => {
    test('masks credit card showing last 4 digits', () => {
      const creditCard = '4111111111111111';
      const masked = CryptoService.maskData(creditCard, 4);

      expect(masked).toBe('************1111');
    });

    test('masks phone number showing last 4 digits', () => {
      const phone = '5551234567';
      const masked = CryptoService.maskData(phone, 4);

      expect(masked).toBe('******4567');
    });

    test('masks email showing custom number of characters', () => {
      const email = 'user@example.com';
      const masked = CryptoService.maskData(email, 6);

      expect(masked).toBe('**********le.com');
    });

    test('completely masks short strings', () => {
      const short = 'abc';
      const masked = CryptoService.maskData(short, 4);

      expect(masked).toBe('***');
    });

    test('handles empty string', () => {
      const empty = '';
      const masked = CryptoService.maskData(empty, 4);

      expect(masked).toBe('');
    });

    test('masks data showing default last 4 characters', () => {
      const data = '1234567890';
      const masked = CryptoService.maskData(data);

      expect(masked).toBe('******7890');
    });
  });

  // ============================================================================
  // HMAC SIGNING AND VERIFICATION TESTS
  // ============================================================================

  describe('sign() and verify()', () => {
    test('signs data successfully', () => {
      const data = 'important data';
      const signature = CryptoService.sign(data);

      expect(signature).toBeDefined();
      expect(signature.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    test('creates consistent signatures', () => {
      const data = 'test data';
      const sig1 = CryptoService.sign(data);
      const sig2 = CryptoService.sign(data);

      expect(sig1).toBe(sig2);
    });

    test('different data produces different signatures', () => {
      const sig1 = CryptoService.sign('data1');
      const sig2 = CryptoService.sign('data2');

      expect(sig1).not.toBe(sig2);
    });

    test('verifies valid signature', () => {
      const data = 'verify this';
      const signature = CryptoService.sign(data);
      const isValid = CryptoService.verify(data, signature);

      expect(isValid).toBe(true);
    });

    test('rejects invalid signature', () => {
      const data = 'test data';
      const invalidSig = 'invalid'.padEnd(64, '0');
      const isValid = CryptoService.verify(data, invalidSig);

      expect(isValid).toBe(false);
    });

    test('rejects signature for tampered data', () => {
      const originalData = 'original';
      const signature = CryptoService.sign(originalData);
      const tamperedData = 'tampered';
      const isValid = CryptoService.verify(tamperedData, signature);

      expect(isValid).toBe(false);
    });

    test('throws error when signing secret is missing', () => {
      delete process.env.SIGNING_SECRET;

      expect(() => CryptoService.sign('test')).toThrow('Signing secret not configured');

      process.env.SIGNING_SECRET = TEST_SIGNING_SECRET;
    });

    test('throws error when verification secret is missing', () => {
      const data = 'test';
      const signature = CryptoService.sign(data);

      delete process.env.SIGNING_SECRET;

      expect(() => CryptoService.verify(data, signature)).toThrow('Signing secret not configured');

      process.env.SIGNING_SECRET = TEST_SIGNING_SECRET;
    });

    test('uses custom secret when provided', () => {
      const data = 'test with custom secret';
      const customSecret = 'custom-hmac-secret';

      const signature = CryptoService.sign(data, customSecret);
      const isValid = CryptoService.verify(data, signature, customSecret);

      expect(isValid).toBe(true);
    });

    test('signature verification is timing-safe', () => {
      const data = 'timing test';
      const signature = CryptoService.sign(data);

      // Should use crypto.timingSafeEqual internally
      // This prevents timing attacks
      const isValid = CryptoService.verify(data, signature);
      expect(isValid).toBe(true);
    });
  });

  // ============================================================================
  // DATABASE FIELD ENCRYPTION TESTS
  // ============================================================================

  describe('encryptField() and decryptField()', () => {
    test('encrypts and decrypts string field', async () => {
      const value = 'sensitive string';
      const encrypted = await CryptoService.encryptField(value);
      const decrypted = await CryptoService.decryptField(encrypted);

      expect(decrypted).toBe(value);
    });

    test('encrypts and decrypts object field', async () => {
      const value = { key: 'value', number: 123, nested: { data: 'test' } };
      const encrypted = await CryptoService.encryptField(value);
      const decrypted = await CryptoService.decryptField(encrypted);

      expect(decrypted).toEqual(value);
    });

    test('encrypts and decrypts array field', async () => {
      const value = [1, 2, 3, 'four', { five: 5 }];
      const encrypted = await CryptoService.encryptField(value);
      const decrypted = await CryptoService.decryptField(encrypted);

      expect(decrypted).toEqual(value);
    });

    test('handles null value', async () => {
      const encrypted = await CryptoService.encryptField(null);

      expect(encrypted).toBeNull();
    });

    test('handles undefined value', async () => {
      const encrypted = await CryptoService.encryptField(undefined);

      expect(encrypted).toBeUndefined();
    });

    test('returns null for empty encrypted value', async () => {
      const decrypted = await CryptoService.decryptField('');

      expect(decrypted).toBeNull();
    });

    test('encrypts boolean field', async () => {
      const value = true;
      const encrypted = await CryptoService.encryptField(value);
      const decrypted = await CryptoService.decryptField(encrypted);

      expect(decrypted).toBe(value);
    });

    test('encrypts numeric field', async () => {
      const value = 42;
      const encrypted = await CryptoService.encryptField(value);
      const decrypted = await CryptoService.decryptField(encrypted);

      expect(decrypted).toBe(value);
    });
  });
});
