/**
 * Unit Tests for Webhook Routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import webhookRoutes from '../../../src/routes/webhook.routes';

jest.mock('../../../src/controllers/webhook.controller', () => ({
  webhookController: {
    handleStripeWebhook: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ received: true })),
    handleStripeConnectWebhook: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ received: true })),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnThis() },
}));

describe('Webhook Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify({ bodyLimit: 1048576 });
    await fastify.register(webhookRoutes);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  describe('POST /stripe', () => {
    it('should handle Stripe payment webhook', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/stripe',
        payload: JSON.stringify({ type: 'payment_intent.succeeded' }),
        headers: { 'stripe-signature': 'test-signature', 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should handle payment_intent.payment_failed event', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/stripe',
        payload: JSON.stringify({ type: 'payment_intent.payment_failed' }),
        headers: { 'stripe-signature': 'test-signature', 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should handle charge.refunded event', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/stripe',
        payload: JSON.stringify({ type: 'charge.refunded' }),
        headers: { 'stripe-signature': 'test-signature', 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /stripe/connect', () => {
    it('should handle Stripe Connect webhook', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/stripe/connect',
        payload: JSON.stringify({ type: 'account.updated' }),
        headers: { 'stripe-signature': 'test-signature', 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should handle account.application.deauthorized event', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/stripe/connect',
        payload: JSON.stringify({ type: 'account.application.deauthorized' }),
        headers: { 'stripe-signature': 'test-signature', 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
