import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as venueAnalytics from '../controllers/venue-analytics.controller';

const venueIdParamSchema = {
  type: 'object',
  required: ['venueId'],
  properties: {
    venueId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const analyticsQuerySchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    granularity: { 
      type: 'string',
      enum: ['day', 'week', 'month'],
      default: 'day'
    }
  },
  additionalProperties: false
};

export default async function venueAnalyticsRoutes(app: FastifyInstance) {
  app.get('/venues/:venueId/dashboard', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: venueIdParamSchema,
      querystring: analyticsQuerySchema
    }
  }, venueAnalytics.getVenueDashboard as any);

  app.get('/venues/:venueId/analytics', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: venueIdParamSchema,
      querystring: analyticsQuerySchema
    }
  }, venueAnalytics.getVenueAnalytics as any);
}
