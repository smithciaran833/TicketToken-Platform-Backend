/**
 * Unit Tests for Crypto Utilities
 * 
 * Tests cryptographic operations including timing-safe comparison,
 * token generation, HMAC, hashing, and encryption.
 */

import {
  secureCompare,
  secureCompareBuffers,
  generateSecureToken,
  generateSecureUUID,
  generateSecureBase64,
  generateAlphanumeric,
  generateHmac,
  verifyHmac,
  generateTimestampedHmac,
  verifyTimestampedHmac,
  sha256,
  sha512,
  hashForLogging,
  encrypt,
  decrypt,
  deriveKey,
  deriveKeySync,
  generateIdempotencyKey,
  signServiceRequest,
  verifyServiceRequest,
} from '../../../src/utils/crypto.util';

describe('Crypto Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SERVICE_AUTH_SECRET = 'test-service-secret-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('secureCompare', () => {
    it('should return true for identical strings', () => {
      expect(secureCompare('test-string', 'test-string')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(secureCompare('string-a', 'string-b')).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      expect(secureCompare('short', 'longer-string')).toBe(false);
    });

    it('should return true for empty strings', () => {
      expect(secureCompare('', '')).toBe(true);
    });

    it('should return false for empty vs non-empty', () => {
      expect(secureCompare('', 'non-empty')).toBe(false);
    });

    it('should handle special characters', () => {
      const special1 = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const special2 = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(secureCompare(special1, special2)).toBe(true);
    });

    it('should handle unicode characters', () => {
      expect(secureCompare('🔐🔑💳', '🔐🔑💳')).toBe(true);
      expect(secureCompare('🔐🔑💳', '🔐🔑🔒')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(secureCompare('ABC', 'abc')).toBe(false);
    });
  });

  describe('secureCompareBuffers', () => {
    it('should return true for identical buffers', () => {
      const buf1 = Buffer.from('test');
      const buf2 = Buffer.from('test');
      expect(secureCompareBuffers(buf1, buf2)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const buf1 = Buffer.from('test1');
      const buf2 = Buffer.from('test2');
      expect(secureCompareBuffers(buf1, buf2)).toBe(false);
    });

    it('should return false for buffers of different lengths', () => {
      const buf1 = Buffer.from('short');
      const buf2 = Buffer.from('longer-buffer');
      expect(secureCompareBuffers(buf1, buf2)).toBe(false);
    });

    it('should handle binary data', () => {
      const buf1 = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      const buf2 = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      expect(secureCompareBuffers(buf1, buf2)).toBe(true);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate token with default length (32 bytes = 64 hex chars)', () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate token with custom length', () => {
      const token = generateSecureToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('should handle length of 1', () => {
      const token = generateSecureToken(1);
      expect(token).toHaveLength(2);
    });
  });

  describe('generateSecureUUID', () => {
    it('should generate valid UUID format', () => {
      const uuid = generateSecureUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateSecureUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('generateSecureBase64', () => {
    it('should generate base64url encoded string', () => {
      const token = generateSecureBase64();
      // base64url uses A-Z, a-z, 0-9, -, _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate string with expected length', () => {
      const token = generateSecureBase64(16);
      // 16 bytes = ~22 base64 chars (ceil(16 * 4/3))
      expect(token.length).toBeGreaterThanOrEqual(21);
      expect(token.length).toBeLessThanOrEqual(22);
    });

    it('should generate unique strings', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(generateSecureBase64());
      }
      expect(tokens.size).toBe(50);
    });
  });

  describe('generateAlphanumeric', () => {
    it('should generate alphanumeric string of default length', () => {
      const str = generateAlphanumeric();
      expect(str).toHaveLength(32);
      expect(str).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate string of custom length', () => {
      const str = generateAlphanumeric(10);
      expect(str).toHaveLength(10);
    });

    it('should only contain alphanumeric characters', () => {
      for (let i = 0; i < 100; i++) {
        const str = generateAlphanumeric(100);
        expect(str).toMatch(/^[A-Za-z0-9]+$/);
      }
    });
  });

  describe('generateHmac', () => {
    it('should generate SHA-256 HMAC by default', () => {
      const hmac = generateHmac('test-payload', 'secret');
      expect(hmac).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex
    });

    it('should generate SHA-512 HMAC when specified', () => {
      const hmac = generateHmac('test-payload', 'secret', 'sha512');
      expect(hmac).toHaveLength(128); // SHA-512 = 64 bytes = 128 hex
    });

    it('should generate consistent HMAC for same input', () => {
      const hmac1 = generateHmac('payload', 'secret');
      const hmac2 = generateHmac('payload', 'secret');
      expect(hmac1).toBe(hmac2);
    });

    it('should generate different HMAC for different payloads', () => {
      const hmac1 = generateHmac('payload1', 'secret');
      const hmac2 = generateHmac('payload2', 'secret');
      expect(hmac1).not.toBe(hmac2);
    });

    it('should generate different HMAC for different secrets', () => {
      const hmac1 = generateHmac('payload', 'secret1');
      const hmac2 = generateHmac('payload', 'secret2');
      expect(hmac1).not.toBe(hmac2);
    });

    it('should handle Buffer input', () => {
      const buffer = Buffer.from('test-payload');
      const hmac = generateHmac(buffer, 'secret');
      expect(hmac).toHaveLength(64);
    });
  });

  describe('verifyHmac', () => {
    it('should return true for valid signature', () => {
      const signature = generateHmac('payload', 'secret');
      expect(verifyHmac('payload', signature, 'secret')).toBe(true);
    });

    it('should return false for invalid signature', () => {
      expect(verifyHmac('payload', 'invalid-signature', 'secret')).toBe(false);
    });

    it('should return false for wrong payload', () => {
      const signature = generateHmac('payload', 'secret');
      expect(verifyHmac('wrong-payload', signature, 'secret')).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const signature = generateHmac('payload', 'secret');
      expect(verifyHmac('payload', signature, 'wrong-secret')).toBe(false);
    });

    it('should work with SHA-512', () => {
      const signature = generateHmac('payload', 'secret', 'sha512');
      expect(verifyHmac('payload', signature, 'secret', 'sha512')).toBe(true);
    });
  });

  describe('generateTimestampedHmac', () => {
    it('should return signature and timestamp', () => {
      const result = generateTimestampedHmac('payload', 'secret');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.signature).toBe('string');
      expect(typeof result.timestamp).toBe('number');
    });

    it('should generate valid signatures', () => {
      const result = generateTimestampedHmac('payload', 'secret');
      expect(result.signature).toHaveLength(64);
    });

    it('should include current timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = generateTimestampedHmac('payload', 'secret');
      const after = Math.floor(Date.now() / 1000);
      
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('verifyTimestampedHmac', () => {
    it('should verify valid timestamped signature', () => {
      const { signature, timestamp } = generateTimestampedHmac('payload', 'secret');
      expect(verifyTimestampedHmac('payload', signature, timestamp, 'secret')).toBe(true);
    });

    it('should reject expired timestamp', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signedPayload = `${oldTimestamp}.payload`;
      const signature = generateHmac(signedPayload, 'secret');
      
      expect(verifyTimestampedHmac('payload', signature, oldTimestamp, 'secret', 300)).toBe(false);
    });

    it('should accept timestamp within window', () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const signedPayload = `${recentTimestamp}.payload`;
      const signature = generateHmac(signedPayload, 'secret');
      
      expect(verifyTimestampedHmac('payload', signature, recentTimestamp, 'secret', 300)).toBe(true);
    });

    it('should reject future timestamps', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 400 seconds in future
      const signedPayload = `${futureTimestamp}.payload`;
      const signature = generateHmac(signedPayload, 'secret');
      
      expect(verifyTimestampedHmac('payload', signature, futureTimestamp, 'secret', 300)).toBe(false);
    });
  });

  describe('sha256', () => {
    it('should generate correct SHA-256 hash', () => {
      const hash = sha256('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should generate consistent hashes', () => {
      const hash1 = sha256('data');
      const hash2 = sha256('data');
      expect(hash1).toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = sha256('');
      expect(hash).toHaveLength(64);
    });

    it('should handle Buffer input', () => {
      const hash = sha256(Buffer.from('test'));
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });
  });

  describe('sha512', () => {
    it('should generate correct length hash', () => {
      const hash = sha512('test');
      expect(hash).toHaveLength(128); // 64 bytes = 128 hex
    });

    it('should generate different hash than sha256', () => {
      const hash256 = sha256('test');
      const hash512 = sha512('test');
      expect(hash256).not.toBe(hash512);
    });
  });

  describe('hashForLogging', () => {
    it('should return truncated hash', () => {
      const hash = hashForLogging('sensitive-data');
      expect(hash).toMatch(/^[0-9a-f]{16}\.\.\.$/);
    });

    it('should be consistent for same input', () => {
      const hash1 = hashForLogging('data');
      const hash2 = hashForLogging('data');
      expect(hash1).toBe(hash2);
    });

    it('should produce different outputs for different inputs', () => {
      const hash1 = hashForLogging('data1');
      const hash2 = hashForLogging('data2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt successfully', () => {
      const plaintext = 'secret message';
      const key = 'encryption-key';
      
      const ciphertext = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, key);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (due to IV)', () => {
      const plaintext = 'message';
      const key = 'key';
      
      const ciphertext1 = encrypt(plaintext, key);
      const ciphertext2 = encrypt(plaintext, key);
      
      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it('should handle empty string', () => {
      const ciphertext = encrypt('', 'key');
      const decrypted = decrypt(ciphertext, 'key');
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', () => {
      const plaintext = '🔐 Secret emoji message! 中文测试';
      const key = 'unicode-key';
      
      const ciphertext = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, key);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail with wrong key', () => {
      const ciphertext = encrypt('message', 'correct-key');
      
      expect(() => decrypt(ciphertext, 'wrong-key')).toThrow();
    });

    it('should fail with invalid ciphertext format', () => {
      expect(() => decrypt('invalid', 'key')).toThrow('Invalid ciphertext format');
    });

    it('should handle long plaintext', () => {
      const plaintext = 'a'.repeat(10000);
      const key = 'key';
      
      const ciphertext = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, key);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('deriveKey', () => {
    it('should derive key asynchronously', async () => {
      const key = await deriveKey('password', 'salt');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce consistent keys', async () => {
      const key1 = await deriveKey('password', 'salt');
      const key2 = await deriveKey('password', 'salt');
      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys for different passwords', async () => {
      const key1 = await deriveKey('password1', 'salt');
      const key2 = await deriveKey('password2', 'salt');
      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different keys for different salts', async () => {
      const key1 = await deriveKey('password', 'salt1');
      const key2 = await deriveKey('password', 'salt2');
      expect(key1.equals(key2)).toBe(false);
    });

    it('should respect custom key length', async () => {
      const key = await deriveKey('password', 'salt', 100000, 64);
      expect(key.length).toBe(64);
    });
  });

  describe('deriveKeySync', () => {
    it('should derive key synchronously', () => {
      const key = deriveKeySync('password', 'salt');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce consistent keys', () => {
      const key1 = deriveKeySync('password', 'salt');
      const key2 = deriveKeySync('password', 'salt');
      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate valid UUID', () => {
      const key = generateIdempotencyKey();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(key).toMatch(uuidRegex);
    });

    it('should generate unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateIdempotencyKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe('signServiceRequest', () => {
    it('should return signature with required properties', () => {
      const result = signServiceRequest('payment-service', { orderId: '123' });
      
      expect(result).toHaveProperty('serviceName', 'payment-service');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle string body', () => {
      const result = signServiceRequest('service', 'string-body');
      expect(result.signature).toHaveLength(64);
    });

    it('should handle object body', () => {
      const result = signServiceRequest('service', { key: 'value' });
      expect(result.signature).toHaveLength(64);
    });

    it('should handle empty body', () => {
      const result = signServiceRequest('service');
      expect(result.signature).toHaveLength(64);
    });

    it('should throw if SERVICE_AUTH_SECRET not configured', () => {
      delete process.env.SERVICE_AUTH_SECRET;
      delete process.env.HMAC_SECRET;
      
      expect(() => signServiceRequest('service')).toThrow('SERVICE_AUTH_SECRET not configured');
    });

    it('should use HMAC_SECRET as fallback', () => {
      delete process.env.SERVICE_AUTH_SECRET;
      process.env.HMAC_SECRET = 'fallback-secret';
      
      const result = signServiceRequest('service');
      expect(result.signature).toHaveLength(64);
    });
  });

  describe('verifyServiceRequest', () => {
    it('should verify valid signature', () => {
      const { signature, timestamp, serviceName } = signServiceRequest('test-service', { data: 'test' });
      
      const result = verifyServiceRequest(signature, serviceName, timestamp, { data: 'test' });
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const result = verifyServiceRequest(
        'invalid-signature',
        'test-service',
        Date.now().toString(),
        { data: 'test' }
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject expired timestamp', () => {
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      const payload = `test-service:${oldTimestamp}:{"data":"test"}`;
      const signature = generateHmac(payload, process.env.SERVICE_AUTH_SECRET!);
      
      const result = verifyServiceRequest(
        signature,
        'test-service',
        oldTimestamp,
        { data: 'test' }
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request timestamp expired or invalid');
    });

    it('should reject invalid timestamp format', () => {
      const result = verifyServiceRequest(
        'signature',
        'service',
        'not-a-number',
        {}
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request timestamp expired or invalid');
    });

    it('should handle missing SERVICE_AUTH_SECRET', () => {
      delete process.env.SERVICE_AUTH_SECRET;
      delete process.env.HMAC_SECRET;
      
      const result = verifyServiceRequest('sig', 'service', Date.now().toString(), {});
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SERVICE_AUTH_SECRET not configured');
    });

    it('should handle string body', () => {
      const { signature, timestamp, serviceName } = signServiceRequest('service', 'string-body');
      
      const result = verifyServiceRequest(signature, serviceName, timestamp, 'string-body');
      
      expect(result.valid).toBe(true);
    });

    it('should handle empty body', () => {
      const { signature, timestamp, serviceName } = signServiceRequest('service');
      
      const result = verifyServiceRequest(signature, serviceName, timestamp);
      
      expect(result.valid).toBe(true);
    });
  });
});
