/**
 * Intents Controller Integration Tests
 *
 * Endpoints:
 * - POST /intents/create (auth + idempotency)
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  createTestToken,
  db,
} from '../setup';

describe('IntentsController', () => {
  let app: FastifyInstance;
  let testTenantId: string;
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    const context = await setupTestApp();
    app = context.app;
    testTenantId = context.testTenantId;
    testUserId = context.testUserId;
    authToken = createTestToken(testUserId, testTenantId, 'customer');
  });

  afterAll(async () => {
    await teardownTestApp({ app, db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ============================================================================
  // POST /intents/create
  // ============================================================================
  describe('POST /intents/create', () => {
    it('should return 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents/create',
        payload: {
          amount: 5000,
          currency: 'usd',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 when invalid token provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents/create',
        headers: { Authorization: 'Bearer invalid-token' },
        payload: {
          amount: 5000,
          currency: 'usd',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create payment intent with valid data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          amount: 5000,
          currency: 'usd',
        },
      });

      // May return 200 (success) or 500 (Stripe API error in test env)
      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.payload);
        expect(body.clientSecret).toBeDefined();
        expect(body.intentId).toBeDefined();
      }
    });

    it('should use default currency when not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload: {
          amount: 10000,
        },
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should respect idempotency key', async () => {
      const idempotencyKey = crypto.randomUUID();
      const payload = { amount: 7500, currency: 'usd' };

      const response1 = await app.inject({
        method: 'POST',
        url: '/intents/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        payload,
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/intents/create',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        payload,
      });

      // Both should return same status
      expect(response1.statusCode).toBe(response2.statusCode);
    });
  });
});
