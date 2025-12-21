"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModel = void 0;
const redis_1 = require("../../config/redis");
const constants_1 = require("../../config/constants");
class CacheModel {
    static redis = redis_1.getRedis;
    static async get(key) {
        const redis = this.redis();
        const value = await redis.get(key);
        if (value) {
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        return null;
    }
    static async set(key, value, ttl) {
        const redis = this.redis();
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttl) {
            await redis.setex(key, ttl, serialized);
        }
        else {
            await redis.set(key, serialized);
        }
    }
    static async delete(key) {
        const redis = this.redis();
        await redis.del(key);
    }
    static async deletePattern(pattern) {
        const redis = this.redis();
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            return await redis.del(...keys);
        }
        return 0;
    }
    static async exists(key) {
        const redis = this.redis();
        return (await redis.exists(key)) === 1;
    }
    static async expire(key, ttl) {
        const redis = this.redis();
        await redis.expire(key, ttl);
    }
    static async increment(key, by = 1) {
        const redis = this.redis();
        return await redis.incrby(key, by);
    }
    static async decrement(key, by = 1) {
        const redis = this.redis();
        return await redis.decrby(key, by);
    }
    static getCacheKey(type, ...parts) {
        return `analytics:${type}:${parts.join(':')}`;
    }
    static async cacheMetric(venueId, metricType, value, ttl = constants_1.CONSTANTS.CACHE_TTL.METRICS) {
        const key = this.getCacheKey('metric', venueId, metricType);
        await this.set(key, value, ttl);
    }
    static async getCachedMetric(venueId, metricType) {
        const key = this.getCacheKey('metric', venueId, metricType);
        return await this.get(key);
    }
    static async cacheWidget(widgetId, data, ttl = constants_1.CONSTANTS.CACHE_TTL.DASHBOARD) {
        const key = this.getCacheKey('widget', widgetId);
        await this.set(key, data, ttl);
    }
    static async getCachedWidget(widgetId) {
        const key = this.getCacheKey('widget', widgetId);
        return await this.get(key);
    }
    static async invalidateVenueCache(venueId) {
        const pattern = this.getCacheKey('*', venueId, '*');
        await this.deletePattern(pattern);
    }
}
exports.CacheModel = CacheModel;
//# sourceMappingURL=cache.model.js.map