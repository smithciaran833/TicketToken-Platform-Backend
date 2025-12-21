"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metricsRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const metrics_controller_1 = require("../controllers/metrics.controller");
const recordMetricSchema = {
    body: {
        type: 'object',
        required: ['metricType', 'value', 'venueId'],
        properties: {
            metricType: { type: 'string' },
            value: { type: 'number' },
            venueId: { type: 'string', format: 'uuid' },
            dimensions: { type: 'object' },
            metadata: { type: 'object' }
        }
    }
};
const bulkRecordSchema = {
    body: {
        type: 'object',
        required: ['metrics'],
        properties: {
            metrics: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    required: ['metricType', 'value', 'venueId'],
                    properties: {
                        metricType: { type: 'string' },
                        value: { type: 'number' },
                        venueId: { type: 'string', format: 'uuid' }
                    }
                }
            }
        }
    }
};
const getMetricsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        required: ['metricType', 'startDate', 'endDate'],
        properties: {
            metricType: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            granularity: { type: 'string' }
        }
    }
};
const realTimeMetricsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    }
};
const metricTrendsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        required: ['metricType', 'periods', 'periodUnit'],
        properties: {
            metricType: { type: 'string' },
            periods: { type: 'integer', minimum: 1, maximum: 100 },
            periodUnit: { type: 'string', enum: ['hour', 'day', 'week', 'month'] }
        }
    }
};
const compareMetricsSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        required: ['metricType', 'currentStartDate', 'currentEndDate', 'previousStartDate', 'previousEndDate'],
        properties: {
            metricType: { type: 'string' },
            currentStartDate: { type: 'string', format: 'date-time' },
            currentEndDate: { type: 'string', format: 'date-time' },
            previousStartDate: { type: 'string', format: 'date-time' },
            previousEndDate: { type: 'string', format: 'date-time' }
        }
    }
};
const aggregateMetricSchema = {
    params: {
        type: 'object',
        required: ['venueId'],
        properties: {
            venueId: { type: 'string', format: 'uuid' }
        }
    },
    querystring: {
        type: 'object',
        required: ['metricType', 'startDate', 'endDate', 'aggregation'],
        properties: {
            metricType: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            aggregation: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] }
        }
    }
};
async function metricsRoutes(app) {
    app.addHook('onRequest', auth_middleware_1.authenticate);
    app.post('/', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: recordMetricSchema,
        handler: metrics_controller_1.metricsController.recordMetric
    });
    app.post('/bulk', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.write'])],
        schema: bulkRecordSchema,
        handler: metrics_controller_1.metricsController.bulkRecordMetrics
    });
    app.get('/:venueId', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: getMetricsSchema,
        handler: metrics_controller_1.metricsController.getMetrics
    });
    app.get('/:venueId/realtime', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: realTimeMetricsSchema,
        handler: metrics_controller_1.metricsController.getRealTimeMetrics
    });
    app.get('/:venueId/trends', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: metricTrendsSchema,
        handler: metrics_controller_1.metricsController.getMetricTrends
    });
    app.get('/:venueId/compare', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: compareMetricsSchema,
        handler: metrics_controller_1.metricsController.compareMetrics
    });
    app.get('/:venueId/aggregate', {
        preHandler: [(0, auth_middleware_1.authorize)(['analytics.read'])],
        schema: aggregateMetricSchema,
        handler: metrics_controller_1.metricsController.getAggregatedMetric
    });
}
//# sourceMappingURL=metrics.routes.js.map