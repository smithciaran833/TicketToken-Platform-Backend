/**
 * Widget Routes Unit Tests
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

jest.mock('../../../src/controllers/widget.controller', () => ({
  widgetController: {
    getWidgets: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { widgets: [] } });
    }),
    getWidget: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { widget: { id: req.params.widgetId } } });
    }),
    getWidgetData: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { data: {} } });
    }),
    createWidget: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { widget: { id: 'new-widget' } } });
    }),
    updateWidget: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { widget: {} } });
    }),
    deleteWidget: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { message: 'Widget deleted' } });
    }),
    moveWidget: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { moved: true } });
    }),
    duplicateWidget: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { widget: { id: 'duplicated-widget' } } });
    }),
    exportWidgetData: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { url: 'https://example.com/export' } });
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

import widgetRoutes from '../../../src/routes/widget.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { widgetController } from '../../../src/controllers/widget.controller';

describe('Widget Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const dashboardId = '123e4567-e89b-12d3-a456-426614174001';
  const widgetId = '123e4567-e89b-12d3-a456-426614174002';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(widgetRoutes, { prefix: '/widgets' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write', 'analytics.delete', 'analytics.export'],
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

  describe('GET /widgets/dashboard/:dashboardId', () => {
    it('should get widgets for a dashboard', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/widgets/dashboard/${dashboardId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.getWidgets).toHaveBeenCalled();
    });

    it('should validate dashboardId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/widgets/dashboard/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /widgets/:widgetId', () => {
    it('should get a specific widget', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/widgets/${widgetId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.getWidget).toHaveBeenCalled();
    });
  });

  describe('GET /widgets/:widgetId/data', () => {
    it('should get widget data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/widgets/${widgetId}/data`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.getWidgetData).toHaveBeenCalled();
    });

    it('should accept date range parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/widgets/${widgetId}/data?startDate=2024-01-01T00:00:00Z&endDate=2024-01-31T23:59:59Z`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept refresh parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/widgets/${widgetId}/data?refresh=true`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /widgets', () => {
    const validWidget = {
      dashboardId,
      type: 'chart',
      title: 'Sales Chart',
      config: { chartType: 'line' },
      position: { x: 0, y: 0 },
      size: { width: 6, height: 4 },
    };

    it('should create a widget', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/widgets',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validWidget,
      });

      expect(response.statusCode).toBe(201);
      expect(widgetController.createWidget).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/widgets',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validWidget,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/widgets',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Incomplete' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate size constraints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/widgets',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validWidget,
          size: { width: 15, height: 4 },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /widgets/:widgetId', () => {
    it('should update a widget', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/widgets/${widgetId}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: 'Updated Widget',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.updateWidget).toHaveBeenCalled();
    });
  });

  describe('DELETE /widgets/:widgetId', () => {
    it('should delete a widget', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/widgets/${widgetId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.deleteWidget).toHaveBeenCalled();
    });

    it('should require analytics.delete permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/widgets/${widgetId}`,
        headers: { authorization: `Bearer ${writeToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /widgets/:widgetId/move', () => {
    it('should move widget to another dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/move`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          targetDashboardId: dashboardId,
          position: { x: 1, y: 1 },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.moveWidget).toHaveBeenCalled();
    });

    it('should require targetDashboardId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/move`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /widgets/:widgetId/duplicate', () => {
    it('should duplicate a widget', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/duplicate`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          targetDashboardId: dashboardId,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(widgetController.duplicateWidget).toHaveBeenCalled();
    });

    it('should allow duplicate to same dashboard', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/duplicate`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('POST /widgets/:widgetId/export', () => {
    it('should export widget data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/export`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          format: 'csv',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(widgetController.exportWidgetData).toHaveBeenCalled();
    });

    it('should require analytics.export permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/export`,
        headers: { authorization: `Bearer ${writeToken}` },
        payload: { format: 'csv' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate format enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/widgets/${widgetId}/export`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          format: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
