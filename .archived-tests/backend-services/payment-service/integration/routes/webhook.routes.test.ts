/**
 * Webhook Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import webhookRoutes from '../../../src/routes/webhook.routes';

describe('Webhook Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(webhookRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /stripe', () => {
    it('should handle stripe webhook without signature (returns error)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/stripe',
        payload: {
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
            },
          },
        },
      });

      // Without proper Stripe signature, should fail validation
      // The exact status depends on implementation
      expect([400, 401, 500]).toContain(response.statusCode);
    });

    it('should reject invalid webhook payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/stripe',
        payload: 'invalid',
        headers: {
          'content-type': 'text/plain',
        },
      });

      expect([400, 415, 500]).toContain(response.statusCode);
    });
  });
});
