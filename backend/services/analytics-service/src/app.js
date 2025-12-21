"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const config_1 = require("./config");
const database_1 = require("./config/database");
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const metrics_routes_1 = __importDefault(require("./routes/metrics.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const alerts_routes_1 = __importDefault(require("./routes/alerts.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const export_routes_1 = __importDefault(require("./routes/export.routes"));
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const campaign_routes_1 = __importDefault(require("./routes/campaign.routes"));
const insights_routes_1 = __importDefault(require("./routes/insights.routes"));
const prediction_routes_1 = __importDefault(require("./routes/prediction.routes"));
const realtime_routes_1 = __importDefault(require("./routes/realtime.routes"));
const widget_routes_1 = __importDefault(require("./routes/widget.routes"));
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: {
            level: config_1.config.env === 'development' ? 'debug' : 'info',
            transport: config_1.config.env === 'development' ? {
                target: 'pino-pretty',
                options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname'
                }
            } : undefined
        },
        trustProxy: true,
        requestIdHeader: 'x-request-id',
        disableRequestLogging: false,
        bodyLimit: 10485760,
    });
    await app.register(cors_1.default, {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
    });
    await app.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    });
    await app.register(rate_limit_1.default, {
        global: true,
        max: 100,
        timeWindow: '15 minutes',
    });
    try {
        await (0, database_1.connectDatabases)();
        app.log.info('Database connections established');
    }
    catch (error) {
        app.log.error({ err: error }, 'Failed to connect to databases');
        throw error;
    }
    await app.register(health_routes_1.default);
    await app.register(analytics_routes_1.default, { prefix: '/api/analytics' });
    await app.register(metrics_routes_1.default, { prefix: '/api/metrics' });
    await app.register(dashboard_routes_1.default, { prefix: '/api/dashboards' });
    await app.register(alerts_routes_1.default, { prefix: '/api/alerts' });
    await app.register(reports_routes_1.default, { prefix: '/api/reports' });
    await app.register(export_routes_1.default, { prefix: '/api/exports' });
    await app.register(customer_routes_1.default, { prefix: '/api/customers' });
    await app.register(campaign_routes_1.default, { prefix: '/api/campaigns' });
    await app.register(insights_routes_1.default, { prefix: '/api/insights' });
    await app.register(prediction_routes_1.default, { prefix: '/api/predictions' });
    await app.register(realtime_routes_1.default, { prefix: '/api/realtime' });
    await app.register(widget_routes_1.default, { prefix: '/api/widgets' });
    app.setErrorHandler((error, request, reply) => {
        app.log.error(error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal Server Error';
        reply.status(statusCode).send({
            error: {
                message,
                statusCode,
                timestamp: new Date().toISOString(),
                path: request.url,
            },
        });
    });
    return app;
}
//# sourceMappingURL=app.js.map