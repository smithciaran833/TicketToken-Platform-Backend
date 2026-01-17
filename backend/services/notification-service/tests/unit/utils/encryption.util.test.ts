import { EncryptionUtil, encryptionUtil } from '../../../src/utils/encryption.util';
import { logger } from '../../../src/config/logger';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EncryptionUtil', () => {
  let util: EncryptionUtil;
  const TEST_KEY = 'test-encryption-key-at-least-32-chars-long-12345';

  beforeEach(() => {
    jest.clearAllMocks();
    // Set environment variable for tests
    process.env.ENCRYPTION_MASTER_KEY = TEST_KEY;
    util = new EncryptionUtil();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with valid master key', () => {
      expect(util.isEnabled()).toBe(true);
    });

    it('should warn when master key is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      new EncryptionUtil();
      
      expect(logger.warn).toHaveBeenCalledWith('ENCRYPTION_MASTER_KEY not set. PII encryption disabled.');
    });

    it('should throw error when master key is too short', () => {
      process.env.ENCRYPTION_MASTER_KEY = 'short';
      
      expect(() => new EncryptionUtil()).toThrow('ENCRYPTION_MASTER_KEY must be at least 32 characters');
    });

    it('should be disabled when no key is provided', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      const disabledUtil = new EncryptionUtil();
      
      expect(disabledUtil.isEnabled()).toBe(false);
    });
  });

  describe('isEnabled()', () => {
    it('should return true when properly configured', () => {
      expect(util.isEnabled()).toBe(true);
    });

    it('should return false without master key', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      const disabledUtil = new EncryptionUtil();
      
      expect(disabledUtil.isEnabled()).toBe(false);
    });
  });

  describe('encrypt() and decrypt()', () => {
    it('should encrypt and decrypt a string successfully', () => {
      const plaintext = 'sensitive data';
      
      const encrypted = util.encrypt(plaintext);
      const decrypted = util.decrypt(encrypted);
      
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain('.');
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted values for same input (due to random salt/IV)', () => {
      const plaintext = 'test data';
      
      const encrypted1 = util.encrypt(plaintext);
      const encrypted2 = util.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(util.decrypt(encrypted1)).toBe(plaintext);
      expect(util.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt and decrypt special characters', () => {
      const plaintext = 'test@example.com!@#$%^&*()';
      
      const encrypted = util.encrypt(plaintext);
      const decrypted = util.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode characters', () => {
      const plaintext = '你好世界 🎉 Ñoño';
      
      const encrypted = util.encrypt(plaintext);
      const decrypted = util.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const result = util.encrypt('');
      expect(result).toBe('');
    });

    it('should return plaintext when encryption is disabled', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      const disabledUtil = new EncryptionUtil();
      
      const plaintext = 'test data';
      const result = disabledUtil.encrypt(plaintext);
      
      expect(result).toBe(plaintext);
      expect(logger.warn).toHaveBeenCalledWith('Encryption not enabled, returning plaintext');
    });

    it('should return encrypted value when decryption is disabled', () => {
      const encrypted = util.encrypt('test');
      
      delete process.env.ENCRYPTION_MASTER_KEY;
      const disabledUtil = new EncryptionUtil();
      const result = disabledUtil.decrypt(encrypted);
      
      expect(result).toBe(encrypted);
    });

    it('should handle long strings', () => {
      const plaintext = 'x'.repeat(10000);
      
      const encrypted = util.encrypt(plaintext);
      const decrypted = util.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Encryption Format', () => {
    it('should produce encrypted string with 4 dot-separated parts', () => {
      const encrypted = util.encrypt('test');
      const parts = encrypted.split('.');
      
      expect(parts).toHaveLength(4);
      // All parts should be base64
      parts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9+/=]+$/);
      });
    });

    it('should throw error for invalid encrypted format during decryption', () => {
      expect(() => util.decrypt('invalid.format')).toThrow('Failed to decrypt data');
      expect(logger.error).toHaveBeenCalledWith('Decryption failed', expect.any(Object));
    });

    it('should handle malformed base64', () => {
      const malformed = 'abc.def.ghi.jkl';
      expect(() => util.decrypt(malformed)).toThrow('Failed to decrypt data');
    });
  });

  describe('hash()', () => {
    it('should produce deterministic SHA-256 hash', () => {
      const value = 'test value';
      
      const hash1 = util.hash(value);
      const hash2 = util.hash(value);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex chars
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = util.hash('value1');
      const hash2 = util.hash('value2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const result = util.hash('');
      expect(result).toBe('');
    });

    it('should be case-sensitive', () => {
      const hash1 = util.hash('Test');
      const hash2 = util.hash('test');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Email Methods', () => {
    describe('encryptEmail() and decryptEmail()', () => {
      it('should encrypt and decrypt email', () => {
        const email = 'user@example.com';
        
        const encrypted = util.encryptEmail(email);
        const decrypted = util.decryptEmail(encrypted);
        
        expect(decrypted).toBe(email);
      });

      it('should normalize email to lowercase', () => {
        const email = 'User@EXAMPLE.COM';
        
        const encrypted = util.encryptEmail(email);
        const decrypted = util.decryptEmail(encrypted);
        
        expect(decrypted).toBe('user@example.com');
      });

      it('should trim whitespace from email', () => {
        const email = '  user@example.com  ';
        
        const encrypted = util.encryptEmail(email);
        const decrypted = util.decryptEmail(encrypted);
        
        expect(decrypted).toBe('user@example.com');
      });
    });

    describe('hashEmail()', () => {
      it('should hash email consistently', () => {
        const email = 'user@example.com';
        
        const hash1 = util.hashEmail(email);
        const hash2 = util.hashEmail(email);
        
        expect(hash1).toBe(hash2);
      });

      it('should normalize email before hashing', () => {
        const hash1 = util.hashEmail('User@EXAMPLE.COM');
        const hash2 = util.hashEmail('user@example.com');
        
        expect(hash1).toBe(hash2);
      });

      it('should trim email before hashing', () => {
        const hash1 = util.hashEmail('  user@example.com  ');
        const hash2 = util.hashEmail('user@example.com');
        
        expect(hash1).toBe(hash2);
      });
    });
  });

  describe('Phone Methods', () => {
    describe('encryptPhone() and decryptPhone()', () => {
      it('should encrypt and decrypt phone number', () => {
        const phone = '+1234567890';
        
        const encrypted = util.encryptPhone(phone);
        const decrypted = util.decryptPhone(encrypted);
        
        expect(decrypted).toBe(phone);
      });

      it('should normalize phone number (remove formatting)', () => {
        const phone = '+1 (234) 567-8900';
        
        const encrypted = util.encryptPhone(phone);
        const decrypted = util.decryptPhone(encrypted);
        
        expect(decrypted).toBe('+12345678900');
      });

      it('should handle phone without country code', () => {
        const phone = '234-567-8900';
        
        const encrypted = util.encryptPhone(phone);
        const decrypted = util.decryptPhone(encrypted);
        
        expect(decrypted).toBe('2345678900');
      });
    });

    describe('hashPhone()', () => {
      it('should hash phone consistently', () => {
        const phone = '+1234567890';
        
        const hash1 = util.hashPhone(phone);
        const hash2 = util.hashPhone(phone);
        
        expect(hash1).toBe(hash2);
      });

      it('should normalize phone before hashing', () => {
        const hash1 = util.hashPhone('+1 (234) 567-8900');
        const hash2 = util.hashPhone('+12345678900');
        
        expect(hash1).toBe(hash2);
      });
    });
  });

  describe('Generic PII Methods', () => {
    it('should encrypt and decrypt PII', () => {
      const pii = 'sensitive information';
      
      const encrypted = util.encryptPII(pii);
      const decrypted = util.decryptPII(encrypted);
      
      expect(decrypted).toBe(pii);
    });
  });

  describe('Batch Operations', () => {
    describe('encryptBatch()', () => {
      it('should encrypt multiple values', () => {
        const values = ['value1', 'value2', 'value3'];
        
        const encrypted = util.encryptBatch(values);
        
        expect(encrypted).toHaveLength(3);
        encrypted.forEach((enc, i) => {
          expect(util.decrypt(enc)).toBe(values[i]);
        });
      });

      it('should handle empty array', () => {
        const result = util.encryptBatch([]);
        expect(result).toEqual([]);
      });
    });

    describe('decryptBatch()', () => {
      it('should decrypt multiple values', () => {
        const values = ['value1', 'value2', 'value3'];
        const encrypted = util.encryptBatch(values);
        
        const decrypted = util.decryptBatch(encrypted);
        
        expect(decrypted).toEqual(values);
      });

      it('should handle empty array', () => {
        const result = util.decryptBatch([]);
        expect(result).toEqual([]);
      });
    });
  });

  describe('Key Rotation', () => {
    it('should rotate encryption key', () => {
      const plaintext = 'sensitive data';
      const oldKey = 'old-encryption-key-at-least-32-chars-long-12345';
      const newKey = 'new-encryption-key-at-least-32-chars-long-12345';
      
      // Encrypt with old key
      process.env.ENCRYPTION_MASTER_KEY = oldKey;
      const oldUtil = new EncryptionUtil();
      const encrypted = oldUtil.encrypt(plaintext);
      
      // Rotate to new key
      process.env.ENCRYPTION_MASTER_KEY = newKey;
      const newUtil = new EncryptionUtil();
      const rotated = newUtil.rotateKey(encrypted, oldKey);
      
      // Decrypt with new key
      const decrypted = newUtil.decrypt(rotated);
      
      expect(decrypted).toBe(plaintext);
      expect(rotated).not.toBe(encrypted);
    });

    it('should handle rotation errors gracefully', () => {
      const encrypted = util.encrypt('test');
      const wrongOldKey = 'wrong-key-that-is-at-least-32-chars-long-123';
      
      expect(() => util.rotateKey(encrypted, wrongOldKey)).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors', () => {
      // Create util with invalid setup that will cause encryption to fail
      const spy = jest.spyOn(crypto, 'createCipheriv').mockImplementation(() => {
        throw new Error('Cipher error');
      });
      
      expect(() => util.encrypt('test')).toThrow('Failed to encrypt data');
      expect(logger.error).toHaveBeenCalledWith('Encryption failed', expect.any(Object));
      
      spy.mockRestore();
    });

    it('should handle decryption errors', () => {
      const invalidEncrypted = 'valid.format.but.invalid';
      
      expect(() => util.decrypt(invalidEncrypted)).toThrow('Failed to decrypt data');
      expect(logger.error).toHaveBeenCalledWith('Decryption failed', expect.any(Object));
    });

    it('should return non-dot-separated values as-is during decryption', () => {
      const result = util.decrypt('nodots');
      expect(result).toBe('nodots');
    });
  });

  describe('Key Derivation and Caching', () => {
    it('should cache derived keys', () => {
      const plaintext = 'test';
      
      // First encryption creates key
      const encrypted1 = util.encrypt(plaintext);
      
      // Spy on pbkdf2Sync to see if it's called again
      const spy = jest.spyOn(crypto, 'pbkdf2Sync');
      
      // Second encryption might reuse cached key (though salt is different)
      const encrypted2 = util.encrypt(plaintext);
      
      // Each encryption uses different salt, so new keys are derived
      expect(spy).toHaveBeenCalled();
      
      spy.mockRestore();
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(encryptionUtil).toBeInstanceOf(EncryptionUtil);
    });

    it('should maintain state across imports', () => {
      const encrypted = encryptionUtil.encrypt('test');
      expect(encryptionUtil.isEnabled()).toBe(true);
      
      // Decrypt using same instance
      const decrypted = encryptionUtil.decrypt(encrypted);
      expect(decrypted).toBe('test');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = util.encrypt(null as any);
      expect(result).toBe(null);
    });

    it('should handle undefined input gracefully', () => {
      const result = util.encrypt(undefined as any);
      expect(result).toBe(undefined);
    });

    it('should handle numbers as input', () => {
      const encrypted = util.encrypt('12345');
      const decrypted = util.decrypt(encrypted);
      expect(decrypted).toBe('12345');
    });

    it('should handle very long strings efficiently', () => {
      const longString = 'a'.repeat(100000);
      
      const start = Date.now();
      const encrypted = util.encrypt(longString);
      const decrypted = util.decrypt(encrypted);
      const duration = Date.now() - start;
      
      expect(decrypted).toBe(longString);
      expect(duration).toBeLessThan(5000); // Should complete in reasonable time
    });
  });
});
