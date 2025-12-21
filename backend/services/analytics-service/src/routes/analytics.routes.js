"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = analyticsRoutes;
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const dateRangeSchema = {
    querystring: {
        type: 'object',
        required: ['startDate', 'endDate'],
        properties: {
            startDate: {
                type: 'string',
                format: 'date-time',
                description: 'Start date in ISO 8601 format'
            },
            endDate: {
                type: 'string',
                format: 'date-time',
                description: 'End date in ISO 8601 format'
            }
        }
    }
};
const projectionSchema = {
    querystring: {
        type: 'object',
        properties: {
            days: {
                type: 'integer',
                minimum: 1,
                maximum: 365,
                description: 'Number of days to project'
            }
        }
    }
};
const churnRiskSchema = {
    querystring: {
        type: 'object',
        properties: {
            threshold: {
                type: 'integer',
                minimum: 1,
                maximum: 365,
                description: 'Threshold in days for churn risk'
            }
        }
    }
};
const salesMetricsSchema = {
    querystring: {
        type: 'object',
        required: ['startDate', 'endDate'],
        properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            granularity: {
                type: 'string',
                enum: ['hour', 'day', 'week', 'month'],
                description: 'Time granularity for metrics'
            }
        }
    }
};
const topEventsSchema = {
    querystring: {
        type: 'object',
        required: ['startDate', 'endDate'],
        properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            limit: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 10,
                description: 'Number of top events to return'
            }
        }
    }
};
const customQuerySchema = {
    body: {
        type: 'object',
        required: ['metrics', 'timeRange'],
        properties: {
            metrics: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'string',
                    enum: ['revenue', 'ticketSales', 'conversionRate', 'customerMetrics', 'topEvents', 'salesTrends']
                }
            },
            timeRange: {
                type: 'object',
                required: ['start', 'end'],
                properties: {
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' },
                    granularity: {
                        type: 'string',
                        enum: ['hour', 'day', 'week', 'month']
                    }
                }
            },
            filters: {
                type: 'object',
                additionalProperties: true
            },
            groupBy: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    }
};
const dashboardSchema = {
    querystring: {
        type: 'object',
        properties: {
            period: {
                type: 'string',
                enum: ['24h', '7d', '30d', '90d'],
                default: '7d',
                description: 'Time period for dashboard data'
            }
        }
    }
};
async function analyticsRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.get('/revenue/summary', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dateRangeSchema,
        handler: analytics_controller_1.analyticsController.getRevenueSummary
    });
    app.get('/revenue/by-channel', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dateRangeSchema,
        handler: analytics_controller_1.analyticsController.getRevenueByChannel
    });
    app.get('/revenue/projections', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: projectionSchema,
        handler: analytics_controller_1.analyticsController.getRevenueProjections
    });
    app.get('/customers/lifetime-value', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: analytics_controller_1.analyticsController.getCustomerLifetimeValue
    });
    app.get('/customers/segments', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: analytics_controller_1.analyticsController.getCustomerSegments
    });
    app.get('/customers/churn-risk', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: churnRiskSchema,
        handler: analytics_controller_1.analyticsController.getChurnRiskAnalysis
    });
    app.get('/sales/metrics', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: salesMetricsSchema,
        handler: analytics_controller_1.analyticsController.getSalesMetrics
    });
    app.get('/sales/trends', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dateRangeSchema,
        handler: analytics_controller_1.analyticsController.getSalesTrends
    });
    app.get('/events/performance', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dateRangeSchema,
        handler: analytics_controller_1.analyticsController.getEventPerformance
    });
    app.get('/events/top-performing', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: topEventsSchema,
        handler: analytics_controller_1.analyticsController.getTopPerformingEvents
    });
    app.get('/realtime/summary', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        handler: analytics_controller_1.analyticsController.getRealtimeSummary
    });
    app.get('/conversions/funnel', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dateRangeSchema,
        handler: analytics_controller_1.analyticsController.getConversionFunnel
    });
    app.post('/query', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read', 'analytics.write'])],
        schema: customQuerySchema,
        handler: analytics_controller_1.analyticsController.executeCustomQuery
    });
    app.get('/dashboard', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: dashboardSchema,
        handler: analytics_controller_1.analyticsController.getDashboardData
    });
}
//# sourceMappingURL=analytics.routes.js.map