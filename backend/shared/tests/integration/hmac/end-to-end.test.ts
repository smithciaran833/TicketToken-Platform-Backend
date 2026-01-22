/**
 * HMAC End-to-End Integration Tests
 *
 * Tests the complete flow of signing requests and validating them,
 * simulating real service-to-service communication.
 */

import { HmacSigner } from '../../../src/hmac/signer';
import { HmacValidator, RequestHeaders } from '../../../src/hmac/validator';
import { NonceStore } from '../../../src/hmac/nonce-store';
import { HMAC_HEADER_NAMES, HmacHeaders } from '../../../src/hmac/types';
import { mockRedisClient } from '../../setup';

// Helper to cast HmacHeaders to RequestHeaders for testing
const asRequestHeaders = (headers: HmacHeaders | Record<string, string>): RequestHeaders =>
  headers as unknown as RequestHeaders;

describe('HMAC End-to-End Integration', () => {
  const sharedSecret = 'shared-secret-between-services-at-least-32-chars';

  let paymentSigner: HmacSigner;
  let orderSigner: HmacSigner;
  let ticketValidator: HmacValidator;
  let paymentValidator: HmacValidator;
  let nonceStore: NonceStore;

  beforeEach(() => {
    nonceStore = new NonceStore();

    // Simulate different services
    paymentSigner = new HmacSigner({
      secret: sharedSecret,
      serviceName: 'payment-service',
    });

    orderSigner = new HmacSigner({
      secret: sharedSecret,
      serviceName: 'order-service',
    });

    ticketValidator = new HmacValidator(
      { secret: sharedSecret, serviceName: 'ticket-service' },
      nonceStore
    );

    paymentValidator = new HmacValidator(
      { secret: sharedSecret, serviceName: 'payment-service' },
      nonceStore
    );

    // Reset Redis mock
    mockRedisClient.set.mockResolvedValue('OK');
  });

  describe('Cross-service communication', () => {
    it('payment-service -> ticket-service: should validate signed request', async () => {
      // Payment service signs a request to ticket service
      const requestBody = {
        ticketId: 'ticket-123',
        action: 'reserve',
        amount: 5000,
      };
      const path = '/internal/tickets/reserve';
      const method = 'POST';

      const headers = paymentSigner.sign(method, path, requestBody);

      // Ticket service validates the request
      const result = await ticketValidator.validate(asRequestHeaders(headers), method, path, requestBody);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('payment-service');
    });

    it('order-service -> payment-service: should validate signed request', async () => {
      // Order service signs a request to payment service
      const requestBody = {
        orderId: 'order-456',
        amount: 10000,
        currency: 'USD',
      };
      const path = '/internal/payments/process';
      const method = 'POST';

      const headers = orderSigner.sign(method, path, requestBody);

      // Payment service validates the request
      const result = await paymentValidator.validate(asRequestHeaders(headers), method, path, requestBody);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('order-service');
    });

    it('should identify which service made the request', async () => {
      const path = '/internal/health';
      const method = 'GET';

      // Two different services sign requests
      const paymentHeaders = paymentSigner.sign(method, path);
      const orderHeaders = orderSigner.sign(method, path);

      const paymentResult = await ticketValidator.validate(asRequestHeaders(paymentHeaders), method, path);
      const orderResult = await ticketValidator.validate(asRequestHeaders(orderHeaders), method, path);

      expect(paymentResult.serviceName).toBe('payment-service');
      expect(orderResult.serviceName).toBe('order-service');
    });
  });

  describe('Replay attack prevention', () => {
    it('should reject replayed request with same nonce', async () => {
      const body = { data: 'sensitive' };
      const path = '/internal/sensitive';
      const method = 'POST';

      const headers = paymentSigner.sign(method, path, body);

      // First request succeeds
      const result1 = await ticketValidator.validate(asRequestHeaders(headers), method, path, body);
      expect(result1.valid).toBe(true);

      // Simulate nonce being stored in Redis
      mockRedisClient.set.mockResolvedValue(null); // SETNX returns null for existing key

      // Replay attempt fails
      const result2 = await ticketValidator.validate(asRequestHeaders(headers), method, path, body);
      expect(result2.valid).toBe(false);
      expect(result2.errorCode).toBe('NONCE_REUSED');
    });

    it('should accept different requests with unique nonces', async () => {
      const path = '/internal/action';
      const method = 'POST';

      // Multiple requests with different nonces should all succeed
      const headers1 = paymentSigner.sign(method, path, { id: 1 });
      const headers2 = paymentSigner.sign(method, path, { id: 2 });
      const headers3 = paymentSigner.sign(method, path, { id: 3 });

      const result1 = await ticketValidator.validate(asRequestHeaders(headers1), method, path, { id: 1 });
      const result2 = await ticketValidator.validate(asRequestHeaders(headers2), method, path, { id: 2 });
      const result3 = await ticketValidator.validate(asRequestHeaders(headers3), method, path, { id: 3 });

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);

      // Verify nonces are unique
      expect(headers1[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers2[HMAC_HEADER_NAMES.NONCE]);
      expect(headers2[HMAC_HEADER_NAMES.NONCE]).not.toBe(headers3[HMAC_HEADER_NAMES.NONCE]);
    });
  });

  describe('Request tampering detection', () => {
    it('should reject request with modified body', async () => {
      const originalBody = { amount: 100 };
      const tamperedBody = { amount: 10000 }; // Attacker changes amount
      const path = '/internal/payments';
      const method = 'POST';

      // Sign with original body
      const headers = paymentSigner.sign(method, path, originalBody);

      // Validate with tampered body - should fail
      // Body hash mismatch is detected before signature validation
      const result = await ticketValidator.validate(asRequestHeaders(headers), method, path, tamperedBody);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('BODY_HASH_MISMATCH');
    });

    it('should reject request with modified path', async () => {
      const body = { action: 'read' };
      const originalPath = '/internal/tickets/123';
      const tamperedPath = '/internal/tickets/456'; // Different ticket
      const method = 'GET';

      // Sign with original path
      const headers = paymentSigner.sign(method, originalPath, body);

      // Validate with tampered path - should fail
      const result = await ticketValidator.validate(asRequestHeaders(headers), method, tamperedPath, body);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject request with modified method', async () => {
      const body = { data: 'test' };
      const path = '/internal/resource';

      // Sign as GET
      const headers = paymentSigner.sign('GET', path);

      // Validate as POST - should fail
      const result = await ticketValidator.validate(asRequestHeaders(headers), 'POST', path);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject request with modified timestamp', async () => {
      const body = { data: 'test' };
      const path = '/internal/resource';
      const method = 'POST';

      const headers = paymentSigner.sign(method, path, body);

      // Tamper with timestamp
      headers[HMAC_HEADER_NAMES.TIMESTAMP] = (Date.now() + 1000).toString();

      const result = await ticketValidator.validate(asRequestHeaders(headers), method, path, body);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Secret mismatch', () => {
    it('should reject request signed with different secret', async () => {
      // Attacker service with different secret
      const attackerSigner = new HmacSigner({
        secret: 'attacker-secret-that-is-32-chars-long',
        serviceName: 'attacker-service',
      });

      const body = { malicious: 'payload' };
      const path = '/internal/admin';
      const method = 'POST';

      const headers = attackerSigner.sign(method, path, body);

      // Validator uses correct secret - should reject
      const result = await ticketValidator.validate(asRequestHeaders(headers), method, path, body);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Full request flow with context', () => {
    it('should handle complete request with all headers', async () => {
      const body = {
        eventId: 'event-789',
        tickets: [
          { section: 'A', row: 1, seat: 5 },
          { section: 'A', row: 1, seat: 6 },
        ],
        totalPrice: 15000,
      };
      const path = '/internal/orders/create';
      const method = 'POST';

      // Build complete headers including tenant context
      const headers = paymentSigner.buildHeaders(method, path, body, {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        traceId: 'trace-abc-123',
      });

      // Validate HMAC portion
      const result = await ticketValidator.validate(headers as RequestHeaders, method, path, body);

      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('payment-service');

      // Verify additional context headers are present
      expect(headers['X-Tenant-ID']).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(headers['X-User-ID']).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      expect(headers['X-Trace-ID']).toBe('trace-abc-123');
      expect(headers['X-Internal-Service']).toBe('true');
      expect(headers['X-Calling-Service']).toBe('payment-service');
    });
  });
});
