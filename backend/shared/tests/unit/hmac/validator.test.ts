/**
 * HMAC Validator Unit Tests
 */

import { HmacValidator, createHmacValidator, getHmacValidator, RequestHeaders } from '../../../src/hmac/validator';
import { HmacSigner } from '../../../src/hmac/signer';
import { NonceStore } from '../../../src/hmac/nonce-store';
import { HMAC_HEADER_NAMES, HmacHeaders } from '../../../src/hmac/types';
import {
  TimestampError,
  SignatureError,
  MissingHeadersError,
  ReplayAttackError,
} from '../../../src/hmac/errors';
import { mockRedisClient, testUtils } from '../../setup';

// Helper to cast HmacHeaders to RequestHeaders for testing
const asRequestHeaders = (headers: HmacHeaders): RequestHeaders => headers as unknown as RequestHeaders;

describe('HmacValidator', () => {
  const testSecret = 'test-secret-that-is-at-least-32-characters-long';
  const testServiceName = 'test-service';

  let validator: HmacValidator;
  let signer: HmacSigner;
  let nonceStore: NonceStore;

  beforeEach(() => {
    nonceStore = new NonceStore();
    validator = new HmacValidator(
      { secret: testSecret, serviceName: testServiceName },
      nonceStore
    );
    signer = new HmacSigner({ secret: testSecret, serviceName: testServiceName });

    // Reset Redis mock to allow nonces
    mockRedisClient.set.mockResolvedValue('OK');
  });

  describe('validateTimestamp', () => {
    it('should accept timestamp within window', () => {
      const timestamp = Date.now();

      expect(() => validator.validateTimestamp(timestamp)).not.toThrow();
    });

    it('should accept timestamp at edge of window (just under 60s)', () => {
      const timestamp = Date.now() - 59000;

      expect(() => validator.validateTimestamp(timestamp)).not.toThrow();
    });

    it('should reject expired timestamp', () => {
      const timestamp = Date.now() - 120000; // 2 minutes ago

      expect(() => validator.validateTimestamp(timestamp)).toThrow(TimestampError);
    });

    it('should reject future timestamp', () => {
      const timestamp = Date.now() + 120000; // 2 minutes in future

      expect(() => validator.validateTimestamp(timestamp)).toThrow(TimestampError);
    });

    it('should include correct error details for expired timestamp', () => {
      const timestamp = Date.now() - 120000;

      try {
        validator.validateTimestamp(timestamp);
        fail('Expected TimestampError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimestampError);
        expect((error as TimestampError).code).toBe('TIMESTAMP_EXPIRED');
      }
    });

    it('should include correct error details for future timestamp', () => {
      const timestamp = Date.now() + 120000;

      try {
        validator.validateTimestamp(timestamp);
        fail('Expected TimestampError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimestampError);
        expect((error as TimestampError).code).toBe('TIMESTAMP_FUTURE');
      }
    });
  });

  describe('extractHeaders', () => {
    it('should extract all required headers', () => {
      const headers = {
        [HMAC_HEADER_NAMES.SERVICE]: 'payment-service',
        [HMAC_HEADER_NAMES.TIMESTAMP]: '1704067200000',
        [HMAC_HEADER_NAMES.NONCE]: 'test-nonce-123',
        [HMAC_HEADER_NAMES.SIGNATURE]: 'abcd1234',
        [HMAC_HEADER_NAMES.BODY_HASH]: 'hash123',
      };

      const extracted = validator.extractHeaders(headers);

      expect(extracted).not.toBeNull();
      expect(extracted!.serviceName).toBe('payment-service');
      expect(extracted!.timestamp).toBe('1704067200000');
      expect(extracted!.nonce).toBe('test-nonce-123');
      expect(extracted!.signature).toBe('abcd1234');
      expect(extracted!.bodyHash).toBe('hash123');
    });

    it('should return null when service header is missing', () => {
      const headers = {
        [HMAC_HEADER_NAMES.TIMESTAMP]: '1704067200000',
        [HMAC_HEADER_NAMES.NONCE]: 'test-nonce',
        [HMAC_HEADER_NAMES.SIGNATURE]: 'sig',
      };

      const extracted = validator.extractHeaders(headers);

      expect(extracted).toBeNull();
    });

    it('should return null when signature is missing', () => {
      const headers = {
        [HMAC_HEADER_NAMES.SERVICE]: 'test',
        [HMAC_HEADER_NAMES.TIMESTAMP]: '1704067200000',
        [HMAC_HEADER_NAMES.NONCE]: 'test-nonce',
      };

      const extracted = validator.extractHeaders(headers);

      expect(extracted).toBeNull();
    });

    it('should handle lowercase headers (standard HTTP normalization)', () => {
      // Most HTTP frameworks normalize headers to lowercase
      const headers = {
        'x-internal-service': 'test-service',
        'x-internal-timestamp': '1704067200000',
        'x-internal-nonce': 'nonce-value-here-16chars',
        'x-internal-signature': 'sig',
      };

      const extracted = validator.extractHeaders(headers);

      expect(extracted).not.toBeNull();
      expect(extracted!.serviceName).toBe('test-service');
    });
  });

  describe('timingSafeCompare', () => {
    it('should return true for matching strings', () => {
      const result = validator.timingSafeCompare('abc123', 'abc123');

      expect(result).toBe(true);
    });

    it('should return false for non-matching strings', () => {
      const result = validator.timingSafeCompare('abc123', 'def456');

      expect(result).toBe(false);
    });

    it('should return false for different length strings', () => {
      const result = validator.timingSafeCompare('short', 'muchlongerstring');

      expect(result).toBe(false);
    });

    it('should return false for empty vs non-empty', () => {
      const result = validator.timingSafeCompare('', 'nonempty');

      expect(result).toBe(false);
    });
  });

  describe('validateSignature', () => {
    it('should not throw for matching signatures', () => {
      const signature = 'abc123def456';

      expect(() =>
        validator.validateSignature(signature, signature, 'test', '/path')
      ).not.toThrow();
    });

    it('should throw SignatureError for mismatched signatures', () => {
      expect(() =>
        validator.validateSignature('expected', 'actual', 'test-service', '/test/path')
      ).toThrow(SignatureError);
    });

    it('should include service and path in error', () => {
      try {
        validator.validateSignature('a', 'b', 'payment-service', '/internal/pay');
        fail('Expected SignatureError');
      } catch (error) {
        expect(error).toBeInstanceOf(SignatureError);
        expect((error as SignatureError).serviceName).toBe('payment-service');
        expect((error as SignatureError).path).toBe('/internal/pay');
      }
    });
  });

  describe('validate', () => {
    it('should validate correctly signed request', async () => {
      const body = { amount: 100 };
      const path = '/internal/payments';
      const method = 'POST';

      // Sign the request
      const headers = signer.sign(method, path, body);

      // Validate
      const result = await validator.validate(asRequestHeaders(headers), method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe(testServiceName);
      expect(result.nonce).toBeDefined();
    });

    it('should reject request with missing headers', async () => {
      const result = await validator.validate({}, 'GET', '/test');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MISSING_HEADERS');
    });

    it('should reject request with invalid signature', async () => {
      const headers = {
        [HMAC_HEADER_NAMES.SERVICE]: testServiceName,
        [HMAC_HEADER_NAMES.TIMESTAMP]: Date.now().toString(),
        [HMAC_HEADER_NAMES.NONCE]: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        [HMAC_HEADER_NAMES.SIGNATURE]: 'invalid-signature-that-wont-match',
      };

      const result = await validator.validate(headers, 'GET', '/test');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject request with expired timestamp', async () => {
      const body = { data: 'test' };
      const headers = signer.sign('POST', '/test', body);
      // Override timestamp to be expired
      headers[HMAC_HEADER_NAMES.TIMESTAMP] = (Date.now() - 120000).toString();

      const result = await validator.validate(asRequestHeaders(headers), 'POST', '/test', body);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('TIMESTAMP_EXPIRED');
    });

    it('should reject replay attack (duplicate nonce)', async () => {
      const body = { data: 'test' };
      const path = '/test';
      const method = 'POST';
      const headers = signer.sign(method, path, body);

      // First request succeeds
      const result1 = await validator.validate(asRequestHeaders(headers), method, path, body);
      expect(result1.valid).toBe(true);

      // Mock Redis to indicate nonce already used
      mockRedisClient.set.mockResolvedValue(null);

      // Second request with same nonce fails
      const result2 = await validator.validate(asRequestHeaders(headers), method, path, body);
      expect(result2.valid).toBe(false);
      expect(result2.errorCode).toBe('NONCE_REUSED');
    });

    it('should reject request with invalid nonce format', async () => {
      const headers = {
        [HMAC_HEADER_NAMES.SERVICE]: testServiceName,
        [HMAC_HEADER_NAMES.TIMESTAMP]: Date.now().toString(),
        [HMAC_HEADER_NAMES.NONCE]: 'short', // Too short
        [HMAC_HEADER_NAMES.SIGNATURE]: 'some-signature',
      };

      const result = await validator.validate(headers, 'GET', '/test');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_NONCE');
    });

    it('should validate GET request without body', async () => {
      const path = '/internal/status';
      const method = 'GET';
      const headers = signer.sign(method, path);

      const result = await validator.validate(asRequestHeaders(headers), method, path);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('should return context for valid request', async () => {
      const body = { test: 'data' };
      const path = '/test';
      const method = 'POST';
      const headers = signer.sign(method, path, body);

      const context = await validator.validateOrThrow(asRequestHeaders(headers), method, path, body);

      expect(context.serviceName).toBe(testServiceName);
      expect(context.timestamp).toBeDefined();
      expect(context.nonce).toBeDefined();
    });

    it('should throw MissingHeadersError for missing headers', async () => {
      await expect(validator.validateOrThrow({}, 'GET', '/test')).rejects.toThrow(
        MissingHeadersError
      );
    });

    it('should throw SignatureError for invalid signature', async () => {
      const headers = {
        [HMAC_HEADER_NAMES.SERVICE]: testServiceName,
        [HMAC_HEADER_NAMES.TIMESTAMP]: Date.now().toString(),
        [HMAC_HEADER_NAMES.NONCE]: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        [HMAC_HEADER_NAMES.SIGNATURE]: 'invalid',
      };

      await expect(validator.validateOrThrow(headers, 'GET', '/test')).rejects.toThrow(
        SignatureError
      );
    });

    it('should throw ReplayAttackError for duplicate nonce', async () => {
      const headers = signer.sign('GET', '/test');

      // First call succeeds
      await validator.validateOrThrow(asRequestHeaders(headers), 'GET', '/test');

      // Mock nonce as used
      mockRedisClient.set.mockResolvedValue(null);

      // Second call throws
      await expect(validator.validateOrThrow(asRequestHeaders(headers), 'GET', '/test')).rejects.toThrow(
        ReplayAttackError
      );
    });
  });
});

describe('Factory functions', () => {
  it('createHmacValidator should create new instance', () => {
    const validator = createHmacValidator({
      secret: 'custom-secret-that-is-at-least-32-characters',
      serviceName: 'custom-service',
    });

    expect(validator).toBeInstanceOf(HmacValidator);
  });

  it('getHmacValidator should return singleton', () => {
    const v1 = getHmacValidator();
    const v2 = getHmacValidator();

    expect(v1).toBe(v2);
  });
});
