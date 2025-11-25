import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as venueAnalytics from '../controllers/venue-analytics.controller';

export default async function venueAnalyticsRoutes(app: FastifyInstance) {
  app.get('/venues/:venueId/dashboard', {
    preHandler: [authenticateFastify, tenantHook]
  }, venueAnalytics.getVenueDashboard as any);

  app.get('/venues/:venueId/analytics', {
    preHandler: [authenticateFastify, tenantHook]
  }, venueAnalytics.getVenueAnalytics as any);
}
