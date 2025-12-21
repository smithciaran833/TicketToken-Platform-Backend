"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = campaignRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const campaign_controller_1 = require("../controllers/campaign.controller");
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
};
const campaignParamsSchema = {
    params: {
        type: 'object',
        required: ['campaignId'],
        properties: {
            campaignId: { type: 'string', format: 'uuid' }
        }
    }
};
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
};
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
};
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
};
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
};
async function campaignRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getCampaignsSchema,
        handler: campaign_controller_1.campaignController.getCampaigns
    });
    app.get('/:campaignId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: campaignParamsSchema,
        handler: campaign_controller_1.campaignController.getCampaign
    });
    app.get('/:campaignId/performance', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: performanceSchema,
        handler: campaign_controller_1.campaignController.getCampaignPerformance
    });
    app.get('/:campaignId/attribution', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: attributionSchema,
        handler: campaign_controller_1.campaignController.getCampaignAttribution
    });
    app.get('/venue/:venueId/channels', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: channelPerformanceSchema,
        handler: campaign_controller_1.campaignController.getChannelPerformance
    });
    app.post('/touchpoint', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: trackTouchpointSchema,
        handler: campaign_controller_1.campaignController.trackTouchpoint
    });
    app.get('/:campaignId/roi', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: campaignParamsSchema,
        handler: campaign_controller_1.campaignController.getCampaignROI
    });
}
//# sourceMappingURL=campaign.routes.js.map