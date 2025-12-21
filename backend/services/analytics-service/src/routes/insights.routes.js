"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = insightsRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const insights_controller_1 = require("../controllers/insights.controller");
const customer_insights_controller_1 = require("../controllers/customer-insights.controller");
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
};
const customerInsightSchema = {
    params: {
        type: 'object',
        required: ['venueId', 'customerId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', minLength: 1 }
        }
    }
};
const insightParamsSchema = {
    params: {
        type: 'object',
        required: ['insightId'],
        properties: {
            insightId: { type: 'string', format: 'uuid' }
        }
    }
};
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
};
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
};
const venueParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    }
};
async function insightsRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getInsightsSchema,
        handler: insights_controller_1.insightsController.getInsights
    });
    app.get('/venue/:venueId/customers/:customerId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: customerInsightSchema,
        handler: insights_controller_1.insightsController.getCustomerInsights
    });
    app.get('/:insightId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: insightParamsSchema,
        handler: insights_controller_1.insightsController.getInsight
    });
    app.post('/:insightId/dismiss', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: dismissInsightSchema,
        handler: insights_controller_1.insightsController.dismissInsight
    });
    app.post('/:insightId/action', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: takeActionSchema,
        handler: insights_controller_1.insightsController.takeAction
    });
    app.get('/venue/:venueId/stats', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: venueParamsSchema,
        handler: insights_controller_1.insightsController.getInsightStats
    });
    app.post('/venue/:venueId/refresh', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: venueParamsSchema,
        handler: insights_controller_1.insightsController.refreshInsights
    });
    app.get('/customers/:userId/profile', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: async (request, reply) => customer_insights_controller_1.customerInsightsController.getCustomerProfile(request, reply)
    });
    app.get('/customers/:userId/preferences', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: async (request, reply) => customer_insights_controller_1.customerInsightsController.getCustomerPreferences(request, reply)
    });
    app.get('/venue/:venueId/customer-segments', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: async (request, reply) => customer_insights_controller_1.customerInsightsController.getVenueCustomerSegments(request, reply)
    });
    app.get('/venue/:venueId/customer-list', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: async (request, reply) => customer_insights_controller_1.customerInsightsController.getVenueCustomerList(request, reply)
    });
    app.get('/venue/:venueId/cohort-analysis', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: async (request, reply) => customer_insights_controller_1.customerInsightsController.getCohortAnalysis(request, reply)
    });
}
//# sourceMappingURL=insights.routes.js.map