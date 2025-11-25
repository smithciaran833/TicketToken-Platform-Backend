"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheMiddleware = void 0;
const crypto_1 = __importDefault(require("crypto"));
class CacheMiddleware {
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    auto(options = {}) {
        return async (req, res, next) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                return next();
            }
            if (options.condition && !options.condition(req)) {
                return next();
            }
            if (options.excludePaths?.some(path => req.path.startsWith(path))) {
                return next();
            }
            const key = options.keyGenerator
                ? options.keyGenerator(req)
                : this.generateKey(req, options);
            const cached = await this.cache.get(key, undefined, options);
            if (cached && typeof cached === 'object' && 'body' in cached && 'headers' in cached) {
                res.set(cached.headers);
                res.set('X-Cache', 'HIT');
                res.set('X-Cache-Key', key);
                return res.status(cached.status || 200).send(cached.body);
            }
            const originalSend = res.send;
            const originalJson = res.json;
            let responseData;
            let captured = false;
            const captureResponse = (data) => {
                if (!captured && res.statusCode < 400) {
                    captured = true;
                    responseData = data;
                    const cacheData = {
                        body: data,
                        headers: this.getCacheableHeaders(res),
                        status: res.statusCode,
                        timestamp: Date.now()
                    };
                    this.cache.set(key, cacheData, options).catch((err) => {
                        console.error('Cache set error:', err);
                    });
                }
                return data;
            };
            res.send = function (data) {
                captureResponse(data);
                return originalSend.call(this, data);
            };
            res.json = function (data) {
                captureResponse(JSON.stringify(data));
                return originalJson.call(this, data);
            };
            res.set('X-Cache', 'MISS');
            res.set('X-Cache-Key', key);
            next();
        };
    }
    invalidate(pattern) {
        return async (req, res, next) => {
            try {
                if (typeof pattern === 'function') {
                    const keys = pattern(req);
                    await this.cache.delete(keys);
                }
                else if (pattern) {
                    const keys = await this.findKeys(pattern);
                    await this.cache.delete(keys);
                }
                else {
                    const key = this.generateKey(req, {});
                    await this.cache.delete(key);
                }
            }
            catch (err) {
                console.error('Cache invalidation error:', err);
            }
            next();
        };
    }
    invalidateTags(tagGenerator) {
        return async (req, res, next) => {
            try {
                const tags = tagGenerator(req);
                await this.cache.deleteByTags(tags);
            }
            catch (err) {
                console.error('Tag invalidation error:', err);
            }
            next();
        };
    }
    generateKey(req, options) {
        const parts = [
            req.method,
            req.path
        ];
        if (options.includeQuery !== false && Object.keys(req.query).length > 0) {
            const sortedQuery = Object.keys(req.query)
                .sort()
                .map(k => `${k}=${req.query[k]}`)
                .join('&');
            parts.push(sortedQuery);
        }
        if (options.includeBody && req.body) {
            const bodyHash = crypto_1.default
                .createHash('md5')
                .update(JSON.stringify(req.body))
                .digest('hex');
            parts.push(bodyHash);
        }
        if (options.varyByHeaders) {
            options.varyByHeaders.forEach(header => {
                const value = req.headers[header.toLowerCase()];
                if (value) {
                    parts.push(`${header}:${value}`);
                }
            });
        }
        if (options.varyByUser && req.user) {
            parts.push(`user:${req.user.id}`);
        }
        return parts.join(':');
    }
    getCacheableHeaders(res) {
        const headers = {};
        const cacheableHeaders = [
            'content-type',
            'content-encoding',
            'cache-control',
            'etag',
            'last-modified'
        ];
        cacheableHeaders.forEach(header => {
            const value = res.get(header);
            if (value) {
                headers[header] = value;
            }
        });
        return headers;
    }
    async findKeys(pattern) {
        return [];
    }
}
exports.CacheMiddleware = CacheMiddleware;
//# sourceMappingURL=cache-middleware.js.map