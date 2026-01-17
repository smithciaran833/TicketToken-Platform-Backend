/**
 * Export Routes Unit Tests
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

jest.mock('../../../src/controllers/export.controller', () => ({
  exportController: {
    getExports: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { exports: [] } });
    }),
    getExportStatus: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { export: { id: req.params.exportId, status: 'completed' } } });
    }),
    createExport: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { export: { id: 'new-export' } } });
    }),
    downloadExport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { url: 'https://example.com/download' } });
    }),
    cancelExport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { cancelled: true } });
    }),
    retryExport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { retrying: true } });
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

import exportRoutes from '../../../src/routes/export.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { exportController } from '../../../src/controllers/export.controller';

describe('Export Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const exportId = '123e4567-e89b-12d3-a456-426614174002';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(exportRoutes, { prefix: '/exports' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.export'],
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

  describe('GET /exports/venue/:venueId', () => {
    it('should get export history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/venue/${venueId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(exportController.getExports).toHaveBeenCalled();
    });

    it('should accept status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/venue/${venueId}?status=completed`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate status enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/venue/${venueId}?status=invalid`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/venue/${venueId}?page=1&limit=20`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/venue/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /exports/:exportId', () => {
    it('should get export status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/${exportId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(exportController.getExportStatus).toHaveBeenCalled();
    });

    it('should validate exportId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/exports/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /exports', () => {
    const validExport = {
      venueId,
      type: 'analytics_report',
      format: 'csv',
      filters: { status: 'active' },
      dateRange: {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
      },
    };

    it('should create an export', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/exports',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validExport,
      });

      expect(response.statusCode).toBe(201);
      expect(exportController.createExport).toHaveBeenCalled();
    });

    it('should require analytics.export permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/exports',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validExport,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/exports',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { type: 'analytics_report' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate type enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/exports',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validExport,
          type: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate format enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/exports',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validExport,
          format: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /exports/:exportId/download', () => {
    it('should download export', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/exports/${exportId}/download`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(exportController.downloadExport).toHaveBeenCalled();
    });

    it('should require analytics.export permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'GET',
        url: `/exports/${exportId}/download`,
        headers: { authorization: `Bearer ${readOnlyToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /exports/:exportId/cancel', () => {
    it('should cancel an export', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/exports/${exportId}/cancel`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(exportController.cancelExport).toHaveBeenCalled();
    });
  });

  describe('POST /exports/:exportId/retry', () => {
    it('should retry a failed export', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/exports/${exportId}/retry`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(exportController.retryExport).toHaveBeenCalled();
    });
  });
});
