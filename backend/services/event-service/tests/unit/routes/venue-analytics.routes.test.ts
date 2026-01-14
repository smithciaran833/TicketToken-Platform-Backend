/**
 * Unit tests for venue-analytics.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import venueAnalyticsRoutes from '../../../src/routes/venue-analytics.routes';

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

jest.mock('../../../src/controllers/venue-analytics.controller', () => ({
  getVenueDashboard: jest.fn((req: any, reply: any) => reply.send({ dashboard: {} })),
  getVenueAnalytics: jest.fn((req: any, reply: any) => reply.send({ analytics: {} }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as venueAnalytics from '../../../src/controllers/venue-analytics.controller';

describe('Venue Analytics Routes', () => {
  let app: FastifyInstance;
  const venueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    app = Fastify();
    await app.register(venueAnalyticsRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /venues/:venueId/dashboard', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/venues/:venueId/dashboard');
    });

    it('should register GET /venues/:venueId/analytics', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/venues/:venueId/analytics');
    });
  });

  describe('GET /venues/:venueId/dashboard', () => {
    it('should call getVenueDashboard controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${venueId}/dashboard`
      });

      expect(response.statusCode).toBe(200);
      expect(venueAnalytics.getVenueDashboard).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'GET', url: `/venues/${venueId}/dashboard` });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'GET', url: `/venues/${venueId}/dashboard` });
      expect(tenantHook).toHaveBeenCalled();
    });
  });

  describe('GET /venues/:venueId/analytics', () => {
    it('should call getVenueAnalytics controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${venueId}/analytics`
      });

      expect(response.statusCode).toBe(200);
      expect(venueAnalytics.getVenueAnalytics).toHaveBeenCalled();
    });

    it('should accept query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/venues/${venueId}/analytics?start_date=2026-01-01&end_date=2026-12-31`
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
