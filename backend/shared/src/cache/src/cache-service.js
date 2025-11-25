"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const lru_cache_1 = require("lru-cache");
const zlib_1 = require("zlib");
const util_1 = require("util");
const cache_config_1 = require("./cache-config");
const cache_metrics_1 = require("./cache-metrics");
const logger_1 = require("./logger");
const gzipAsync = (0, util_1.promisify)(zlib_1.gzip);
const gunzipAsync = (0, util_1.promisify)(zlib_1.gunzip);
class CacheService {
    redis;
    local;
    config;
    metrics;
    logger = (0, logger_1.createLogger)('cache-service');
    locks = new Map();
    constructor(config) {
        this.config = { ...cache_config_1.defaultConfig, ...config };
        this.redis = new ioredis_1.default({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.db,
            keyPrefix: this.config.redis.keyPrefix,
            maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
            enableReadyCheck: this.config.redis.enableReadyCheck,
            retryStrategy: this.config.redis.retryStrategy,
            lazyConnect: false
        });
        this.local = new lru_cache_1.LRUCache({
            max: this.config.local.max,
            ttl: this.config.local.ttl,
            updateAgeOnGet: this.config.local.updateAgeOnGet,
            updateAgeOnHas: this.config.local.updateAgeOnHas
        });
        this.metrics = new cache_metrics_1.CacheMetrics();
        this.redis.on('connect', () => {
            this.logger.info('Redis connected');
        });
        this.redis.on('error', (err) => {
            this.logger.error({ err }, 'Redis error');
        });
        this.redis.on('ready', () => {
            this.logger.info('Redis ready');
        });
    }
    async get(key, fetcher, options = {}) {
        const startTime = Date.now();
        const level = options.level || 'BOTH';
        try {
            if (level === 'L1' || level === 'BOTH') {
                const localValue = this.local.get(key);
                if (localValue !== undefined) {
                    this.metrics.recordHit('L1');
                    this.logger.debug({ key, level: 'L1', time: Date.now() - startTime }, 'Cache hit');
                    return localValue;
                }
            }
            if (level === 'L2' || level === 'BOTH') {
                const redisValue = await this.redis.get(key);
                if (redisValue) {
                    this.metrics.recordHit('L2');
                    const value = await this.deserialize(redisValue, options.compress);
                    if (level === 'BOTH') {
                        this.local.set(key, value, { ttl: options.ttl ? options.ttl * 1000 : undefined });
                    }
                    this.logger.debug({ key, level: 'L2', time: Date.now() - startTime }, 'Cache hit');
                    return value;
                }
            }
            this.metrics.recordMiss();
            if (!fetcher) {
                return null;
            }
            const lockKey = `lock:${key}`;
            let lockPromise = this.locks.get(lockKey);
            if (lockPromise) {
                this.logger.debug({ key }, 'Waiting for lock');
                return await lockPromise;
            }
            lockPromise = this.fetchAndCache(key, fetcher, options);
            this.locks.set(lockKey, lockPromise);
            try {
                const value = await lockPromise;
                return value;
            }
            finally {
                this.locks.delete(lockKey);
            }
        }
        catch (error) {
            this.logger.error({ error, key }, 'Cache get error');
            if (fetcher) {
                return await fetcher();
            }
            return null;
        }
    }
    async set(key, value, options = {}) {
        const level = options.level || 'BOTH';
        const ttl = options.ttl || this.getTTLForKey(key);
        try {
            if (level === 'L1' || level === 'BOTH') {
                this.local.set(key, value, { ttl: ttl * 1000 });
            }
            if (level === 'L2' || level === 'BOTH') {
                const serialized = await this.serialize(value, options.compress);
                await this.redis.setex(key, ttl, serialized);
                if (options.tags && options.tags.length > 0) {
                    await this.addToTags(key, options.tags);
                }
            }
            this.logger.debug({ key, ttl, level }, 'Cache set');
        }
        catch (error) {
            this.logger.error({ error, key }, 'Cache set error');
            throw error;
        }
    }
    async delete(key, level = 'BOTH') {
        const keys = Array.isArray(key) ? key : [key];
        try {
            if (level === 'L1' || level === 'BOTH') {
                keys.forEach(k => this.local.delete(k));
            }
            if (level === 'L2' || level === 'BOTH') {
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            this.logger.debug({ keys, level }, 'Cache delete');
        }
        catch (error) {
            this.logger.error({ error, keys }, 'Cache delete error');
        }
    }
    async deleteByTags(tags) {
        try {
            const keys = new Set();
            for (const tag of tags) {
                const taggedKeys = await this.redis.smembers(`tag:${tag}`);
                taggedKeys.forEach(k => keys.add(k));
            }
            if (keys.size > 0) {
                await this.delete(Array.from(keys));
                for (const tag of tags) {
                    await this.redis.del(`tag:${tag}`);
                }
            }
            this.logger.info({ tags, count: keys.size }, 'Deleted keys by tags');
        }
        catch (error) {
            this.logger.error({ error, tags }, 'Delete by tags error');
        }
    }
    async flush(level = 'BOTH') {
        try {
            if (level === 'L1' || level === 'BOTH') {
                this.local.clear();
            }
            if (level === 'L2' || level === 'BOTH') {
                await this.redis.flushdb();
            }
            this.logger.info({ level }, 'Cache flushed');
        }
        catch (error) {
            this.logger.error({ error }, 'Cache flush error');
        }
    }
    getStats() {
        return {
            local: {
                size: this.local.size,
                max: this.local.max,
                calculatedSize: this.local.calculatedSize
            },
            metrics: this.metrics.getStats(),
            locks: this.locks.size
        };
    }
    async close() {
        await this.redis.quit();
        this.local.clear();
    }
    async fetchAndCache(key, fetcher, options) {
        const value = await fetcher();
        if (value !== null && value !== undefined) {
            await this.set(key, value, options);
        }
        return value;
    }
    async serialize(value, compress) {
        const json = JSON.stringify(value);
        if (compress || (this.config.compression.enabled &&
            Buffer.byteLength(json) > this.config.compression.threshold)) {
            const compressed = await gzipAsync(json);
            return compressed.toString('base64');
        }
        return json;
    }
    async deserialize(value, compressed) {
        try {
            if (compressed || (this.config.compression.enabled && this.isBase64(value))) {
                const buffer = Buffer.from(value, 'base64');
                const decompressed = await gunzipAsync(buffer);
                return JSON.parse(decompressed.toString());
            }
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    isBase64(str) {
        try {
            return Buffer.from(str, 'base64').toString('base64') === str;
        }
        catch {
            return false;
        }
    }
    getTTLForKey(key) {
        const [service, entity] = key.split(':');
        switch (entity) {
            case 'session': return this.config.ttls.session;
            case 'user': return this.config.ttls.user;
            case 'event': return this.config.ttls.event;
            case 'venue': return this.config.ttls.venue;
            case 'ticket': return this.config.ttls.ticket;
            case 'template': return this.config.ttls.template;
            case 'search': return this.config.ttls.search;
            default: return 300;
        }
    }
    async addToTags(key, tags) {
        const pipeline = this.redis.pipeline();
        for (const tag of tags) {
            pipeline.sadd(`tag:${tag}`, key);
            pipeline.expire(`tag:${tag}`, 86400);
        }
        await pipeline.exec();
    }
}
exports.CacheService = CacheService;
//# sourceMappingURL=cache-service.js.map