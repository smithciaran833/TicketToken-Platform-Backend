/**
 * HMAC Integration Tests - notification-service
 *
 * Tests for HMAC authentication on service-to-service communication.
 */

import {
  HmacSigner,
  HmacValidator,
  createHmacSigner,
  HMAC_HEADER_NAMES,
  NonceStore,
} from '@tickettoken/shared';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.SERVICE_NAME = 'notification-service';
process.env.USE_NEW_HMAC = 'true';

// In-memory nonce store for testing (no Redis required)
class MockNonceStore {
  private usedNonces = new Set<string>();

  async isNonceUsed(nonce: string, serviceName: string): Promise<boolean> {
    const key = `${serviceName}:${nonce}`;
    if (this.usedNonces.has(key)) {
      return true;
    }
    this.usedNonces.add(key);
    return false;
  }

  clear(): void {
    this.usedNonces.clear();
  }
}

// Helper to convert HmacHeaders to mutable headers for testing
function toMutableHeaders(headers: ReturnType<HmacSigner['sign']>): Record<string, string | undefined> {
  return { ...headers } as Record<string, string | undefined>;
}

describe('HMAC Integration Tests - notification-service', () => {
  const testSecret = 'test-secret-key-must-be-32-chars-long';
  let signer: HmacSigner;
  let validator: HmacValidator;
  let mockNonceStore: MockNonceStore;

  beforeAll(() => {
    mockNonceStore = new MockNonceStore();

    signer = createHmacSigner({
      secret: testSecret,
      serviceName: 'notification-service',
    });

    // Create validator with mock nonce store
    validator = new HmacValidator(
      { secret: testSecret },
      mockNonceStore as unknown as NonceStore
    );
  });

  beforeEach(() => {
    // Clear nonces between tests
    mockNonceStore.clear();
  });

  // =========================================================================
  // OUTGOING CALLS - HMAC Headers Present
  // =========================================================================

  describe('Outgoing calls include HMAC headers', () => {
    test('should generate all required HMAC headers for GET request', () => {
      const headers = signer.sign('GET', '/api/v1/users/user-123');

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('notification-service');
      expect(headers[HMAC_HEADER_NAMES.TIMESTAMP]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.NONCE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toHaveLength(64); // SHA-256 hex
    });

    test('should generate body hash header for POST request with body', () => {
      const body = { userId: 'user-123', notification: { type: 'email', template: 'welcome' } };
      const headers = signer.sign('POST', '/api/v1/internal/send', body);

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('notification-service');
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toHaveLength(64); // SHA-256 hex
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
    });

    test('should generate unique nonce for each request', () => {
      const headers1 = signer.sign('GET', '/api/v1/events/1');
      const headers2 = signer.sign('GET', '/api/v1/events/1');

      expect(headers1[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers2[HMAC_HEADER_NAMES.NONCE]);
      expect(headers1[HMAC_HEADER_NAMES.SIGNATURE]).not.toBe(headers2[HMAC_HEADER_NAMES.SIGNATURE]);
    });
  });

  // =========================================================================
  // INCOMING CALLS - HMAC Validation
  // =========================================================================

  describe('Incoming calls validate HMAC', () => {
    test('should validate correctly signed request', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/notifications/send';
      const headers = toMutableHeaders(signer.sign(method, path));

      const result = await validator.validate(headers, method, path);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('notification-service');
    });

    test('should validate correctly signed POST request with body', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/notifications/batch';
      const body = { userIds: ['user-1', 'user-2'], template: 'reminder' };
      const headers = toMutableHeaders(signer.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('notification-service');
    });

    test('should extract service name from validated request', async () => {
      const orderServiceSigner = createHmacSigner({
        secret: testSecret,
        serviceName: 'order-service',
      });

      const headers = toMutableHeaders(orderServiceSigner.sign('POST', '/api/v1/internal/send'));
      const result = await validator.validate(headers, 'POST', '/api/v1/internal/send');

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('order-service');
    });
  });

  // =========================================================================
  // SECURITY TESTS
  // =========================================================================

  describe('Security - Replay attack prevention', () => {
    test('should reject request with reused nonce', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/notifications/secure';
      const headers = toMutableHeaders(signer.sign(method, path));

      // First request should succeed
      const result1 = await validator.validate(headers, method, path);
      expect(result1.valid).toBe(true);

      // Second request with same nonce should fail
      const result2 = await validator.validate(headers, method, path);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('nonce');
    });
  });

  describe('Security - Invalid signature detection', () => {
    test('should reject request with tampered signature', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/notifications/tampered';
      const headers = toMutableHeaders(signer.sign(method, path));

      // Tamper with signature
      headers[HMAC_HEADER_NAMES.SIGNATURE] = 'tampered-invalid-signature-that-wont-match';

      const result = await validator.validate(headers, method, path);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject request signed with wrong secret', async () => {
      const wrongSigner = createHmacSigner({
        secret: 'different-secret-wrong-key-32chars',
        serviceName: 'attacker-service',
      });

      const headers = toMutableHeaders(wrongSigner.sign('POST', '/api/v1/internal/notifications'));
      const result = await validator.validate(headers, 'POST', '/api/v1/internal/notifications');

      expect(result.valid).toBe(false);
    });
  });

  describe('Security - Missing headers detection', () => {
    test('should reject request missing service header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/send'));
      delete headers[HMAC_HEADER_NAMES.SERVICE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing signature header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/send'));
      delete headers[HMAC_HEADER_NAMES.SIGNATURE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing timestamp header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/send'));
      delete headers[HMAC_HEADER_NAMES.TIMESTAMP];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });
  });
});
