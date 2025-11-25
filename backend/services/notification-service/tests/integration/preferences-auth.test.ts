import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Mock the app building to avoid actual server startup
const buildApp = async (): Promise<FastifyInstance> => {
  const fastify = require('fastify')();
  
  // Register routes
  await fastify.register(require('../../src/routes/preferences.routes').default, { prefix: '/api/v1/preferences' });
  
  return fastify;
};

describe('Preferences Routes - Authentication & Authorization', () => {
  let app: FastifyInstance;
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  
  // Test user tokens
  const user1Token = jwt.sign({ id: 'user-1', email: 'user1@test.com', role: 'user' }, JWT_SECRET);
  const user2Token = jwt.sign({ id: 'user-2', email: 'user2@test.com', role: 'user' }, JWT_SECRET);
  const adminToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com', role: 'admin' }, JWT_SECRET);

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /preferences/:userId', () => {
    it('should return 401 without authentication token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-1'
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('error');
    });

    it('should return 403 when accessing different user preferences', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-2',
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('not authorized')
      });
    });

    it('should return 200 when user accesses own preferences', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-1',
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 200 when admin accesses any user preferences', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-1',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('PUT /preferences/:userId', () => {
    const updateData = {
      email_enabled: true,
      sms_enabled: false,
      email_marketing: true
    };

    it('should return 401 without authentication token', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/preferences/user-1',
        payload: updateData
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when updating different user preferences', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/preferences/user-2',
        headers: {
          authorization: `Bearer ${user1Token}`
        },
        payload: updateData
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 when user updates own preferences', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/preferences/user-1',
        headers: {
          authorization: `Bearer ${user1Token}`
        },
        payload: updateData
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 200 when admin updates any user preferences', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/preferences/user-1',
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        payload: updateData
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security Logging', () => {
    it('should log unauthorized access attempts', async () => {
      // Mock logger to capture logs
      const logSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-2',
        headers: {
          authorization: `Bearer ${user1Token}`
        }
      });

      // Verify security logging occurred
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Token Expiration', () => {
    it('should return 401 with expired token', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      
      const expiredToken = jwt.sign(
        { id: 'user-1', email: 'user1@test.com', role: 'user', exp: Math.floor(past.getTime() / 1000) },
        JWT_SECRET
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/preferences/user-1',
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.error).toBeDefined();
    });
  });
});
