"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = realtimeRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const realtime_controller_1 = require("../controllers/realtime.controller");
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
};
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
const dashboardParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId', 'dashboardId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            dashboardId: { type: 'string', format: 'uuid' }
        }
    }
};
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
};
const counterParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId', 'counterType'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            counterType: { type: 'string', minLength: 1 }
        }
    }
};
async function realtimeRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId/metrics', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: metricsSchema,
        handler: realtime_controller_1.realtimeController.getRealTimeMetrics
    });
    app.get('/venue/:venueId/subscribe', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: subscribeSchema,
        handler: realtime_controller_1.realtimeController.subscribeToMetrics
    });
    app.get('/venue/:venueId/sessions', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: venueParamsSchema,
        handler: realtime_controller_1.realtimeController.getActiveSessions
    });
    app.get('/venue/:venueId/dashboard/:dashboardId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dashboardParamsSchema,
        handler: realtime_controller_1.realtimeController.getLiveDashboardStats
    });
    app.post('/venue/:venueId/counter', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: updateCounterSchema,
        handler: realtime_controller_1.realtimeController.updateCounter
    });
    app.get('/venue/:venueId/counter/:counterType', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: counterParamsSchema,
        handler: realtime_controller_1.realtimeController.getCounter
    });
}
//# sourceMappingURL=realtime.routes.js.map