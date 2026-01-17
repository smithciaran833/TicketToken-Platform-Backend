/**
 * Realtime Routes Unit Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/controllers/realtime.controller', () => ({
  realtimeController: {
    getRealTimeMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { metrics: {} } });
    }),
    subscribeToMetrics: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { subscribed: true } });
    }),
    getActiveSessions: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { sessions: [] } });
    }),
    getLiveDashboardStats: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { stats: {} } });
    }),
    updateCounter: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { updated: true } });
    }),
    getCounter: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { value: 100 } });
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret-for-unit-tests-minimum-32-chars',
    },
  },
}));

import realtimeRoutes from '../../../src/routes/realtime.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { realtimeController } from '../../../src/controllers/realtime.controller';

describe('Realtime Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const dashboardId = '123e4567-e89b-12d3-a456-426614174002';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(realtimeRoutes, { prefix: '/realtime' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write'],
      },
      'test-jwt-secret-for-unit-tests-minimum-32-chars',
      {
        algorithm: 'HS256',
        issuer: 'tickettoken-test',
        audience: 'analytics-service-test',
        expiresIn: '1h',
      }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /realtime/venue/:venueId/metrics', () => {
    it('should get real-time metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/metrics`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.getRealTimeMetrics).toHaveBeenCalled();
    });

    it('should accept metrics query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/metrics?metrics=sales,visitors`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/realtime/venue/invalid-uuid/metrics',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/metrics`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /realtime/venue/:venueId/subscribe', () => {
    it('should subscribe to metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/subscribe?metrics=sales`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.subscribeToMetrics).toHaveBeenCalled();
    });

    it('should require metrics parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/subscribe`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /realtime/venue/:venueId/sessions', () => {
    it('should get active sessions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/sessions`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.getActiveSessions).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/realtime/venue/invalid-uuid/sessions',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /realtime/venue/:venueId/dashboard/:dashboardId', () => {
    it('should get live dashboard stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/dashboard/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.getLiveDashboardStats).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/invalid-uuid/dashboard/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate dashboardId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/dashboard/invalid-uuid`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /realtime/venue/:venueId/counter', () => {
    it('should update counter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/realtime/venue/${venueId}/counter`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          counterType: 'page_views',
          increment: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.updateCounter).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: `/realtime/venue/${venueId}/counter`,
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: {
          counterType: 'page_views',
          increment: 1,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/realtime/venue/${venueId}/counter`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate increment is an integer', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/realtime/venue/${venueId}/counter`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          counterType: 'page_views',
          increment: 'not-a-number',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /realtime/venue/:venueId/counter/:counterType', () => {
    it('should get counter value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/realtime/venue/${venueId}/counter/page_views`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(realtimeController.getCounter).toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/realtime/venue/invalid-uuid/counter/page_views',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
