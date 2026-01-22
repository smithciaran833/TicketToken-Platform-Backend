import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as reportAnalytics from '../controllers/report-analytics.controller';

const reportQuerySchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    venueId: { type: 'string', format: 'uuid' },
    eventType: { type: 'string' }
  },
  additionalProperties: false
};

const venueComparisonQuerySchema = {
  type: 'object',
  properties: {
    venueIds: { 
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      minItems: 2,
      maxItems: 10
    },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' }
  },
  additionalProperties: false
};

export default async function reportsRoutes(app: FastifyInstance) {
  app.get('/reports/sales', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      querystring: reportQuerySchema
    }
  }, reportAnalytics.getSalesReport as any);

  app.get('/reports/venue-comparison', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      querystring: venueComparisonQuerySchema
    }
  }, reportAnalytics.getVenueComparisonReport as any);

  app.get('/reports/customer-insights', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      querystring: reportQuerySchema
    }
  }, reportAnalytics.getCustomerInsightsReport as any);
}
