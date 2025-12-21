"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = alertsRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const alerts_controller_1 = require("../controllers/alerts.controller");
const getAlertsSchema = {
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
            enabled: { type: 'boolean' },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
    }
};
const alertParamsSchema = {
    params: {
        type: 'object',
        required: ['alertId'],
        properties: {
            alertId: { type: 'string', format: 'uuid' }
        }
    }
};
const createAlertSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'name', 'type', 'severity', 'conditions', 'actions'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            type: { type: 'string', minLength: 1 },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            conditions: { type: 'array', minItems: 1 },
            actions: { type: 'array', minItems: 1 },
            enabled: { type: 'boolean' },
            schedule: { type: 'object' }
        }
    }
};
const updateAlertSchema = {
    params: {
        type: 'object',
        required: ['alertId'],
        properties: {
            alertId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            conditions: { type: 'array' },
            actions: { type: 'array' },
            schedule: { type: 'object' }
        }
    }
};
const toggleAlertSchema = {
    params: {
        type: 'object',
        required: ['alertId'],
        properties: {
            alertId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['enabled'],
        properties: {
            enabled: { type: 'boolean' }
        }
    }
};
const getInstancesSchema = {
    params: {
        type: 'object',
        required: ['alertId'],
        properties: {
            alertId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['active', 'acknowledged', 'resolved'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
    }
};
const acknowledgeAlertSchema = {
    params: {
        type: 'object',
        required: ['instanceId'],
        properties: {
            instanceId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            notes: { type: 'string' }
        }
    }
};
async function alertsRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getAlertsSchema,
        handler: alerts_controller_1.alertsController.getAlerts
    });
    app.get('/:alertId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: alertParamsSchema,
        handler: alerts_controller_1.alertsController.getAlert
    });
    app.post('/', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: createAlertSchema,
        handler: alerts_controller_1.alertsController.createAlert
    });
    app.put('/:alertId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: updateAlertSchema,
        handler: alerts_controller_1.alertsController.updateAlert
    });
    app.delete('/:alertId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.delete'])],
        schema: alertParamsSchema,
        handler: alerts_controller_1.alertsController.deleteAlert
    });
    app.post('/:alertId/toggle', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: toggleAlertSchema,
        handler: alerts_controller_1.alertsController.toggleAlert
    });
    app.get('/:alertId/instances', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getInstancesSchema,
        handler: alerts_controller_1.alertsController.getAlertInstances
    });
    app.post('/instances/:instanceId/acknowledge', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: acknowledgeAlertSchema,
        handler: alerts_controller_1.alertsController.acknowledgeAlert
    });
    app.post('/:alertId/test', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: alertParamsSchema,
        handler: alerts_controller_1.alertsController.testAlert
    });
}
//# sourceMappingURL=alerts.routes.js.map