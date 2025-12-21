"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = exports.cacheStrategies = void 0;
const logger_1 = require("../utils/logger");
exports.cacheStrategies = {
    realTimeMetrics: {
        ttl: 5,
        keyPrefix: 'rtm',
        version: 1
    },
    aggregatedMetrics: {
        ttl: 300,
        keyPrefix: 'agg',
        version: 1
    },
    customerProfile: {
        ttl: 3600,
        keyPrefix: 'cust',
        version: 1
    },
    dashboardConfig: {
        ttl: 86400,
        keyPrefix: 'dash',
        version: 1
    },
    widgetData: {
        ttl: 60,
        keyPrefix: 'widget',
        version: 1
    },
    sessionData: {
        ttl: 1800,
        keyPrefix: 'sess',
        version: 1
    }
};
class CacheManager {
    redis;
    prefix;
    constructor(redis, prefix = 'analytics') {
        this.redis = redis;
        this.prefix = prefix;
    }
    generateKey(strategy, identifier) {
        return `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${identifier}`;
    }
    async set(strategyName, identifier, data, customTTL) {
        const strategy = exports.cacheStrategies[strategyName];
        if (!strategy) {
            logger_1.logger.warn(`Unknown cache strategy: ${strategyName}`);
            return;
        }
        const key = this.generateKey(strategy, identifier);
        const ttl = customTTL || strategy.ttl;
        try {
            await this.redis.setex(key, ttl, JSON.stringify(data));
            logger_1.logger.debug(`Cached ${strategyName} for ${identifier} with TTL ${ttl}s`);
        }
        catch (error) {
            logger_1.logger.error(`Cache set error for ${strategyName}:`, error);
        }
    }
    async get(strategyName, identifier) {
        const strategy = exports.cacheStrategies[strategyName];
        if (!strategy) {
            return null;
        }
        const key = this.generateKey(strategy, identifier);
        try {
            const data = await this.redis.get(key);
            if (data) {
                logger_1.logger.debug(`Cache hit for ${strategyName}: ${identifier}`);
                return JSON.parse(data);
            }
            logger_1.logger.debug(`Cache miss for ${strategyName}: ${identifier}`);
            return null;
        }
        catch (error) {
            logger_1.logger.error(`Cache get error for ${strategyName}:`, error);
            return null;
        }
    }
    async invalidate(strategyName, pattern) {
        const strategy = exports.cacheStrategies[strategyName];
        if (!strategy) {
            return;
        }
        const keyPattern = pattern
            ? `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${pattern}*`
            : `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:*`;
        try {
            const keys = await this.redis.keys(keyPattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                logger_1.logger.info(`Invalidated ${keys.length} cache entries for ${strategyName}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Cache invalidation error for ${strategyName}:`, error);
        }
    }
    async getOrSet(strategyName, identifier, fetchFunction, customTTL) {
        const cached = await this.get(strategyName, identifier);
        if (cached !== null) {
            return cached;
        }
        const data = await fetchFunction();
        await this.set(strategyName, identifier, data, customTTL);
        return data;
    }
    async mget(strategyName, identifiers) {
        const strategy = exports.cacheStrategies[strategyName];
        if (!strategy) {
            return new Map();
        }
        const keys = identifiers.map(id => this.generateKey(strategy, id));
        const results = new Map();
        try {
            const values = await this.redis.mget(...keys);
            identifiers.forEach((id, index) => {
                const value = values[index];
                if (value) {
                    try {
                        results.set(id, JSON.parse(value));
                    }
                    catch (e) {
                        logger_1.logger.error(`Failed to parse cached value for ${id}:`, e);
                    }
                }
            });
            logger_1.logger.debug(`Cache multi-get: ${results.size}/${identifiers.length} hits`);
        }
        catch (error) {
            logger_1.logger.error(`Cache mget error for ${strategyName}:`, error);
        }
        return results;
    }
    async getStats() {
        const info = await this.redis.info('stats');
        const dbSize = await this.redis.dbsize();
        return {
            dbSize,
            info: info.split('\n').reduce((acc, line) => {
                const [key, value] = line.split(':');
                if (key && value) {
                    acc[key.trim()] = value.trim();
                }
                return acc;
            }, {})
        };
    }
}
exports.CacheManager = CacheManager;
exports.default = CacheManager;
//# sourceMappingURL=redis-cache-strategies.js.map