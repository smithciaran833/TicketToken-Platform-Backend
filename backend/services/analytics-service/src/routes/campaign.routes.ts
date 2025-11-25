import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { campaignController } from '../controllers/campaign.controller';

const getCampaignsSchema = {
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
      status: { type: 'string', enum: ['draft', 'active', 'paused', 'completed'] },
      type: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const campaignParamsSchema = {
  params: {
    type: 'object',
    required: ['campaignId'],
    properties: {
      campaignId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const performanceSchema = {
  params: {
    type: 'object',
    required: ['campaignId'],
    properties: {
      campaignId: { type: 'string', format: 'uuid' }
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

const attributionSchema = {
  params: {
    type: 'object',
    required: ['campaignId'],
    properties: {
      campaignId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      model: { type: 'string', enum: ['first_touch', 'last_touch', 'linear', 'time_decay', 'data_driven'] }
    }
  }
} as const;

const channelPerformanceSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    required: ['startDate', 'endDate'],
    properties: {
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' }
    }
  }
} as const;

const trackTouchpointSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'customerId', 'channel', 'action'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', minLength: 1 },
      channel: { type: 'string', minLength: 1 },
      action: { type: 'string', minLength: 1 },
      value: { type: 'number' },
      campaign: { type: 'string' },
      metadata: { type: 'object' }
    }
  }
} as const;

export default async function campaignRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get campaigns
  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getCampaignsSchema,
    handler: campaignController.getCampaigns
  });

  // Get campaign details
  app.get('/:campaignId', {
    preHandler: [authorize(['analytics.read'])],
    schema: campaignParamsSchema,
    handler: campaignController.getCampaign
  });

  // Get campaign performance
  app.get('/:campaignId/performance', {
    preHandler: [authorize(['analytics.read'])],
    schema: performanceSchema,
    handler: campaignController.getCampaignPerformance
  });

  // Get campaign attribution
  app.get('/:campaignId/attribution', {
    preHandler: [authorize(['analytics.read'])],
    schema: attributionSchema,
    handler: campaignController.getCampaignAttribution
  });

  // Get channel performance
  app.get('/venue/:venueId/channels', {
    preHandler: [authorize(['analytics.read'])],
    schema: channelPerformanceSchema,
    handler: campaignController.getChannelPerformance
  });

  // Track touchpoint
  app.post('/touchpoint', {
    preHandler: [authorize(['analytics.write'])],
    schema: trackTouchpointSchema,
    handler: campaignController.trackTouchpoint
  });

  // Get ROI analysis
  app.get('/:campaignId/roi', {
    preHandler: [authorize(['analytics.read'])],
    schema: campaignParamsSchema,
    handler: campaignController.getCampaignROI
  });
}
