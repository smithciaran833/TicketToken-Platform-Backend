/**
 * Unit Tests for Seller Onboarding Routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import { sellerOnboardingRoutes } from '../../../src/routes/seller-onboarding.routes';

jest.mock('../../../src/controllers/seller-onboarding.controller', () => ({
  sellerOnboardingController: {
    initiateOnboarding: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ url: 'https://connect.stripe.com/...' })),
    getOnboardingStatus: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ status: 'pending' })),
    handleOAuthCallback: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ connected: true })),
    refreshOnboardingLink: jest.fn().mockImplementation(async (req: any, reply: any) => reply.send({ url: 'https://connect.stripe.com/...' })),
  },
}));

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn((req: any, reply: any, done: any) => { req.user = { id: 'user-123' }; done(); }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), child: jest.fn().mockReturnThis() },
}));

describe('Seller Onboarding Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(sellerOnboardingRoutes);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  describe('POST /onboard', () => {
    it('should initiate seller onboarding', async () => {
      const response = await fastify.inject({ method: 'POST', url: '/onboard' });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toHaveProperty('url');
    });
  });

  describe('GET /status', () => {
    it('should get onboarding status', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/status' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /oauth/callback', () => {
    it('should handle OAuth callback', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/oauth/callback?code=test-code' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /refresh-link', () => {
    it('should refresh onboarding link', async () => {
      const response = await fastify.inject({ method: 'POST', url: '/refresh-link' });
      expect(response.statusCode).toBe(200);
    });
  });
});
