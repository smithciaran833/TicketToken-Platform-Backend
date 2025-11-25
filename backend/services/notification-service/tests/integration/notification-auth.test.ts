import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const buildApp = async (): Promise<FastifyInstance> => {
  const fastify = require('fastify')();
  await fastify.register(require('../../src/routes/notification.routes').default);
  return fastify;
};

describe('Notification Routes - Authentication', () => {
  let app: FastifyInstance;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  
  const userToken = jwt.sign({ id: 'user-1', email: 'user@test.com', venueId: 'v1', role: 'user' }, JWT_SECRET);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /send', () => {
    const payload = {
      venueId: 'v1',
      recipientId: 'r1',
      recipient: { id: 'r1', email: 'test@test.com', name: 'Test' },
      channel: 'email',
      type: 'transactional',
      template: 'order-confirmation',
      priority: 'normal',
      data: {}
    };

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/send',
        payload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/send',
        payload,
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /send-batch', () => {
    const payload = {
      venueId: 'v1',
      notifications: [
        {
          recipientId: 'r1',
          recipient: { id: 'r1', email: 'test@test.com', name: 'Test' },
          channel: 'email',
          type: 'marketing',
          template: 'promotion',
          priority: 'low',
          data: {}
        }
      ]
    };

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/send-batch',
        payload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/send-batch',
        payload,
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /status/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/status/notif-123'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/status/notif-123',
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect([200, 404, 500]).toContain(response.statusCode);
    });
  });
});
