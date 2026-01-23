// @ts-nocheck
/**
 * HMAC Integration Tests - notification-service
 *
 * Tests for HMAC authentication on service-to-service communication.
 * notification-service receives internal calls from various services
 * (ticket-service, order-service, event-service, payment-service, etc.)
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
  let ticketServiceSigner: HmacSigner;
  let orderServiceSigner: HmacSigner;
  let paymentServiceSigner: HmacSigner;
  let validator: HmacValidator;
  let mockNonceStore: MockNonceStore;

  beforeAll(() => {
    mockNonceStore = new MockNonceStore();

    // Create signers for services that call notification-service
    ticketServiceSigner = createHmacSigner({
      secret: testSecret,
      serviceName: 'ticket-service',
    });

    orderServiceSigner = createHmacSigner({
      secret: testSecret,
      serviceName: 'order-service',
    });

    paymentServiceSigner = createHmacSigner({
      secret: testSecret,
      serviceName: 'payment-service',
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
  // OUTGOING CALLS - Headers Generation
  // =========================================================================

  describe('Outgoing calls include HMAC headers', () => {
    test('should generate all required HMAC headers for GET request', () => {
      const signer = createHmacSigner({
        secret: testSecret,
        serviceName: 'notification-service',
      });
      const headers = signer.sign('GET', '/api/v1/notifications/status');

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('notification-service');
      expect(headers[HMAC_HEADER_NAMES.TIMESTAMP]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.NONCE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toHaveLength(64); // SHA-256 hex
    });

    test('should generate body hash header for POST request with body', () => {
      const signer = createHmacSigner({
        secret: testSecret,
        serviceName: 'notification-service',
      });
      const body = {
        userId: 'user-123',
        type: 'ORDER_CONFIRMATION',
        data: { orderId: 'order-456' }
      };
      const headers = signer.sign('POST', '/api/v1/notifications/send', body);

      expect(headers[HMAC_HEADER_NAMES.SERVICE]).toBe('notification-service');
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toBeDefined();
      expect(headers[HMAC_HEADER_NAMES.BODY_HASH]).toHaveLength(64); // SHA-256 hex
      expect(headers[HMAC_HEADER_NAMES.SIGNATURE]).toBeDefined();
    });

    test('should generate unique nonce for each request', () => {
      const signer = createHmacSigner({
        secret: testSecret,
        serviceName: 'notification-service',
      });
      const headers1 = signer.sign('POST', '/api/v1/notifications');
      const headers2 = signer.sign('POST', '/api/v1/notifications');

      expect(headers1[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers2[HMAC_HEADER_NAMES.NONCE]);
      expect(headers1[HMAC_HEADER_NAMES.SIGNATURE]).not.toBe(headers2[HMAC_HEADER_NAMES.SIGNATURE]);
    });
  });

  // =========================================================================
  // INCOMING CALLS - HMAC Validation
  // Primary focus: notification-service receives calls from ticket, order, payment services
  // =========================================================================

  describe('Incoming calls validate HMAC', () => {
    test('should validate request from ticket-service', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/ticket-issued';
      const body = { ticketId: 'ticket-123', userId: 'user-456' };
      const headers = toMutableHeaders(ticketServiceSigner.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('ticket-service');
    });

    test('should validate request from order-service', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/order-confirmed';
      const body = { orderId: 'order-123', userId: 'user-456' };
      const headers = toMutableHeaders(orderServiceSigner.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('order-service');
    });

    test('should validate request from payment-service', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/payment-received';
      const body = { paymentId: 'pay-123', amount: 5000, currency: 'USD' };
      const headers = toMutableHeaders(paymentServiceSigner.sign(method, path, body));

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('payment-service');
    });

    test('should extract correct service name from different services', async () => {
      const eventServiceSigner = createHmacSigner({
        secret: testSecret,
        serviceName: 'event-service',
      });

      const body = { eventId: 'event-123', reminder: true };
      const headers = toMutableHeaders(eventServiceSigner.sign('POST', '/api/v1/notifications/event-reminder', body));
      const result = await validator.validate(headers, 'POST', '/api/v1/notifications/event-reminder', body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('event-service');
    });
  });

  // =========================================================================
  // SECURITY TESTS
  // =========================================================================

  describe('Security - Replay attack prevention', () => {
    test('should reject request with reused nonce', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/send';
      const body = { userId: 'user-123', message: 'test' };
      const headers = toMutableHeaders(ticketServiceSigner.sign(method, path, body));

      // First request should succeed
      const result1 = await validator.validate(headers, method, path, body);
      expect(result1.valid).toBe(true);

      // Second request with same nonce should fail
      const result2 = await validator.validate(headers, method, path, body);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('nonce');
    });
  });

  describe('Security - Invalid signature detection', () => {
    test('should reject request with tampered signature', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/tampered';
      const body = { userId: 'user-123' };
      const headers = toMutableHeaders(ticketServiceSigner.sign(method, path, body));

      // Tamper with signature
      headers[HMAC_HEADER_NAMES.SIGNATURE] = 'tampered-invalid-signature-that-wont-match';

      const result = await validator.validate(headers, method, path, body);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject request signed with wrong secret', async () => {
      const wrongSigner = createHmacSigner({
        secret: 'different-secret-wrong-key-32chars',
        serviceName: 'attacker-service',
      });

      const body = { malicious: 'data' };
      const headers = toMutableHeaders(wrongSigner.sign('POST', '/api/v1/notifications', body));
      const result = await validator.validate(headers, 'POST', '/api/v1/notifications', body);

      expect(result.valid).toBe(false);
    });

    test('should reject request with modified body', async () => {
      const method = 'POST';
      const path = '/api/v1/notifications/send';
      const originalBody = { userId: 'user-123', amount: 100 };
      const modifiedBody = { userId: 'user-123', amount: 99999 };
      const headers = toMutableHeaders(orderServiceSigner.sign(method, path, originalBody));

      // Try to use signature for different body
      const result = await validator.validate(headers, method, path, modifiedBody);

      expect(result.valid).toBe(false);
    });
  });

  describe('Security - Missing headers detection', () => {
    test('should reject request missing service header', () => {
      const body = { test: 'data' };
      const headers = toMutableHeaders(ticketServiceSigner.sign('POST', '/api/v1/notifications', body));
      delete headers[HMAC_HEADER_NAMES.SERVICE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing signature header', () => {
      const body = { test: 'data' };
      const headers = toMutableHeaders(ticketServiceSigner.sign('POST', '/api/v1/notifications', body));
      delete headers[HMAC_HEADER_NAMES.SIGNATURE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing timestamp header', () => {
      const body = { test: 'data' };
      const headers = toMutableHeaders(ticketServiceSigner.sign('POST', '/api/v1/notifications', body));
      delete headers[HMAC_HEADER_NAMES.TIMESTAMP];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });

    test('should reject request missing nonce header', () => {
      const body = { test: 'data' };
      const headers = toMutableHeaders(ticketServiceSigner.sign('POST', '/api/v1/notifications', body));
      delete headers[HMAC_HEADER_NAMES.NONCE];

      const extracted = validator.extractHeaders(headers);
      expect(extracted).toBeNull();
    });
  });
});
