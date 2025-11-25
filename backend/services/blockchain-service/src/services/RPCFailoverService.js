"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCFailoverService = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("../utils/logger");
class RPCFailoverService {
    endpoints;
    currentEndpointIndex;
    healthCheckInterval;
    maxFailures;
    timeout;
    commitment;
    healthCheckTimer;
    connectionConfig;
    constructor(config) {
        this.endpoints = config.endpoints.map((url, index) => ({
            url,
            priority: index,
            healthy: true,
            lastCheck: Date.now(),
            failureCount: 0
        }));
        this.currentEndpointIndex = 0;
        this.healthCheckInterval = config.healthCheckInterval || 30000;
        this.maxFailures = config.maxFailures || 3;
        this.timeout = config.timeout || 30000;
        this.commitment = config.commitment || 'confirmed';
        this.connectionConfig = {
            commitment: this.commitment,
            confirmTransactionInitialTimeout: this.timeout
        };
        logger_1.logger.info('RPC Failover Service initialized', {
            endpoints: this.endpoints.length,
            healthCheckInterval: this.healthCheckInterval,
            maxFailures: this.maxFailures
        });
        this.startHealthChecks();
    }
    getConnection() {
        const endpoint = this.getCurrentEndpoint();
        return new web3_js_1.Connection(endpoint.url, this.connectionConfig);
    }
    getCurrentEndpoint() {
        const healthyEndpoint = this.endpoints.find(e => e.healthy);
        if (!healthyEndpoint) {
            logger_1.logger.warn('All RPC endpoints unhealthy, using primary');
            return this.endpoints[0];
        }
        return healthyEndpoint;
    }
    async executeWithFailover(operation, retries = this.endpoints.length) {
        let lastError = null;
        let attempts = 0;
        while (attempts < retries) {
            const endpoint = this.getCurrentEndpoint();
            const connection = new web3_js_1.Connection(endpoint.url, this.connectionConfig);
            try {
                const startTime = Date.now();
                const result = await operation(connection);
                const latency = Date.now() - startTime;
                endpoint.latency = latency;
                endpoint.failureCount = 0;
                endpoint.healthy = true;
                endpoint.lastCheck = Date.now();
                logger_1.logger.debug('RPC operation successful', {
                    endpoint: endpoint.url,
                    latency,
                    attempts: attempts + 1
                });
                return result;
            }
            catch (error) {
                lastError = error;
                attempts++;
                logger_1.logger.warn('RPC operation failed, attempting failover', {
                    endpoint: endpoint.url,
                    error: error.message,
                    attempts,
                    retries
                });
                endpoint.failureCount++;
                if (endpoint.failureCount >= this.maxFailures) {
                    endpoint.healthy = false;
                    logger_1.logger.error('RPC endpoint marked unhealthy', {
                        endpoint: endpoint.url,
                        failureCount: endpoint.failureCount
                    });
                }
                if (attempts < retries) {
                    this.rotateToNextEndpoint();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        logger_1.logger.error('All RPC failover attempts exhausted', {
            attempts,
            lastError: lastError?.message
        });
        throw lastError || new Error('All RPC endpoints failed');
    }
    rotateToNextEndpoint() {
        const startIndex = this.currentEndpointIndex;
        let checked = 0;
        while (checked < this.endpoints.length) {
            this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
            checked++;
            if (this.endpoints[this.currentEndpointIndex].healthy) {
                logger_1.logger.info('Rotated to next RPC endpoint', {
                    endpoint: this.endpoints[this.currentEndpointIndex].url,
                    index: this.currentEndpointIndex
                });
                return;
            }
        }
        this.currentEndpointIndex = 0;
        logger_1.logger.warn('No healthy endpoints found, reset to primary');
    }
    startHealthChecks() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthChecks();
        }, this.healthCheckInterval);
    }
    async performHealthChecks() {
        logger_1.logger.debug('Performing RPC health checks');
        const checks = this.endpoints.map(async (endpoint) => {
            try {
                const connection = new web3_js_1.Connection(endpoint.url, this.connectionConfig);
                const startTime = Date.now();
                await connection.getLatestBlockhash();
                const latency = Date.now() - startTime;
                endpoint.healthy = true;
                endpoint.latency = latency;
                endpoint.failureCount = 0;
                endpoint.lastCheck = Date.now();
                logger_1.logger.debug('Health check passed', {
                    endpoint: endpoint.url,
                    latency
                });
            }
            catch (error) {
                endpoint.failureCount++;
                endpoint.lastCheck = Date.now();
                if (endpoint.failureCount >= this.maxFailures) {
                    endpoint.healthy = false;
                }
                logger_1.logger.warn('Health check failed', {
                    endpoint: endpoint.url,
                    error: error.message,
                    failureCount: endpoint.failureCount,
                    healthy: endpoint.healthy
                });
            }
        });
        await Promise.allSettled(checks);
        const healthyCount = this.endpoints.filter(e => e.healthy).length;
        logger_1.logger.info('Health check complete', {
            total: this.endpoints.length,
            healthy: healthyCount,
            unhealthy: this.endpoints.length - healthyCount
        });
    }
    getHealthStatus() {
        return this.endpoints.map(e => ({
            url: e.url,
            healthy: e.healthy,
            latency: e.latency,
            failureCount: e.failureCount,
            lastCheck: e.lastCheck
        }));
    }
    markEndpointHealthy(url) {
        const endpoint = this.endpoints.find(e => e.url === url);
        if (endpoint) {
            endpoint.healthy = true;
            endpoint.failureCount = 0;
            logger_1.logger.info('Endpoint manually marked healthy', { url });
        }
    }
    markEndpointUnhealthy(url) {
        const endpoint = this.endpoints.find(e => e.url === url);
        if (endpoint) {
            endpoint.healthy = false;
            endpoint.failureCount = this.maxFailures;
            logger_1.logger.info('Endpoint manually marked unhealthy', { url });
        }
    }
    stop() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
            logger_1.logger.info('RPC health checks stopped');
        }
    }
}
exports.RPCFailoverService = RPCFailoverService;
exports.default = RPCFailoverService;
//# sourceMappingURL=RPCFailoverService.js.map