/**
 * HMAC Signer Unit Tests
 */

import * as crypto from 'crypto';
import { HmacSigner, createHmacSigner, signRequest, getHmacSigner } from '../../../src/hmac/signer';
import { HMAC_HEADER_NAMES } from '../../../src/hmac/types';

describe('HmacSigner', () => {
  const testSecret = 'test-secret-that-is-at-least-32-characters-long';
  const testServiceName = 'test-service';

  let signer: HmacSigner;

  beforeEach(() => {
    signer = new HmacSigner({
      secret: testSecret,
      serviceName: testServiceName,
    });
  });

  describe('createBodyHash', () => {
    it('should return empty string for null body', () => {
      const hash = signer.createBodyHash(null);
      expect(hash).toBe('');
    });

    it('should return empty string for undefined body', () => {
      const hash = signer.createBodyHash(undefined);
      expect(hash).toBe('');
    });

    it('should hash string body correctly', () => {
      const body = 'test body content';
      const hash = signer.createBodyHash(body);

      // Verify it's a valid SHA-256 hash (64 hex characters)
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify deterministic hashing
      const expectedHash = crypto.createHash('sha256').update(body).digest('hex');
      expect(hash).toBe(expectedHash);
    });

    it('should hash object body as JSON', () => {
      const body = { amount: 100, currency: 'USD' };
      const hash = signer.createBodyHash(body);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      const expectedHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
      expect(hash).toBe(expectedHash);
    });

    it('should produce different hashes for different bodies', () => {
      const hash1 = signer.createBodyHash({ a: 1 });
      const hash2 = signer.createBodyHash({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });

    it('should produce consistent hashes for same body', () => {
      const body = { test: 'data', nested: { value: 123 } };
      const hash1 = signer.createBodyHash(body);
      const hash2 = signer.createBodyHash(body);

      expect(hash1).toBe(hash2);
    });
  });

  describe('buildPayload', () => {
    it('should build payload with correct format', () => {
      const components = {
        serviceName: 'payment-service',
        timestamp: 1704067200000,
        nonce: 'abc-123-def',
        method: 'POST',
        path: '/internal/payments',
        bodyHash: 'abc123hash',
      };

      const payload = signer.buildPayload(components);

      expect(payload).toBe('payment-service:1704067200000:abc-123-def:POST:/internal/payments:abc123hash');
    });

    it('should uppercase the method', () => {
      const components = {
        serviceName: 'test',
        timestamp: 1000,
        nonce: 'nonce',
        method: 'post',
        path: '/test',
        bodyHash: '',
      };

      const payload = signer.buildPayload(components);

      expect(payload).toContain(':POST:');
    });

    it('should handle empty body hash', () => {
      const components = {
        serviceName: 'test',
        timestamp: 1000,
        nonce: 'nonce',
        method: 'GET',
        path: '/test',
        bodyHash: '',
      };

      const payload = signer.buildPayload(components);

      expect(payload).toBe('test:1000:nonce:GET:/test:');
    });
  });

  describe('generateSignature', () => {
    it('should generate valid HMAC-SHA256 signature', () => {
      const payload = 'test-service:1704067200000:nonce-123:POST:/test:bodyhash';
      const signature = signer.generateSignature(payload);

      // Verify it's a valid hex string (64 characters for SHA256)
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce deterministic signatures', () => {
      const payload = 'consistent:payload:data';
      const sig1 = signer.generateSignature(payload);
      const sig2 = signer.generateSignature(payload);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      const sig1 = signer.generateSignature('payload1');
      const sig2 = signer.generateSignature('payload2');

      expect(sig1).not.toBe(sig2);
    });

    it('should match expected HMAC output', () => {
      const payload = 'test-payload';
      const signature = signer.generateSignature(payload);

      const expected = crypto
        .createHmac('sha256', testSecret)
        .update(payload)
        .digest('hex');

      expect(signature).toBe(expected);
    });
  });

  describe('sign', () => {
    it('should return all required headers', () => {
      const headers = signer.sign('POST', '/internal/test', { data: 'test' });

      expect(headers).toHaveProperty(HMAC_HEADER_NAMES.SERVICE);
      expect(headers).toHaveProperty(HMAC_HEADER_NAMES.TIMESTAMP);
      expect(headers).toHaveProperty(HMAC_HEADER_NAMES.NONCE);
      expect(headers).toHaveProperty(HMAC_HEADER_NAMES.SIGNATURE);
      expect(headers).toHaveProperty(HMAC_HEADER_NAMES.BODY_HASH);
    });

    it('should set correct service name', () => {
      const headers = signer.sign('GET', '/test');

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe(testServiceName);
    });

    it('should set timestamp close to current time', () => {
      const before = Date.now();
      const headers = signer.sign('GET', '/test');
      const after = Date.now();

      const timestamp = parseInt(headers[HMAC_HEADER_NAMES.TIMESTAMP], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique nonces', () => {
      const headers1 = signer.sign('GET', '/test');
      const headers2 = signer.sign('GET', '/test');

      expect(headers1[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers2[HMAC_HEADER_NAMES.NONCE]);
    });

    it('should not include body hash for GET requests without body', () => {
      const headers = signer.sign('GET', '/test');

      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeUndefined();
    });

    it('should include body hash when body is provided', () => {
      const headers = signer.sign('POST', '/test', { data: 'test' });

      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate valid signature', () => {
      const body = { amount: 100 };
      const headers = signer.sign('POST', '/internal/payments', body);

      // Rebuild the payload and verify signature
      const bodyHash = signer.createBodyHash(body);
      const payload = signer.buildPayload({
        serviceName: testServiceName,
        timestamp: parseInt(headers[HMAC_HEADER_NAMES.TIMESTAMP], 10),
        nonce: headers[HMAC_HEADER_NAMES.NONCE],
        method: 'POST',
        path: '/internal/payments',
        bodyHash,
      });

      const expectedSignature = signer.generateSignature(payload);

      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBe(expectedSignature);
    });
  });

  describe('buildHeaders', () => {
    it('should include tenant and user context', () => {
      const headers = signer.buildHeaders('POST', '/test', { data: 'test' }, {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        traceId: 'trace-123',
      });

      expect(headers['X-Tenant-ID']).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(headers['X-User-ID']).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      expect(headers['X-Trace-ID']).toBe('trace-123');
      expect(headers['X-Internal-Service']).toBe('true');
      expect(headers['X-Calling-Service']).toBe(testServiceName);
    });

    it('should include HMAC headers', () => {
      const headers = signer.buildHeaders('GET', '/test', undefined, {
        tenantId: 'tenant-123',
      });

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.TIMESTAMP]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.NONCE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
    });
  });
});

describe('Factory functions', () => {
  it('createHmacSigner should create new instance', () => {
    const signer = createHmacSigner({
      secret: 'another-secret-that-is-at-least-32-chars',
      serviceName: 'custom-service',
    });

    const headers = signer.sign('GET', '/test');

    expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('custom-service');
  });

  it('getHmacSigner should return singleton', () => {
    const signer1 = getHmacSigner();
    const signer2 = getHmacSigner();

    expect(signer1).toBe(signer2);
  });

  it('signRequest should sign with default signer', () => {
    const headers = signRequest('POST', '/test', { data: 'value' });

    expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBeDefined();
    expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
  });
});
