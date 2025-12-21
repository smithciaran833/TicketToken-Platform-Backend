"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = reportsRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const reports_controller_1 = require("../controllers/reports.controller");
const venueParamsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    }
};
const reportParamsSchema = {
    params: {
        type: 'object',
        required: ['reportId'],
        properties: {
            reportId: { type: 'string', format: 'uuid' }
        }
    }
};
const getReportsSchema = {
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
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 }
        }
    }
};
const generateReportSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'templateId', 'name', 'parameters', 'format'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            templateId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            parameters: { type: 'object' },
            format: { type: 'string', enum: ['pdf', 'xlsx', 'csv'] },
            schedule: { type: 'object' }
        }
    }
};
const scheduleReportSchema = {
    body: {
        type: 'object',
        required: ['venueId', 'templateId', 'name', 'schedule', 'recipients'],
        properties: {
            venueId: { type: 'string', format: 'uuid' },
            templateId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            schedule: {
                type: 'object',
                required: ['frequency', 'time'],
                properties: {
                    frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
                    time: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' }
                }
            },
            recipients: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' }
                    }
                }
            }
        }
    }
};
const updateScheduleSchema = {
    params: {
        type: 'object',
        required: ['reportId'],
        properties: {
            reportId: { type: 'string', format: 'uuid' }
        }
    },
    body: {
        type: 'object',
        required: ['schedule'],
        properties: {
            schedule: { type: 'object' },
            recipients: { type: 'array' }
        }
    }
};
const scheduleActionSchema = {
    params: {
        type: 'object',
        required: ['reportId', 'action'],
        properties: {
            reportId: { type: 'string', format: 'uuid' },
            action: { type: 'string', enum: ['pause', 'resume'] }
        }
    }
};
async function reportsRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/templates', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: reports_controller_1.reportsController.getReportTemplates
    });
    app.get('/venue/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getReportsSchema,
        handler: reports_controller_1.reportsController.getReports
    });
    app.get('/:reportId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: reportParamsSchema,
        handler: reports_controller_1.reportsController.getReport
    });
    app.post('/generate', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: generateReportSchema,
        handler: reports_controller_1.reportsController.generateReport
    });
    app.post('/schedule', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: scheduleReportSchema,
        handler: reports_controller_1.reportsController.scheduleReport
    });
    app.put('/:reportId/schedule', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: updateScheduleSchema,
        handler: reports_controller_1.reportsController.updateReportSchedule
    });
    app.delete('/:reportId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.delete'])],
        schema: reportParamsSchema,
        handler: reports_controller_1.reportsController.deleteReport
    });
    app.get('/venue/:venueId/scheduled', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: venueParamsSchema,
        handler: reports_controller_1.reportsController.getScheduledReports
    });
    app.post('/:reportId/schedule/:action', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: scheduleActionSchema,
        handler: reports_controller_1.reportsController.toggleScheduledReport
    });
}
//# sourceMappingURL=reports.routes.js.map