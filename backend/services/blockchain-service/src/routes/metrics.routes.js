"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metricsRoutes;
const metrics_1 = require("../utils/metrics");
const circuitBreaker_1 = require("../utils/circuitBreaker");
async function metricsRoutes(fastify) {
    fastify.get('/metrics', async (request, reply) => {
        try {
            reply.header('Content-Type', metrics_1.register.contentType);
            return metrics_1.register.metrics();
        }
        catch (error) {
            return reply.status(500).send({
                error: 'Failed to generate metrics',
                message: error.message
            });
        }
    });
    fastify.get('/metrics/circuit-breakers', async (request, reply) => {
        try {
            const stats = circuitBreaker_1.circuitBreakerManager.getAllStats();
            return {
                timestamp: new Date().toISOString(),
                circuitBreakers: stats
            };
        }
        catch (error) {
            return reply.status(500).send({
                error: 'Failed to get circuit breaker stats',
                message: error.message
            });
        }
    });
    fastify.post('/metrics/circuit-breakers/:name/reset', async (request, reply) => {
        try {
            const { name } = request.params;
            circuitBreaker_1.circuitBreakerManager.reset(name);
            return {
                success: true,
                message: `Circuit breaker ${name} reset successfully`,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            return reply.status(500).send({
                error: 'Failed to reset circuit breaker',
                message: error.message
            });
        }
    });
}
//# sourceMappingURL=metrics.routes.js.map