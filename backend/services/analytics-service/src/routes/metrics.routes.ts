import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { metricsController } from '../controllers/metrics.controller';

const recordMetricSchema = {
  body: {
    type: 'object',
    required: ['metricType', 'value', 'venueId'],
    properties: {
      metricType: { type: 'string' },
      value: { type: 'number' },
      venueId: { type: 'string', format: 'uuid' },
      dimensions: { type: 'object' },
      metadata: { type: 'object' }
    }
  }
} as const;

const bulkRecordSchema = {
  body: {
    type: 'object',
    required: ['metrics'],
    properties: {
      metrics: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['metricType', 'value', 'venueId'],
          properties: {
            metricType: { type: 'string' },
            value: { type: 'number' },
            venueId: { type: 'string', format: 'uuid' }
          }
        }
      }
    }
  }
} as const;

const getMetricsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['metricType', 'startDate', 'endDate'],
    properties: {
      metricType: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      granularity: { type: 'string' }
    }
  }
} as const;

const realTimeMetricsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const metricTrendsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['metricType', 'periods', 'periodUnit'],
    properties: {
      metricType: { type: 'string' },
      periods: { type: 'integer', minimum: 1, maximum: 100 },
      periodUnit: { type: 'string', enum: ['hour', 'day', 'week', 'month'] }
    }
  }
} as const;

const compareMetricsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['metricType', 'currentStartDate', 'currentEndDate', 'previousStartDate', 'previousEndDate'],
    properties: {
      metricType: { type: 'string' },
      currentStartDate: { type: 'string', format: 'date-time' },
      currentEndDate: { type: 'string', format: 'date-time' },
      previousStartDate: { type: 'string', format: 'date-time' },
      previousEndDate: { type: 'string', format: 'date-time' }
    }
  }
} as const;

const aggregateMetricSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['metricType', 'startDate', 'endDate', 'aggregation'],
    properties: {
      metricType: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] }
    }
  }
} as const;

export default async function metricsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Record a metric
  app.post('/', {
    preHandler: [authorize(['analytics.write'])],
    schema: recordMetricSchema,
    handler: metricsController.recordMetric
  });

  // Bulk record metrics
  app.post('/bulk', {
    preHandler: [authorize(['analytics.write'])],
    schema: bulkRecordSchema,
    handler: metricsController.bulkRecordMetrics
  });

  // Get metrics
  app.get('/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getMetricsSchema,
    handler: metricsController.getMetrics
  });

  // Get real-time metrics
  app.get('/:venueId/realtime', {
    preHandler: [authorize(['analytics.read'])],
    schema: realTimeMetricsSchema,
    handler: metricsController.getRealTimeMetrics
  });

  // Get metric trends
  app.get('/:venueId/trends', {
    preHandler: [authorize(['analytics.read'])],
    schema: metricTrendsSchema,
    handler: metricsController.getMetricTrends
  });

  // Compare metrics
  app.get('/:venueId/compare', {
    preHandler: [authorize(['analytics.read'])],
    schema: compareMetricsSchema,
    handler: metricsController.compareMetrics
  });

  // Get aggregated metrics
  app.get('/:venueId/aggregate', {
    preHandler: [authorize(['analytics.read'])],
    schema: aggregateMetricSchema,
    handler: metricsController.getAggregatedMetric
  });
}
