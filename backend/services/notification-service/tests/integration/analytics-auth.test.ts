import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const buildApp = async (): Promise<FastifyInstance> => {
  const fastify = require('fastify')();
  await fastify.register(require('../../src/routes/analytics.routes').default);
  return fastify;
};

describe('Analytics Routes - Admin Only Authorization', () => {
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

  describe('GET /analytics/metrics', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/metrics'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/metrics',
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('Admin')
      });
    });

    it('should return 200 for admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/metrics',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /analytics/channels', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/channels'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/channels',
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 for admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/channels',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /analytics/hourly/:date', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/hourly/2024-01-01'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/hourly/2024-01-01',
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 for admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/hourly/2024-01-01',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /analytics/top-types', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/top-types'
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/top-types',
        headers: {
          authorization: `Bearer ${userToken}`
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 for admin users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/analytics/top-types',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
