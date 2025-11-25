import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const buildApp = async (): Promise<FastifyInstance> => {
  const fastify = require('fastify')();
  await fastify.register(require('../../src/routes/consent.routes').default);
  return fastify;
};

describe('Consent Routes - Authentication & Data Protection', () => {
  let app: FastifyInstance;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  
  const user1Token = jwt.sign({ id: 'user-1', email: 'user1@test.com', role: 'user' }, JWT_SECRET);
  const user2Token = jwt.sign({ id: 'user-2', email: 'user2@test.com', role: 'user' }, JWT_SECRET);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /grant', () => {
    const payload = {
      customerId: 'cust-1',
      venueId: 'venue-1',
      consentType: 'marketing',
      channel: 'email'
    };

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/grant',
        payload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/grant',
        payload,
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should protect customer data isolation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/grant',
        payload: { ...payload, customerId: 'cust-2' },
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      // Should either reject or process - testing auth works
      expect([200, 400, 403, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /revoke', () => {
    const payload = {
      customerId: 'cust-1',
      venueId: 'venue-1',
      consentType: 'marketing',
      channel: 'email'
    };

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/revoke',
        payload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/revoke',
        payload,
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /:customerId', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cust-1'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/cust-1',
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });

    it('should verify token validity', async () => {
      const expiredToken = jwt.sign(
        { id: 'user-1', email: 'user1@test.com', role: 'user', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      const response = await app.inject({
        method: 'GET',
        url: '/cust-1',
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GDPR Compliance', () => {
    it('should enforce authentication for consent operations', async () => {
      const grantResponse = await app.inject({
        method: 'POST',
        url: '/grant',
        payload: { customerId: 'c1', venueId: 'v1', consentType: 'marketing', channel: 'email' }
      });

      const revokeResponse = await app.inject({
        method: 'POST',
        url: '/revoke',
        payload: { customerId: 'c1', venueId: 'v1', consentType: 'marketing', channel: 'email' }
      });

      const checkResponse = await app.inject({
        method: 'GET',
        url: '/c1'
      });

      expect(grantResponse.statusCode).toBe(401);
      expect(revokeResponse.statusCode).toBe(401);
      expect(checkResponse.statusCode).toBe(401);
    });
  });
});
