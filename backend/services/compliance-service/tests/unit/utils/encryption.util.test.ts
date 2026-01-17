/**
 * Unit Tests for Encryption Utility
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Set encryption key before any imports
const TEST_ENCRYPTION_KEY = 'test-encryption-key-that-is-at-least-32-chars-long-with-entropy';

// Mock logger before importing encryption module
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Encryption Utility', () => {
  let encrypt: any;
  let decrypt: any;
  let hash: any;
  let encryptFields: any;
  let decryptFields: any;
  let redact: any;
  let validateEncryptionKey: any;
  let logger: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env = { 
      ...originalEnv,
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY
    };

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/utils/encryption.util');
    encrypt = module.encrypt;
    decrypt = module.decrypt;
    hash = module.hash;
    encryptFields = module.encryptFields;
    decryptFields = module.decryptFields;
    redact = module.redact;
    validateEncryptionKey = module.validateEncryptionKey;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('encrypt', () => {
    it('should encrypt plaintext', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should return different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'sensitive data';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should return empty/falsy value unchanged', () => {
      expect(encrypt('')).toBe('');
      expect(encrypt(null as any)).toBe(null);
      expect(encrypt(undefined as any)).toBe(undefined);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🎉 مرحبا';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext back to plaintext', () => {
      const plaintext = 'sensitive data';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return empty/falsy value unchanged', () => {
      expect(decrypt('')).toBe('');
      expect(decrypt(null as any)).toBe(null);
      expect(decrypt(undefined as any)).toBe(undefined);
    });

    it('should throw on invalid ciphertext', () => {
      expect(() => decrypt('invalid-ciphertext')).toThrow('Failed to decrypt data');
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encrypt('sensitive data');
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      expect(() => decrypt(tampered)).toThrow('Failed to decrypt data');
    });

    it('should log error on decryption failure', () => {
      try {
        decrypt('invalid-base64-ciphertext');
      } catch (e) {}

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.anything() }),
        'Decryption failed:'
      );
    });
  });

  describe('hash', () => {
    it('should hash data consistently', () => {
      const data = 'sensitive data';
      const hash1 = hash(data);
      const hash2 = hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hash('data1');
      const hash2 = hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should return empty/falsy value unchanged', () => {
      expect(hash('')).toBe('');
      expect(hash(null as any)).toBe(null);
      expect(hash(undefined as any)).toBe(undefined);
    });

    it('should return hex string', () => {
      const result = hash('test');
      expect(result).toMatch(/^[a-f0-9]+$/);
    });

    it('should return 64 character hash (SHA-256)', () => {
      const result = hash('test');
      expect(result.length).toBe(64);
    });
  });

  describe('encryptFields', () => {
    it('should encrypt specified fields', () => {
      const obj = {
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com',
        age: 30
      };

      const encrypted = encryptFields(obj, ['ssn', 'email']);

      expect(encrypted.name).toBe('John Doe');
      expect(encrypted.ssn).not.toBe('123-45-6789');
      expect(encrypted.email).not.toBe('john@example.com');
      expect(encrypted.age).toBe(30);
    });

    it('should not modify original object', () => {
      const obj = { ssn: '123-45-6789' };
      const encrypted = encryptFields(obj, ['ssn']);

      expect(obj.ssn).toBe('123-45-6789');
      expect(encrypted.ssn).not.toBe('123-45-6789');
    });

    it('should skip null/undefined fields', () => {
      const obj = { ssn: null, email: undefined, name: 'John' };
      const encrypted = encryptFields(obj, ['ssn', 'email', 'name']);

      expect(encrypted.ssn).toBeNull();
      expect(encrypted.email).toBeUndefined();
      expect(encrypted.name).not.toBe('John');
    });

    it('should skip non-string fields', () => {
      const obj = { count: 42, active: true };
      const encrypted = encryptFields(obj, ['count', 'active'] as any);

      expect(encrypted.count).toBe(42);
      expect(encrypted.active).toBe(true);
    });
  });

  describe('decryptFields', () => {
    it('should decrypt specified fields', () => {
      const original = {
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      const encrypted = encryptFields(original, ['ssn', 'email']);
      const decrypted = decryptFields(encrypted, ['ssn', 'email']);

      expect(decrypted.name).toBe('John Doe');
      expect(decrypted.ssn).toBe('123-45-6789');
      expect(decrypted.email).toBe('john@example.com');
    });

    it('should not modify original object', () => {
      const original = { ssn: '123-45-6789' };
      const encrypted = encryptFields(original, ['ssn']);
      const encryptedSsn = encrypted.ssn;
      
      decryptFields(encrypted, ['ssn']);

      expect(encrypted.ssn).toBe(encryptedSsn);
    });

    it('should keep original value if decryption fails', () => {
      const obj = { ssn: 'not-encrypted-value' };
      const result = decryptFields(obj, ['ssn']);

      expect(result.ssn).toBe('not-encrypted-value');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to decrypt field ssn')
      );
    });

    it('should skip null/undefined fields', () => {
      const obj = { ssn: null, email: undefined };
      const result = decryptFields(obj, ['ssn', 'email']);

      expect(result.ssn).toBeNull();
      expect(result.email).toBeUndefined();
    });
  });

  describe('redact', () => {
    it('should redact middle of string', () => {
      const result = redact('123-45-6789');
      expect(result).toBe('12****89');
    });

    it('should return **** for short strings', () => {
      expect(redact('ab')).toBe('****');
      expect(redact('abc')).toBe('****');
      expect(redact('abcd')).toBe('****');
    });

    it('should return **** for empty string', () => {
      expect(redact('')).toBe('****');
    });

    it('should return **** for null/undefined', () => {
      expect(redact(null as any)).toBe('****');
      expect(redact(undefined as any)).toBe('****');
    });

    it('should handle 5 character strings', () => {
      const result = redact('12345');
      expect(result).toBe('12****45');
    });
  });

  describe('validateEncryptionKey', () => {
    it('should return true for valid key', () => {
      const validKey = 'abcdefghijklmnopqrstuvwxyz123456';
      expect(validateEncryptionKey(validKey)).toBe(true);
    });

    it('should return false for short key', () => {
      const shortKey = 'short';
      expect(validateEncryptionKey(shortKey)).toBe(false);
    });

    it('should return false for low entropy key', () => {
      const lowEntropyKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expect(validateEncryptionKey(lowEntropyKey)).toBe(false);
    });

    it('should require at least 10 unique characters', () => {
      const nineUnique = 'abcdefghi' + 'a'.repeat(23);
      const tenUnique = 'abcdefghij' + 'a'.repeat(22);

      expect(validateEncryptionKey(nineUnique)).toBe(false);
      expect(validateEncryptionKey(tenUnique)).toBe(true);
    });
  });

  describe('module initialization', () => {
    it('should throw if ENCRYPTION_KEY is missing', async () => {
      jest.resetModules();
      delete process.env.ENCRYPTION_KEY;

      await expect(import('../../../src/utils/encryption.util')).rejects.toThrow(
        'ENCRYPTION_KEY environment variable is required'
      );
    });

    it('should throw if ENCRYPTION_KEY is weak', async () => {
      jest.resetModules();
      process.env.ENCRYPTION_KEY = 'weak';

      await expect(import('../../../src/utils/encryption.util')).rejects.toThrow(
        'ENCRYPTION_KEY must be at least 32 characters'
      );
    });

    it('should log info on successful initialization', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Encryption utility initialized successfully'
      );
    });
  });
});
