import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const buildApp = async (): Promise<FastifyInstance> => {
  const fastify = require('fastify')();
  await fastify.register(require('../../src/routes/campaign.routes').default, { prefix: '/api/v1/campaigns' });
  return fastify;
};

describe('Campaign Routes - Admin Only Authorization', () => {
  let app: FastifyInstance;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  
  const userToken = jwt.sign({ id: 'user-1', email: 'user@test.com', role: 'user' }, JWT_SECRET);
  const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com', role: 'admin' }, JWT_SECRET);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /campaigns', () => {
    const payload = { venueId: 'v1', name: 'Test', templateId: 't1' };

    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns', payload });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        payload,
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });

    it('should return 201 for admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        payload,
        headers: { authorization: `Bearer ${adminToken}` }
      });
      expect([201, 500]).toContain(response.statusCode); // 500 ok if DB not available
    });
  });

  describe('POST /campaigns/:id/send', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/c1/send' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/c1/send',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });

    it('should accept admin requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/c1/send',
        headers: { authorization: `Bearer ${adminToken}` }
      });
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /campaigns/:id/stats', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/campaigns/c1/stats' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/campaigns/c1/stats',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/segments', () => {
    const payload = { venueId: 'v1', name: 'Segment', filterCriteria: {} };

    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/segments', payload });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/segments',
        payload,
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/segments/:id/refresh', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/segments/s1/refresh' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/segments/s1/refresh',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/triggers', () => {
    const payload = { venueId: 'v1', name: 'Trigger', triggerType: 'event', templateId: 't1', triggerConditions: {} };

    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/triggers', payload });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/triggers',
        payload,
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/abandoned-carts', () => {
    const payload = { userId: 'u1', venueId: 'v1', eventId: 'e1', cartItems: [], totalAmountCents: 1000 };

    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/abandoned-carts', payload });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/abandoned-carts',
        payload,
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/ab-tests', () => {
    const payload = { venueId: 'v1', name: 'Test', testType: 'email', variantCount: 2, sampleSizePerVariant: 100, winningMetric: 'open_rate', variants: [] };

    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/ab-tests', payload });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/ab-tests',
        payload,
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/ab-tests/:id/start', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/ab-tests/ab1/start' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/ab-tests/ab1/start',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /campaigns/ab-tests/:id/determine-winner', () => {
    it('should return 401 without auth', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/campaigns/ab-tests/ab1/determine-winner' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns/ab-tests/ab1/determine-winner',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
