"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = predictionRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const prediction_controller_1 = require("../controllers/prediction.controller");
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
};
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
};
const predictChurnSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'customerId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', minLength: 1 }
        }
    }
};
const predictCLVSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'customerId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', minLength: 1 }
        }
    }
};
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
};
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
};
const modelPerformanceSchema = {
    params: {
        type: 'object',
        required: ['modelType'],
        properties: {
            modelType: { type: 'string', enum: ['demand', 'pricing', 'churn', 'clv', 'no_show'] }
        }
    }
};
async function predictionRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.post('/demand', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: predictDemandSchema,
        handler: prediction_controller_1.predictionController.predictDemand
    });
    app.post('/pricing', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: optimizePricingSchema,
        handler: prediction_controller_1.predictionController.optimizePricing
    });
    app.post('/churn', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: predictChurnSchema,
        handler: prediction_controller_1.predictionController.predictChurn
    });
    app.post('/clv', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: predictCLVSchema,
        handler: prediction_controller_1.predictionController.predictCLV
    });
    app.post('/no-show', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: predictNoShowSchema,
        handler: prediction_controller_1.predictionController.predictNoShow
    });
    app.post('/what-if', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: whatIfScenarioSchema,
        handler: prediction_controller_1.predictionController.runWhatIfScenario
    });
    app.get('/models/:modelType/performance', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.admin'])],
        schema: modelPerformanceSchema,
        handler: prediction_controller_1.predictionController.getModelPerformance
    });
}
//# sourceMappingURL=prediction.routes.js.map