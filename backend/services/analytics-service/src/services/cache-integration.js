"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceCache = exports.getCacheStats = exports.cacheInvalidator = exports.cacheStrategies = exports.cacheMiddleware = exports.cache = void 0;
const shared_1 = require("@tickettoken/shared");
const serviceName = process.env.SERVICE_NAME || 'analytics-service';
const cacheSystem = (0, shared_1.createCache)({
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        keyPrefix: `${serviceName}:`,
    },
    ttls: {
        session: 5 * 60,
        user: 5 * 60,
        event: 10 * 60,
        venue: 30 * 60,
        ticket: 30,
        template: 60 * 60,
        search: 5 * 60
    }
});
exports.cache = cacheSystem.service;
exports.cacheMiddleware = cacheSystem.middleware;
exports.cacheStrategies = cacheSystem.strategies;
exports.cacheInvalidator = cacheSystem.invalidator;
const getCacheStats = () => exports.cache.getStats();
exports.getCacheStats = getCacheStats;
exports.serviceCache = {
    async get(key, fetcher, ttl = 300) {
        return exports.cache.get(key, fetcher, { ttl, level: 'BOTH' });
    },
    async set(key, value, ttl = 300) {
        await exports.cache.set(key, value, { ttl, level: 'BOTH' });
    },
    async delete(keys) {
        await exports.cache.delete(keys);
    },
    async flush() {
        await exports.cache.flush();
    }
};
//# sourceMappingURL=cache-integration.js.map