// @ts-nocheck
/**
 * HMAC Integration Tests - marketplace-service
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
process.env.SERVICE_NAME = 'marketplace-service';
process.env.USE_NEW_HMAC = 'true';

// In-memory nonce store for testing
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

function toMutableHeaders(headers: ReturnType<HmacSigner['sign']>): Record<string, string | undefined> {
  return { ...headers } as Record<string, string | undefined>;
}

describe('HMAC Integration Tests - marketplace-service', () => {
  const testSecret = 'test-secret-key-must-be-32-chars-long';
  let signer: HmacSigner;
  let validator: HmacValidator;
  let mockNonceStore: MockNonceStore;

  beforeAll(() => {
    mockNonceStore = new MockNonceStore();

    signer = createHmacSigner({
      secret: testSecret,
      serviceName: 'marketplace-service',
    });

    validator = new HmacValidator(
      { secret: testSecret },
      mockNonceStore as unknown as NonceStore
    );
  });

  beforeEach(() => {
    mockNonceStore.clear();
  });

  // =========================================================================
  // OUTGOING CALLS - HMAC Headers Present
  // =========================================================================

  describe('Outgoing calls include HMAC headers', () => {
    test('should generate all required HMAC headers for GET request', () => {
      const headers = signer.sign('GET', '/api/v1/listings/active');

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('marketplace-service');
      expect(headers[HMAC_HEADER_NAMES.TIMESTAMP]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.NONCE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toHaveLength(64);
    });

    test('should generate body hash header for POST request with body', () => {
      const body = { ticketId: 'ticket-123', price: 150, sellerId: 'seller-456' };
      const headers = signer.sign('POST', '/api/v1/listings/create', body);

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('marketplace-service');
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toHaveLength(64);
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
    });

    test('should generate unique nonce for each request', () => {
      const headers1 = signer.sign('POST', '/api/v1/listings');
      const headers2 = signer.sign('POST', '/api/v1/listings');

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
      const path = '/api/v1/internal/listings/verify';
      const headers = toMutableHeaders(signer.sign(method, path));

      const result = await validator.validate(headers, method, path);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('marketplace-service');
    });

    test('should validate correctly signed POST request with body', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/purchase';
      const body = { listingId: 'listing-123', buyerId: 'buyer-456', amount: 15000 };
      const headers = toMutableHeaders(signer.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('marketplace-service');
    });

    test('should extract service name from validated request', async () => {
      const paymentServiceSigner = createHmacSigner({
        secret: testSecret,
        serviceName: 'payment-service',
      });

      const headers = toMutableHeaders(paymentServiceSigner.sign('POST', '/api/v1/internal/listings'));
      const result = await validator.validate(headers, 'POST', '/api/v1/internal/listings');

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('payment-service');
    });
  });

  // =========================================================================
  // SECURITY TESTS
  // =========================================================================

  describe('Security - Replay attack prevention', () => {
    test('should reject request with reused nonce', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/listings/secure';
      const headers = toMutableHeaders(signer.sign(method, path));

      const result1 = await validator.validate(headers, method, path);
      expect(result1.valid).toBe(true);

      const result2 = await validator.validate(headers, method, path);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('nonce');
    });
  });

  describe('Security - Invalid signature detection', () => {
    test('should reject request with tampered signature', async () => {
      const method = 'POST';
      const path = '/api/v1/internal/listings/tampered';
      const headers = toMutableHeaders(signer.sign(method, path));

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

      const headers = toMutableHeaders(wrongSigner.sign('POST', '/api/v1/internal/listings'));
      const result = await validator.validate(headers, 'POST', '/api/v1/internal/listings');

      expect(result.valid).toBe(false);
    });
  });

  describe('Security - Missing headers detection', () => {
    test('should reject request missing service header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/listings'));
      delete headers[HMAC_HEADER_NAMES.SERVICE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing signature header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/listings'));
      delete headers[HMAC_HEADER_NAMES.SIGNATURE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing timestamp header', () => {
      const headers = toMutableHeaders(signer.sign('POST', '/api/v1/internal/listings'));
      delete headers[HMAC_HEADER_NAMES.TIMESTAMP];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });
  });
});
