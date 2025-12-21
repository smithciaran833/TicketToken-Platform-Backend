"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = widgetRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const widget_controller_1 = require("../controllers/widget.controller");
const dashboardParamsSchema = {
    params: {
        type: 'object',
        required: ['dashboardId'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' }
        }
    }
};
const widgetParamsSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    }
};
const getWidgetDataSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            refresh: { type: 'boolean' }
        }
    }
};
const createWidgetSchema = {
    body: {
        type: 'object',
        required: ['dashboardId', 'type', 'title', 'config', 'position', 'size'],
        properties: {
            dashboardId: { type: 'string', format: 'uuid' },
            type: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1, maxLength: 100 },
            config: { type: 'object' },
            position: {
                type: 'object',
                required: ['x', 'y'],
                properties: {
                    x: { type: 'integer', minimum: 0 },
                    y: { type: 'integer', minimum: 0 }
                }
            },
            size: {
                type: 'object',
                required: ['width', 'height'],
                properties: {
                    width: { type: 'integer', minimum: 1, maximum: 12 },
                    height: { type: 'integer', minimum: 1, maximum: 12 }
                }
            }
        }
    }
};
const updateWidgetSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            title: { type: 'string', minLength: 1, maxLength: 100 },
            config: { type: 'object' },
            position: { type: 'object' },
            size: { type: 'object' }
        }
    }
};
const moveWidgetSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['targetDashboardId'],
        properties: {
            targetDashboardId: { type: 'string', format: 'uuid' },
            position: { type: 'object' }
        }
    }
};
const duplicateWidgetSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        properties: {
            targetDashboardId: { type: 'string', format: 'uuid' }
        }
    }
};
const exportWidgetSchema = {
    params: {
        type: 'object',
        required: ['widgetId'],
        properties: {
            widgetId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['format'],
        properties: {
            format: { type: 'string', enum: ['csv', 'xlsx', 'json'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' }
        }
    }
};
async function widgetRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/dashboard/:dashboardId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dashboardParamsSchema,
        handler: widget_controller_1.widgetController.getWidgets
    });
    app.get('/:widgetId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: widgetParamsSchema,
        handler: widget_controller_1.widgetController.getWidget
    });
    app.get('/:widgetId/data', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getWidgetDataSchema,
        handler: widget_controller_1.widgetController.getWidgetData
    });
    app.post('/', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: createWidgetSchema,
        handler: widget_controller_1.widgetController.createWidget
    });
    app.put('/:widgetId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: updateWidgetSchema,
        handler: widget_controller_1.widgetController.updateWidget
    });
    app.delete('/:widgetId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.delete'])],
        schema: widgetParamsSchema,
        handler: widget_controller_1.widgetController.deleteWidget
    });
    app.post('/:widgetId/move', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: moveWidgetSchema,
        handler: widget_controller_1.widgetController.moveWidget
    });
    app.post('/:widgetId/duplicate', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: duplicateWidgetSchema,
        handler: widget_controller_1.widgetController.duplicateWidget
    });
    app.post('/:widgetId/export', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.export'])],
        schema: exportWidgetSchema,
        handler: widget_controller_1.widgetController.exportWidgetData
    });
}
//# sourceMappingURL=widget.routes.js.map