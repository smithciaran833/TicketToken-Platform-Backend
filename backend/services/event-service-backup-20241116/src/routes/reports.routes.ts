import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as reportAnalytics from '../controllers/report-analytics.controller';

export default async function reportsRoutes(app: FastifyInstance) {
  app.get('/reports/sales', {
    preHandler: [authenticateFastify, tenantHook]
  }, reportAnalytics.getSalesReport as any);

  app.get('/reports/venue-comparison', {
    preHandler: [authenticateFastify, tenantHook]
  }, reportAnalytics.getVenueComparisonReport as any);

  app.get('/reports/customer-insights', {
    preHandler: [authenticateFastify, tenantHook]
  }, reportAnalytics.getCustomerInsightsReport as any);
}
