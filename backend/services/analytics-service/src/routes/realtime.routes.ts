import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { realtimeController } from '../controllers/realtime.controller';

const metricsSchema = {
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
      metrics: { type: 'string' }
    }
  }
} as const;

const subscribeSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['metrics'],
    properties: {
      metrics: { type: 'string' }
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

const dashboardParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId', 'dashboardId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      dashboardId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const updateCounterSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['counterType'],
    properties: {
      counterType: { type: 'string', minLength: 1 },
      increment: { type: 'integer' }
    }
  }
} as const;

const counterParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId', 'counterType'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      counterType: { type: 'string', minLength: 1 }
    }
  }
} as const;

export default async function realtimeRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get real-time metrics
  app.get('/venue/:venueId/metrics', {
    preHandler: [authorize(['analytics.read'])],
    schema: metricsSchema,
    handler: realtimeController.getRealTimeMetrics
  });

  // Subscribe to metrics (WebSocket upgrade)
  app.get('/venue/:venueId/subscribe', {
    preHandler: [authorize(['analytics.read'])],
    schema: subscribeSchema,
    handler: realtimeController.subscribeToMetrics
  });

  // Get active sessions
  app.get('/venue/:venueId/sessions', {
    preHandler: [authorize(['analytics.read'])],
    schema: venueParamsSchema,
    handler: realtimeController.getActiveSessions
  });

  // Get live dashboard stats
  app.get('/venue/:venueId/dashboard/:dashboardId', {
    preHandler: [authorize(['analytics.read'])],
    schema: dashboardParamsSchema,
    handler: realtimeController.getLiveDashboardStats
  });

  // Update counter
  app.post('/venue/:venueId/counter', {
    preHandler: [authorize(['analytics.write'])],
    schema: updateCounterSchema,
    handler: realtimeController.updateCounter
  });

  // Get counter value
  app.get('/venue/:venueId/counter/:counterType', {
    preHandler: [authorize(['analytics.read'])],
    schema: counterParamsSchema,
    handler: realtimeController.getCounter
  });
}
