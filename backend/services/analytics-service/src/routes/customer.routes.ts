import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { customerController } from '../controllers/customer.controller';

const venueParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const customerParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId', 'customerId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 }
    }
  }
} as const;

const journeySchema = {
  params: {
    type: 'object',
    required: ['venueId', 'customerId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' }
    }
  }
} as const;

const searchSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1 },
      segment: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const segmentAnalysisSchema = {
  params: {
    type: 'object',
    required: ['venueId', 'segment'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      segment: { type: 'string', minLength: 1 }
    }
  }
} as const;

export default async function customerRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get customer segments
  app.get('/venue/:venueId/segments', {
    preHandler: [authorize(['analytics.read'])],
    schema: venueParamsSchema,
    handler: customerController.getCustomerSegments
  });

  // Get customer profile
  app.get('/venue/:venueId/:customerId', {
    preHandler: [authorize(['analytics.read'])],
    schema: customerParamsSchema,
    handler: customerController.getCustomerProfile
  });

  // Get customer insights
  app.get('/venue/:venueId/:customerId/insights', {
    preHandler: [authorize(['analytics.read'])],
    schema: customerParamsSchema,
    handler: customerController.getCustomerInsights
  });

  // Get customer journey
  app.get('/venue/:venueId/:customerId/journey', {
    preHandler: [authorize(['analytics.read'])],
    schema: journeySchema,
    handler: customerController.getCustomerJourney
  });

  // Get RFM analysis
  app.get('/venue/:venueId/:customerId/rfm', {
    preHandler: [authorize(['analytics.read'])],
    schema: customerParamsSchema,
    handler: customerController.getRFMAnalysis
  });

  // Get customer lifetime value
  app.get('/venue/:venueId/:customerId/clv', {
    preHandler: [authorize(['analytics.read'])],
    schema: customerParamsSchema,
    handler: customerController.getCustomerLifetimeValue
  });

  // Search customers
  app.get('/venue/:venueId/search', {
    preHandler: [authorize(['analytics.read'])],
    schema: searchSchema,
    handler: customerController.searchCustomers
  });

  // Get segment analysis
  app.get('/venue/:venueId/segments/:segment/analysis', {
    preHandler: [authorize(['analytics.read'])],
    schema: segmentAnalysisSchema,
    handler: customerController.getSegmentAnalysis
  });
}
