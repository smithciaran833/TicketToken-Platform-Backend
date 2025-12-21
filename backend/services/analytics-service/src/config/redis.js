"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = connectRedis;
exports.getRedis = getRedis;
exports.getPubClient = getPubClient;
exports.getSubClient = getSubClient;
exports.closeRedis = closeRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
let redis;
let pubClient;
let subClient;
async function connectRedis() {
    try {
        redis = new ioredis_1.default({
            host: index_1.config.redis.host,
            port: index_1.config.redis.port,
            password: index_1.config.redis.password,
            db: index_1.config.redis.db,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true,
        });
        pubClient = redis.duplicate();
        subClient = redis.duplicate();
        redis.on('connect', () => {
            logger_1.logger.info('Redis connected successfully');
        });
        redis.on('error', (err) => {
            logger_1.logger.error('Redis connection error:', err);
        });
        await redis.ping();
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to Redis:', error);
        throw error;
    }
}
function getRedis() {
    if (!redis) {
        throw new Error('Redis not initialized');
    }
    return redis;
}
function getPubClient() {
    if (!pubClient) {
        throw new Error('Redis pub client not initialized');
    }
    return pubClient;
}
function getSubClient() {
    if (!subClient) {
        throw new Error('Redis sub client not initialized');
    }
    return subClient;
}
async function closeRedis() {
    if (redis) {
        await redis.quit();
    }
    if (pubClient) {
        await pubClient.quit();
    }
    if (subClient) {
        await subClient.quit();
    }
    logger_1.logger.info('Redis connections closed');
}
//# sourceMappingURL=redis.js.map