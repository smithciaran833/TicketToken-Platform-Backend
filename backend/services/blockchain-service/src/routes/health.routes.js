"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const app_1 = require("../app");
const logger_1 = require("../utils/logger");
async function healthRoutes(fastify) {
    fastify.get('/health', async (request, reply) => {
        return {
            status: 'ok',
            service: 'blockchain-service',
            timestamp: new Date().toISOString()
        };
    });
    fastify.get('/health/detailed', async (request, reply) => {
        const infrastructure = (0, app_1.getInfrastructure)();
        const checks = {
            service: 'blockchain-service',
            timestamp: new Date().toISOString(),
            status: 'healthy',
            checks: {}
        };
        let allHealthy = true;
        try {
            if (infrastructure.db) {
                await infrastructure.db.query('SELECT 1');
                checks.checks.database = {
                    status: 'healthy',
                    message: 'Database connection active'
                };
            }
            else {
                checks.checks.database = {
                    status: 'unhealthy',
                    message: 'Database not initialized'
                };
                allHealthy = false;
            }
        }
        catch (error) {
            checks.checks.database = {
                status: 'unhealthy',
                message: error.message
            };
            allHealthy = false;
        }
        try {
            if (infrastructure.solanaConnection) {
                const slot = await infrastructure.solanaConnection.getSlot();
                checks.checks.solana = {
                    status: 'healthy',
                    message: 'Solana RPC connection active',
                    currentSlot: slot
                };
            }
            else {
                checks.checks.solana = {
                    status: 'unhealthy',
                    message: 'Solana connection not initialized'
                };
                allHealthy = false;
            }
        }
        catch (error) {
            checks.checks.solana = {
                status: 'unhealthy',
                message: error.message
            };
            allHealthy = false;
        }
        try {
            if (infrastructure.treasuryWallet) {
                const balance = await infrastructure.treasuryWallet.getBalance();
                checks.checks.treasury = {
                    status: balance > 0.01 ? 'healthy' : 'warning',
                    message: balance > 0.01 ? 'Treasury wallet has sufficient balance' : 'Treasury wallet balance is low',
                    balance: balance,
                    balanceSOL: `${balance.toFixed(4)} SOL`
                };
                if (balance <= 0.01) {
                    allHealthy = false;
                }
            }
            else {
                checks.checks.treasury = {
                    status: 'unhealthy',
                    message: 'Treasury wallet not initialized'
                };
                allHealthy = false;
            }
        }
        catch (error) {
            checks.checks.treasury = {
                status: 'unhealthy',
                message: error.message
            };
            allHealthy = false;
        }
        try {
            if (infrastructure.listenerManager) {
                checks.checks.listeners = {
                    status: 'healthy',
                    message: 'Event listener system active'
                };
            }
            else {
                checks.checks.listeners = {
                    status: 'warning',
                    message: 'Event listener system not configured (PROGRAM_ID not set)'
                };
            }
        }
        catch (error) {
            checks.checks.listeners = {
                status: 'unhealthy',
                message: error.message
            };
            allHealthy = false;
        }
        try {
            if (infrastructure.queueManager) {
                checks.checks.queues = {
                    status: 'healthy',
                    message: 'Queue system active'
                };
            }
            else {
                checks.checks.queues = {
                    status: 'unhealthy',
                    message: 'Queue system not initialized'
                };
                allHealthy = false;
            }
        }
        catch (error) {
            checks.checks.queues = {
                status: 'unhealthy',
                message: error.message
            };
            allHealthy = false;
        }
        const rpcFailover = fastify.rpcFailover;
        if (rpcFailover) {
            try {
                const endpoints = rpcFailover.getHealthStatus();
                const healthyCount = endpoints.filter((e) => e.healthy).length;
                checks.checks.rpcFailover = {
                    status: healthyCount > 0 ? 'healthy' : 'unhealthy',
                    message: `${healthyCount}/${endpoints.length} RPC endpoints healthy`,
                    endpoints: endpoints.map((e) => ({
                        url: e.url,
                        healthy: e.healthy,
                        latency: e.latency,
                        lastCheck: new Date(e.lastCheck).toISOString()
                    }))
                };
                if (healthyCount === 0) {
                    allHealthy = false;
                }
            }
            catch (error) {
                checks.checks.rpcFailover = {
                    status: 'warning',
                    message: 'RPC failover check failed: ' + error.message
                };
            }
        }
        checks.status = allHealthy ? 'healthy' : 'degraded';
        if (!allHealthy) {
            return reply.status(503).send(checks);
        }
        return checks;
    });
    fastify.get('/health/db', async (request, reply) => {
        try {
            const infrastructure = (0, app_1.getInfrastructure)();
            if (!infrastructure.db) {
                return reply.status(503).send({
                    status: 'error',
                    database: 'not_initialized',
                    service: 'blockchain-service'
                });
            }
            await infrastructure.db.query('SELECT 1');
            return {
                status: 'ok',
                database: 'connected',
                service: 'blockchain-service'
            };
        }
        catch (error) {
            logger_1.logger.error('Database health check failed', {
                error: error.message
            });
            return reply.status(503).send({
                status: 'error',
                database: 'disconnected',
                error: error.message,
                service: 'blockchain-service'
            });
        }
    });
    fastify.get('/health/solana', async (request, reply) => {
        try {
            const infrastructure = (0, app_1.getInfrastructure)();
            if (!infrastructure.solanaConnection) {
                return reply.status(503).send({
                    status: 'error',
                    solana: 'not_initialized',
                    service: 'blockchain-service'
                });
            }
            const startTime = Date.now();
            const slot = await infrastructure.solanaConnection.getSlot();
            const latency = Date.now() - startTime;
            return {
                status: 'ok',
                solana: 'connected',
                currentSlot: slot,
                latency: `${latency}ms`,
                service: 'blockchain-service'
            };
        }
        catch (error) {
            logger_1.logger.error('Solana health check failed', {
                error: error.message
            });
            return reply.status(503).send({
                status: 'error',
                solana: 'disconnected',
                error: error.message,
                service: 'blockchain-service'
            });
        }
    });
    fastify.get('/health/treasury', async (request, reply) => {
        try {
            const infrastructure = (0, app_1.getInfrastructure)();
            if (!infrastructure.treasuryWallet) {
                return reply.status(503).send({
                    status: 'error',
                    treasury: 'not_initialized',
                    service: 'blockchain-service'
                });
            }
            const balance = await infrastructure.treasuryWallet.getBalance();
            const isHealthy = balance > 0.01;
            return {
                status: isHealthy ? 'ok' : 'warning',
                treasury: isHealthy ? 'sufficient_balance' : 'low_balance',
                balance: balance,
                balanceSOL: `${balance.toFixed(4)} SOL`,
                service: 'blockchain-service'
            };
        }
        catch (error) {
            logger_1.logger.error('Treasury health check failed', {
                error: error.message
            });
            return reply.status(503).send({
                status: 'error',
                treasury: 'check_failed',
                error: error.message,
                service: 'blockchain-service'
            });
        }
    });
}
//# sourceMappingURL=health.routes.js.map