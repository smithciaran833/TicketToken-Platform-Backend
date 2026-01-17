/**
 * Reports Routes Unit Tests
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

jest.mock('../../../src/controllers/reports.controller', () => ({
  reportsController: {
    getReportTemplates: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { templates: [] } });
    }),
    getReports: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { reports: [] } });
    }),
    getReport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { report: { id: req.params.reportId } } });
    }),
    generateReport: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { report: { id: 'new-report' } } });
    }),
    scheduleReport: jest.fn(async (req, reply) => {
      return reply.status(201).send({ success: true, data: { schedule: { id: 'new-schedule' } } });
    }),
    updateReportSchedule: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { schedule: {} } });
    }),
    deleteReport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { message: 'Report deleted' } });
    }),
    getScheduledReports: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { schedules: [] } });
    }),
    toggleScheduledReport: jest.fn(async (req, reply) => {
      return reply.send({ success: true, data: { schedule: {} } });
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

import reportsRoutes from '../../../src/routes/reports.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { reportsController } from '../../../src/controllers/reports.controller';

describe('Reports Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const venueId = '123e4567-e89b-12d3-a456-426614174001';
  const reportId = '123e4567-e89b-12d3-a456-426614174002';
  const templateId = '123e4567-e89b-12d3-a456-426614174003';

  beforeAll(async () => {
    app = Fastify();
    
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    await app.register(reportsRoutes, { prefix: '/reports' });
    await app.ready();

    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write', 'analytics.delete'],
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

  describe('GET /reports/templates', () => {
    it('should get report templates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/templates',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.getReportTemplates).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/templates',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /reports/venue/:venueId', () => {
    it('should get reports for a venue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/reports/venue/${venueId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.getReports).toHaveBeenCalled();
    });

    it('should accept query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/reports/venue/${venueId}?type=sales&page=1&limit=20`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate venueId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/venue/invalid-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /reports/:reportId', () => {
    it('should get a specific report', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.getReport).toHaveBeenCalled();
    });
  });

  describe('POST /reports/generate', () => {
    const validReport = {
      venueId,
      templateId,
      name: 'Monthly Sales Report',
      parameters: { startDate: '2024-01-01', endDate: '2024-01-31' },
      format: 'pdf',
    };

    it('should generate a report', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/generate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validReport,
      });

      expect(response.statusCode).toBe(201);
      expect(reportsController.generateReport).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/reports/generate',
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: validReport,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/generate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { name: 'Incomplete' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate format enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/generate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validReport,
          format: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /reports/schedule', () => {
    const validSchedule = {
      venueId,
      templateId,
      name: 'Weekly Sales Report',
      schedule: {
        frequency: 'weekly',
        time: '09:00',
      },
      recipients: [{ email: 'admin@example.com' }],
    };

    it('should schedule a report', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/schedule',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validSchedule,
      });

      expect(response.statusCode).toBe(201);
      expect(reportsController.scheduleReport).toHaveBeenCalled();
    });

    it('should validate frequency enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/schedule',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validSchedule,
          schedule: {
            frequency: 'invalid',
            time: '09:00',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate time format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/schedule',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validSchedule,
          schedule: {
            frequency: 'daily',
            time: '25:00',
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require at least one recipient', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/reports/schedule',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          ...validSchedule,
          recipients: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /reports/:reportId/schedule', () => {
    it('should update report schedule', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/reports/${reportId}/schedule`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          schedule: { frequency: 'daily', time: '10:00' },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.updateReportSchedule).toHaveBeenCalled();
    });
  });

  describe('DELETE /reports/:reportId', () => {
    it('should delete a report', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.deleteReport).toHaveBeenCalled();
    });

    it('should require analytics.delete permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${writeToken}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /reports/venue/:venueId/scheduled', () => {
    it('should get scheduled reports', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/reports/venue/${venueId}/scheduled`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.getScheduledReports).toHaveBeenCalled();
    });
  });

  describe('POST /reports/:reportId/schedule/:action', () => {
    it('should pause scheduled report', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/reports/${reportId}/schedule/pause`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(reportsController.toggleScheduledReport).toHaveBeenCalled();
    });

    it('should resume scheduled report', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/reports/${reportId}/schedule/resume`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate action enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/reports/${reportId}/schedule/invalid`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
