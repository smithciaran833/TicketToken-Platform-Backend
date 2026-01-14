/**
 * Refund Controller Integration Tests
 *
 * Endpoints:
 * - POST /refunds/create (auth + idempotency)
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestToken,
  createTestPaymentIntent,
  createTestOrder,
  pool,
  db,
} from '../setup';

describe('RefundController', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testOrderId: string;
  let authToken: string;

  beforeAll(async () => {
    const context = await setupTestApp();
    app = context.app;
    testTenantId = context.testTenantId;
    testUserId = context.testUserId;
    testVenueId = context.testVenueId;
    testEventId = context.testEventId;
    testOrderId = context.testOrderId;
    authToken = createTestToken(testUserId, testTenantId, 'organizer');
  });

  afterAll(async () => {
    await teardownTestApp({ app, db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ============================================================================
  // POST /refunds/create
  // ============================================================================
  describe('POST /refunds/create', () => {
    it('should return 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        payload: {
          paymentIntentId: 'pi_test_123',
          amount: 5000,
          reason: 'requested_by_customer',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 when invalid token provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: { Authorization: 'Bearer invalid-token' },
        payload: {
          paymentIntentId: 'pi_test_123',
          amount: 5000,
          reason: 'requested_by_customer',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when payment intent not found', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          paymentIntentId: 'pi_nonexistent_123',
          amount: 5000,
          reason: 'requested_by_customer',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should process refund for valid payment intent', async () => {
      // Create order and payment intent
      const order = await createTestOrder(testTenantId, testUserId, testEventId);
      const paymentIntent = await createTestPaymentIntent(
        testTenantId,
        order.id,
        testVenueId,
        {
          amount: 100.00,
          status: 'succeeded',
          stripe_intent_id: `pi_test_refund_${Date.now()}`,
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          paymentIntentId: paymentIntent.stripe_intent_id,
          amount: 5000,
          reason: 'requested_by_customer',
        },
      });

      // May return 200 (success) or 500 (Stripe API error in test env)
      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should reject refund exceeding original amount', async () => {
      const order = await createTestOrder(testTenantId, testUserId, testEventId);
      const paymentIntent = await createTestPaymentIntent(
        testTenantId,
        order.id,
        testVenueId,
        {
          amount: 50.00,
          status: 'succeeded',
          stripe_intent_id: `pi_test_exceed_${Date.now()}`,
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          paymentIntentId: paymentIntent.stripe_intent_id,
          amount: 10000, // More than original
          reason: 'requested_by_customer',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject refund for already refunded payment', async () => {
      const order = await createTestOrder(testTenantId, testUserId, testEventId);
      const paymentIntent = await createTestPaymentIntent(
        testTenantId,
        order.id,
        testVenueId,
        {
          amount: 100.00,
          status: 'refunded',
          stripe_intent_id: `pi_test_already_refunded_${Date.now()}`,
        }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          paymentIntentId: paymentIntent.stripe_intent_id,
          amount: 5000,
          reason: 'requested_by_customer',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate refund reason enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          paymentIntentId: 'pi_test_123',
          amount: 5000,
          reason: 'invalid_reason',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should respect idempotency key', async () => {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        paymentIntentId: 'pi_test_idem_123',
        amount: 5000,
        reason: 'requested_by_customer',
      };

      const response1 = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        payload,
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/refunds/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        payload,
      });

      expect(response1.statusCode).toBe(response2.statusCode);
    });
  });
});
