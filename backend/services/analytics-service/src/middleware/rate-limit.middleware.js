"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
const redis_1 = require("../config/redis");
const error_handler_1 = require("./error-handler");
const logger_1 = require("../utils/logger");
async function rateLimitMiddleware(req, res, next) {
    try {
        if (req.path === '/health' || req.path === '/ws-health') {
            return next();
        }
        const redis = (0, redis_1.getRedis)();
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const key = `rate_limit:${ip}:${req.path}`;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, 60);
        }
        const limit = 100;
        if (count > limit) {
            return next(new error_handler_1.UnauthorizedError('Rate limit exceeded'));
        }
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', (limit - count).toString());
        next();
    }
    catch (error) {
        logger_1.logger.error('Rate limit error:', error);
        next();
    }
}
//# sourceMappingURL=rate-limit.middleware.js.map