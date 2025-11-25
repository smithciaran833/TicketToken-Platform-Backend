"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheStats = exports.cacheInvalidator = exports.cacheStrategies = exports.cacheMiddleware = exports.cache = void 0;
const dist_1 = require("@tickettoken/shared/cache/dist");
const serviceName = process.env.SERVICE_NAME || 'blockchain-service';
const cacheSystem = (0, dist_1.createCache)({
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        keyPrefix: `${serviceName}:`,
    }
});
exports.cache = cacheSystem.service;
exports.cacheMiddleware = cacheSystem.middleware;
exports.cacheStrategies = cacheSystem.strategies;
exports.cacheInvalidator = cacheSystem.invalidator;
const getCacheStats = () => exports.cache.getStats();
exports.getCacheStats = getCacheStats;
//# sourceMappingURL=cache-integration.js.map