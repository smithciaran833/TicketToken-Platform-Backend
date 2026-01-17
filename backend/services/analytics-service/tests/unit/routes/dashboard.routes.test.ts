/**
 * Dashboard Routes Unit Tests
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

jest.mock('../../../src/controllers/dashboard.controller', () => ({
  dashboardController: {
    getDashboards: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { dashboards: [] } });
    }),
    getDashboard: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { dashboard: { id: req.params.dashboardId } } });
    }),
    createDashboard: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { dashboard: { id: 'new-id', ...req.body } } });
    }),
    updateDashboard: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { dashboard: { id: req.params.dashboardId, ...req.body } } });
    }),
    deleteDashboard: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { message: 'Dashboard deleted' } });
    }),
    cloneDashboard: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { dashboard: { id: 'cloned-id' } } });
    }),
    shareDashboard: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { shared: true } });
    }),
    getDashboardPermissions: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { permissions: [] } });
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

import dashboardRoutes from '../../../src/routes/dashboard.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { dashboardController } from '../../../src/controllers/dashboard.controller';

describe('Dashboard Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const dashboardId = '123e4567-e89b-12d3-a456-426614174002';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(dashboardRoutes, { prefix: '/dashboards' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write', 'analytics.delete', 'analytics.share'],
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

  describe('GET /dashboards/venue/:venueId', () => {
    it('should get all dashboards for a venue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboards/venue/${venueId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(dashboardController.getDashboards).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboards/venue/${venueId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/dashboards/venue/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /dashboards/:dashboardId', () => {
    it('should get a specific dashboard', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboards/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(dashboardController.getDashboard).toHaveBeenCalled();
    });

    it('should validate dashboardId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/dashboards/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /dashboards', () => {
    const validDashboard = {
      venueId,
      name: 'Test Dashboard',
      description: 'A test dashboard',
      type: 'overview',
      isDefault: false,
      isPublic: false,
      config: { widgets: [] },
    };

    it('should create a dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/dashboards',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validDashboard,
      });

      expect(response.statusCode).toBe(201);
      expect(dashboardController.createDashboard).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/dashboards',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validDashboard,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/dashboards',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Incomplete' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate type enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/dashboards',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validDashboard,
          type: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate name length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/dashboards',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validDashboard,
          name: 'a'.repeat(101),
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /dashboards/:dashboardId', () => {
    it('should update a dashboard', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/dashboards/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          name: 'Updated Dashboard',
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(dashboardController.updateDashboard).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'PUT',
        url: `/dashboards/${dashboardId}`,
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /dashboards/:dashboardId', () => {
    it('should delete a dashboard', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/dashboards/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(dashboardController.deleteDashboard).toHaveBeenCalled();
    });

    it('should require analytics.delete permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/dashboards/${dashboardId}`,
        headers: { authorization: `Bearer ${writeToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /dashboards/:dashboardId/clone', () => {
    it('should clone a dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/clone`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          name: 'Cloned Dashboard',
          venueId,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(dashboardController.cloneDashboard).toHaveBeenCalled();
    });

    it('should require name in body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/clone`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { venueId },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /dashboards/:dashboardId/share', () => {
    it('should share a dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/share`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          userIds: ['123e4567-e89b-12d3-a456-426614174003'],
          permissions: ['view'],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(dashboardController.shareDashboard).toHaveBeenCalled();
    });

    it('should require analytics.share permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/share`,
        headers: { authorization: `Bearer ${writeToken}` },
        payload: {
          userIds: [venueId],
          permissions: ['view'],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should require at least one userIds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/share`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          userIds: [],
          permissions: ['view'],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate permission enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/dashboards/${dashboardId}/share`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          userIds: [venueId],
          permissions: ['invalid'],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /dashboards/:dashboardId/permissions', () => {
    it('should get dashboard permissions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboards/${dashboardId}/permissions`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(dashboardController.getDashboardPermissions).toHaveBeenCalled();
    });
  });
});
