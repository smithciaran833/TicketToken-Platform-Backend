import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { insightsController } from '../controllers/insights.controller';
import { customerInsightsController } from '../controllers/customer-insights.controller';

const getInsightsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      type: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      actionable: { type: 'boolean' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const customerInsightSchema = {
  params: {
    type: 'object',
    required: ['venueId', 'customerId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 }
    }
  }
} as const;

const insightParamsSchema = {
  params: {
    type: 'object',
    required: ['insightId'],
    properties: {
      insightId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const dismissInsightSchema = {
  params: {
    type: 'object',
    required: ['insightId'],
    properties: {
      insightId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string' }
    }
  }
} as const;

const takeActionSchema = {
  params: {
    type: 'object',
    required: ['insightId'],
    properties: {
      insightId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string', minLength: 1 },
      parameters: { type: 'object' }
    }
  }
} as const;

const venueParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

export default async function insightsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // ============================================
  // EXISTING AI INSIGHTS ROUTES
  // ============================================

  // Get insights for a venue
  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getInsightsSchema,
    handler: insightsController.getInsights
  });

  // Get customer insights
  app.get('/venue/:venueId/customers/:customerId', {
    preHandler: [authorize(['analytics.read'])],
    schema: customerInsightSchema,
    handler: insightsController.getCustomerInsights
  });

  // Get a specific insight
  app.get('/:insightId', {
    preHandler: [authorize(['analytics.read'])],
    schema: insightParamsSchema,
    handler: insightsController.getInsight
  });

  // Dismiss an insight
  app.post('/:insightId/dismiss', {
    preHandler: [authorize(['analytics.write'])],
    schema: dismissInsightSchema,
    handler: insightsController.dismissInsight
  });

  // Take action on an insight
  app.post('/:insightId/action', {
    preHandler: [authorize(['analytics.write'])],
    schema: takeActionSchema,
    handler: insightsController.takeAction
  });

  // Get insight statistics
  app.get('/venue/:venueId/stats', {
    preHandler: [authorize(['analytics.read'])],
    schema: venueParamsSchema,
    handler: insightsController.getInsightStats
  });

  // Refresh insights
  app.post('/venue/:venueId/refresh', {
    preHandler: [authorize(['analytics.write'])],
    schema: venueParamsSchema,
    handler: insightsController.refreshInsights
  });

  // ============================================
  // NEW CUSTOMER INSIGHTS ROUTES (Problem 3)
  // ============================================

  // Get customer profile
  app.get('/customers/:userId/profile', {
    preHandler: [authorize(['analytics.read'])],
    handler: async (request, reply) =>
      customerInsightsController.getCustomerProfile(request, reply)
  });

  // Get customer event preferences
  app.get('/customers/:userId/preferences', {
    preHandler: [authorize(['analytics.read'])],
    handler: async (request, reply) =>
      customerInsightsController.getCustomerPreferences(request, reply)
  });

  // Get venue customer segments
  app.get('/venue/:venueId/customer-segments', {
    preHandler: [authorize(['analytics.read'])],
    handler: async (request, reply) =>
      customerInsightsController.getVenueCustomerSegments(request, reply)
  });

  // Get venue customer list with filters
  app.get('/venue/:venueId/customer-list', {
    preHandler: [authorize(['analytics.read'])],
    handler: async (request, reply) =>
      customerInsightsController.getVenueCustomerList(request, reply)
  });

  // Get cohort analysis
  app.get('/venue/:venueId/cohort-analysis', {
    preHandler: [authorize(['analytics.read'])],
    handler: async (request, reply) =>
      customerInsightsController.getCohortAnalysis(request, reply)
  });
}
