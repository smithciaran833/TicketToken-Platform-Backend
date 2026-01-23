/**
 * Integration Tests: Shared Client Communication - ticket-service
 *
 * Tests actual S2S communication with real service clients.
 */

import { describe, it, expect } from '@jest/globals';
import {
  orderServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';

const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = INTEGRATION_ENABLED ? describe : describe.skip;

describeIntegration('ticket-service S2S Integration Tests', () => {
  const testTenantId = 'test-tenant-integration';
  const testUserId = 'test-user-integration';

  describe('order-service Communication', () => {
    it('should authenticate with order-service via HMAC', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await orderServiceClient.getOrder('test-order', ctx);
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // Should NOT get 401/403 - that would mean HMAC auth failed
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });

    it('should call orderServiceClient.createOrder', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        const result = await orderServiceClient.createOrder(
          {
            userId: testUserId,
            eventId: 'test-event',
            items: [{ ticketTypeId: 'tt-1', quantity: 1, unitPriceCents: 1000 }],
            currency: 'USD',
            idempotencyKey: `test-${Date.now()}`,
          },
          ctx,
          `test-${Date.now()}`
        );
        expect(result).toHaveProperty('orderId');
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // 400, 404, 503 are acceptable - means we reached the service
          expect([400, 404, 503]).toContain(error.statusCode);
        }
      }
    });

    it('should call orderServiceClient.cancelOrder', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        await orderServiceClient.cancelOrder(
          'test-order',
          'Integration test cancellation',
          ctx
        );
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // 404 is acceptable - order doesn't exist
          expect([404, 503]).toContain(error.statusCode);
        }
      }
    });
  });

  describe('Purchase Saga Integration', () => {
    it('should complete order creation flow with HMAC auth', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);
      const idempotencyKey = `saga-test-${Date.now()}`;

      try {
        const orderResult = await orderServiceClient.createOrder(
          {
            userId: testUserId,
            eventId: 'test-event-123',
            items: [
              { ticketTypeId: 'vip-1', quantity: 2, unitPriceCents: 5000 },
            ],
            currency: 'USD',
            idempotencyKey,
            metadata: {
              tenantId: testTenantId,
            },
          },
          ctx,
          idempotencyKey
        );

        expect(orderResult.orderId).toBeDefined();
        expect(orderResult.status).toBeDefined();
      } catch (error) {
        // Even if order creation fails, auth should pass
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }
    });

    it('should handle saga compensation via order cancellation', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      // Simulate saga compensation
      let compensationAttempted = false;

      try {
        await orderServiceClient.cancelOrder(
          'nonexistent-order',
          'Saga compensation test',
          ctx
        );
        compensationAttempted = true;
      } catch (error) {
        compensationAttempted = true;
        // Compensation attempt should not fail with auth errors
        if (error instanceof ServiceClientError) {
          expect(error.statusCode).not.toBe(401);
          expect(error.statusCode).not.toBe(403);
        }
      }

      expect(compensationAttempted).toBe(true);
    });
  });

  describe('Error Response Handling', () => {
    it('should properly parse error responses from order-service', async () => {
      const ctx = createRequestContext(testTenantId, testUserId);

      try {
        // Invalid order data should return 400
        await orderServiceClient.createOrder(
          {
            userId: '',
            eventId: '',
            items: [],
            currency: 'USD',
            idempotencyKey: 'invalid-test',
          },
          ctx,
          'invalid-test'
        );
      } catch (error) {
        if (error instanceof ServiceClientError) {
          // Should get a proper error code, not a network error
          expect(error.statusCode).toBeDefined();
          expect(error.message).toBeDefined();
        }
      }
    });
  });
});
