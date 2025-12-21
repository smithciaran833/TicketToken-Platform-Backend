"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = customerRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const customer_controller_1 = require("../controllers/customer.controller");
const venueParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    }
};
const customerParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId', 'customerId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', minLength: 1 }
        }
    }
};
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
};
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
};
const segmentAnalysisSchema = {
    params: {
        type: 'object',
        required: ['venueId', 'segment'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            segment: { type: 'string', minLength: 1 }
        }
    }
};
async function customerRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId/segments', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: venueParamsSchema,
        handler: customer_controller_1.customerController.getCustomerSegments
    });
    app.get('/venue/:venueId/:customerId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: customerParamsSchema,
        handler: customer_controller_1.customerController.getCustomerProfile
    });
    app.get('/venue/:venueId/:customerId/insights', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: customerParamsSchema,
        handler: customer_controller_1.customerController.getCustomerInsights
    });
    app.get('/venue/:venueId/:customerId/journey', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: journeySchema,
        handler: customer_controller_1.customerController.getCustomerJourney
    });
    app.get('/venue/:venueId/:customerId/rfm', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: customerParamsSchema,
        handler: customer_controller_1.customerController.getRFMAnalysis
    });
    app.get('/venue/:venueId/:customerId/clv', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: customerParamsSchema,
        handler: customer_controller_1.customerController.getCustomerLifetimeValue
    });
    app.get('/venue/:venueId/search', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: searchSchema,
        handler: customer_controller_1.customerController.searchCustomers
    });
    app.get('/venue/:venueId/segments/:segment/analysis', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: segmentAnalysisSchema,
        handler: customer_controller_1.customerController.getSegmentAnalysis
    });
}
//# sourceMappingURL=customer.routes.js.map