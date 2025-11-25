import { FastifyInstance } from 'fastify';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

// JSON Schema definitions for validation
const dateRangeSchema = {
  querystring: {
    type: 'object',
    required: ['startDate', 'endDate'],
    properties: {
      startDate: {
        type: 'string',
        format: 'date-time',
        description: 'Start date in ISO 8601 format'
      },
      endDate: {
        type: 'string',
        format: 'date-time',
        description: 'End date in ISO 8601 format'
      }
    }
  }
} as const;

const projectionSchema = {
  querystring: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        description: 'Number of days to project'
      }
    }
  }
} as const;

const churnRiskSchema = {
  querystring: {
    type: 'object',
    properties: {
      threshold: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        description: 'Threshold in days for churn risk'
      }
    }
  }
} as const;

const salesMetricsSchema = {
  querystring: {
    type: 'object',
    required: ['startDate', 'endDate'],
    properties: {
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      granularity: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month'],
        description: 'Time granularity for metrics'
      }
    }
  }
} as const;

const topEventsSchema = {
  querystring: {
    type: 'object',
    required: ['startDate', 'endDate'],
    properties: {
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Number of top events to return'
      }
    }
  }
} as const;

const customQuerySchema = {
  body: {
    type: 'object',
    required: ['metrics', 'timeRange'],
    properties: {
      metrics: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'string',
          enum: ['revenue', 'ticketSales', 'conversionRate', 'customerMetrics', 'topEvents', 'salesTrends']
        }
      },
      timeRange: {
        type: 'object',
        required: ['start', 'end'],
        properties: {
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          granularity: {
            type: 'string',
            enum: ['hour', 'day', 'week', 'month']
          }
        }
      },
      filters: {
        type: 'object',
        additionalProperties: true
      },
      groupBy: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
} as const;

const dashboardSchema = {
  querystring: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['24h', '7d', '30d', '90d'],
        default: '7d',
        description: 'Time period for dashboard data'
      }
    }
  }
} as const;

export default async function analyticsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  app.addHook('onRequest', authenticate);

  // Revenue endpoints
  app.get('/revenue/summary', {
    preHandler: [authorize(['analytics.read'])],
    schema: dateRangeSchema,
    handler: analyticsController.getRevenueSummary
  });

  app.get('/revenue/by-channel', {
    preHandler: [authorize(['analytics.read'])],
    schema: dateRangeSchema,
    handler: analyticsController.getRevenueByChannel
  });

  app.get('/revenue/projections', {
    preHandler: [authorize(['analytics.read'])],
    schema: projectionSchema,
    handler: analyticsController.getRevenueProjections
  });

  // Customer analytics endpoints
  app.get('/customers/lifetime-value', {
    preHandler: [authorize(['analytics.read'])],
    handler: analyticsController.getCustomerLifetimeValue
  });

  app.get('/customers/segments', {
    preHandler: [authorize(['analytics.read'])],
    handler: analyticsController.getCustomerSegments
  });

  app.get('/customers/churn-risk', {
    preHandler: [authorize(['analytics.read'])],
    schema: churnRiskSchema,
    handler: analyticsController.getChurnRiskAnalysis
  });

  // Sales metrics endpoints
  app.get('/sales/metrics', {
    preHandler: [authorize(['analytics.read'])],
    schema: salesMetricsSchema,
    handler: analyticsController.getSalesMetrics
  });

  app.get('/sales/trends', {
    preHandler: [authorize(['analytics.read'])],
    schema: dateRangeSchema,
    handler: analyticsController.getSalesTrends
  });

  // Event performance endpoints
  app.get('/events/performance', {
    preHandler: [authorize(['analytics.read'])],
    schema: dateRangeSchema,
    handler: analyticsController.getEventPerformance
  });

  app.get('/events/top-performing', {
    preHandler: [authorize(['analytics.read'])],
    schema: topEventsSchema,
    handler: analyticsController.getTopPerformingEvents
  });

  // Real-time metrics endpoint
  app.get('/realtime/summary', {
    preHandler: [authorize(['analytics.read'])],
    handler: analyticsController.getRealtimeSummary
  });

  // Conversion metrics
  app.get('/conversions/funnel', {
    preHandler: [authorize(['analytics.read'])],
    schema: dateRangeSchema,
    handler: analyticsController.getConversionFunnel
  });

  // Custom query endpoint for complex analytics
  app.post('/query', {
    preHandler: [authorize(['analytics.read', 'analytics.write'])],
    schema: customQuerySchema,
    handler: analyticsController.executeCustomQuery
  });

  // Dashboard endpoint - aggregates multiple metrics
  app.get('/dashboard', {
    preHandler: [authorize(['analytics.read'])],
    schema: dashboardSchema,
    handler: analyticsController.getDashboardData
  });
}
