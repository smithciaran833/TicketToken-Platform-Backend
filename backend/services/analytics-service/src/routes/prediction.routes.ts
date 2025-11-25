import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { predictionController } from '../controllers/prediction.controller';

const predictDemandSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'eventId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      eventId: { type: 'string', format: 'uuid' },
      daysAhead: { type: 'integer', minimum: 1, maximum: 365 }
    }
  }
} as const;

const optimizePricingSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'eventId', 'ticketTypeId', 'currentPrice'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      eventId: { type: 'string', format: 'uuid' },
      ticketTypeId: { type: 'string', format: 'uuid' },
      currentPrice: { type: 'number' }
    }
  }
} as const;

const predictChurnSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'customerId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 }
    }
  }
} as const;

const predictCLVSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'customerId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 }
    }
  }
} as const;

const predictNoShowSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'ticketId', 'customerId', 'eventId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      ticketId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 },
      eventId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const whatIfScenarioSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'scenario'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      scenario: {
        type: 'object',
        required: ['type', 'parameters'],
        properties: {
          type: { type: 'string', enum: ['pricing', 'capacity', 'marketing'] },
          parameters: { type: 'object' }
        }
      }
    }
  }
} as const;

const modelPerformanceSchema = {
  params: {
    type: 'object',
    required: ['modelType'],
    properties: {
      modelType: { type: 'string', enum: ['demand', 'pricing', 'churn', 'clv', 'no_show'] }
    }
  }
} as const;

export default async function predictionRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Predict demand
  app.post('/demand', {
    preHandler: [authorize(['analytics.read'])],
    schema: predictDemandSchema,
    handler: predictionController.predictDemand
  });

  // Optimize pricing
  app.post('/pricing', {
    preHandler: [authorize(['analytics.read'])],
    schema: optimizePricingSchema,
    handler: predictionController.optimizePricing
  });

  // Predict churn
  app.post('/churn', {
    preHandler: [authorize(['analytics.read'])],
    schema: predictChurnSchema,
    handler: predictionController.predictChurn
  });

  // Predict customer lifetime value
  app.post('/clv', {
    preHandler: [authorize(['analytics.read'])],
    schema: predictCLVSchema,
    handler: predictionController.predictCLV
  });

  // Predict no-show
  app.post('/no-show', {
    preHandler: [authorize(['analytics.read'])],
    schema: predictNoShowSchema,
    handler: predictionController.predictNoShow
  });

  // Run what-if scenario
  app.post('/what-if', {
    preHandler: [authorize(['analytics.read'])],
    schema: whatIfScenarioSchema,
    handler: predictionController.runWhatIfScenario
  });

  // Get model performance
  app.get('/models/:modelType/performance', {
    preHandler: [authorize(['analytics.admin'])],
    schema: modelPerformanceSchema,
    handler: predictionController.getModelPerformance
  });
}
