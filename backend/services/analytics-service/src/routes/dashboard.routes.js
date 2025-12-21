"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = dashboardRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
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
        required: ['dashboardId'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' }
        }
    }
};
const createDashboardSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'name', 'type'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            type: { type: 'string', enum: ['overview', 'sales', 'customer', 'operations', 'custom'] },
            isDefault: { type: 'boolean' },
            isPublic: { type: 'boolean' },
            config: { type: 'object' }
        }
    }
};
const updateDashboardSchema = {
    params: {
        type: 'object',
        required: ['dashboardId'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            isPublic: { type: 'boolean' },
            config: { type: 'object' }
        }
    }
};
const cloneDashboardSchema = {
    params: {
        type: 'object',
        required: ['dashboardId'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['name'],
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            venueId: { type: 'string', format: 'uuid' }
        }
    }
};
const shareDashboardSchema = {
    params: {
        type: 'object',
        required: ['dashboardId'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['userIds', 'permissions'],
        properties: {
            userIds: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', format: 'uuid' }
            },
            permissions: {
                type: 'array',
                items: { type: 'string', enum: ['view', 'edit'] }
            }
        }
    }
};
async function dashboardRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: venueParamsSchema,
        handler: dashboard_controller_1.dashboardController.getDashboards
    });
    app.get('/:dashboardId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dashboardParamsSchema,
        handler: dashboard_controller_1.dashboardController.getDashboard
    });
    app.post('/', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: createDashboardSchema,
        handler: dashboard_controller_1.dashboardController.createDashboard
    });
    app.put('/:dashboardId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: updateDashboardSchema,
        handler: dashboard_controller_1.dashboardController.updateDashboard
    });
    app.delete('/:dashboardId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.delete'])],
        schema: dashboardParamsSchema,
        handler: dashboard_controller_1.dashboardController.deleteDashboard
    });
    app.post('/:dashboardId/clone', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: cloneDashboardSchema,
        handler: dashboard_controller_1.dashboardController.cloneDashboard
    });
    app.post('/:dashboardId/share', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.share'])],
        schema: shareDashboardSchema,
        handler: dashboard_controller_1.dashboardController.shareDashboard
    });
    app.get('/:dashboardId/permissions', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dashboardParamsSchema,
        handler: dashboard_controller_1.dashboardController.getDashboardPermissions
    });
}
//# sourceMappingURL=dashboard.routes.js.map