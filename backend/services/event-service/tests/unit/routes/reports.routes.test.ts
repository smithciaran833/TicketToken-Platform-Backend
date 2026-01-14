/**
 * Unit tests for reports.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import reportsRoutes from '../../../src/routes/reports.routes';

jest.mock('../../../src/middleware/auth', () => ({
  authenticateFastify: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123', tenant_id: 'tenant-123' };
    done();
  })
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantHook: jest.fn((req: any, reply: any, done: any) => {
    req.tenant_id = 'tenant-123';
    done();
  })
}));

jest.mock('../../../src/controllers/report-analytics.controller', () => ({
  getSalesReport: jest.fn((req: any, reply: any) => reply.send({ report: 'sales', data: [] })),
  getVenueComparisonReport: jest.fn((req: any, reply: any) => reply.send({ report: 'comparison', data: [] })),
  getCustomerInsightsReport: jest.fn((req: any, reply: any) => reply.send({ report: 'insights', data: [] }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as reportController from '../../../src/controllers/report-analytics.controller';

describe('Reports Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(reportsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /reports/sales route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/reports/sales');
    });

    it('should register GET /reports/venue-comparison route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/reports/venue-comparison');
    });

    it('should register GET /reports/customer-insights route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/reports/customer-insights');
    });
  });

  describe('GET /reports/sales', () => {
    it('should call getSalesReport controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/sales'
      });

      expect(response.statusCode).toBe(200);
      expect(reportController.getSalesReport).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'GET', url: '/reports/sales' });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'GET', url: '/reports/sales' });
      expect(tenantHook).toHaveBeenCalled();
    });
  });

  describe('GET /reports/venue-comparison', () => {
    it('should call getVenueComparisonReport controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/venue-comparison'
      });

      expect(response.statusCode).toBe(200);
      expect(reportController.getVenueComparisonReport).toHaveBeenCalled();
    });
  });

  describe('GET /reports/customer-insights', () => {
    it('should call getCustomerInsightsReport controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reports/customer-insights'
      });

      expect(response.statusCode).toBe(200);
      expect(reportController.getCustomerInsightsReport).toHaveBeenCalled();
    });
  });
});
