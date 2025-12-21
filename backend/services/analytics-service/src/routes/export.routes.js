"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exportRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const export_controller_1 = require("../controllers/export.controller");
const getExportsSchema = {
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
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            type: { type: 'string' },
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
    }
};
const exportParamsSchema = {
    params: {
        type: 'object',
        required: ['exportId'],
        properties: {
            exportId: { type: 'string', format: 'uuid' }
        }
    }
};
const createExportSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'type', 'format'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['analytics_report', 'customer_list', 'financial_report', 'custom'] },
            format: { type: 'string', enum: ['csv', 'xlsx', 'pdf', 'json'] },
            filters: { type: 'object' },
            dateRange: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' }
                }
            }
        }
    }
};
async function exportRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getExportsSchema,
        handler: export_controller_1.exportController.getExports
    });
    app.get('/:exportId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: exportParamsSchema,
        handler: export_controller_1.exportController.getExportStatus
    });
    app.post('/', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.export'])],
        schema: createExportSchema,
        handler: export_controller_1.exportController.createExport
    });
    app.get('/:exportId/download', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.export'])],
        schema: exportParamsSchema,
        handler: export_controller_1.exportController.downloadExport
    });
    app.post('/:exportId/cancel', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.export'])],
        schema: exportParamsSchema,
        handler: export_controller_1.exportController.cancelExport
    });
    app.post('/:exportId/retry', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.export'])],
        schema: exportParamsSchema,
        handler: export_controller_1.exportController.retryExport
    });
}
//# sourceMappingURL=export.routes.js.map