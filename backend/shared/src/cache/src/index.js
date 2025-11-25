"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInvalidator = exports.CacheStrategies = exports.CacheMiddleware = exports.CacheMetrics = exports.defaultConfig = exports.CacheService = void 0;
exports.createCache = createCache;
var cache_service_1 = require("./cache-service");
Object.defineProperty(exports, "CacheService", { enumerable: true, get: function () { return cache_service_1.CacheService; } });
var cache_config_1 = require("./cache-config");
Object.defineProperty(exports, "defaultConfig", { enumerable: true, get: function () { return cache_config_1.defaultConfig; } });
var cache_metrics_1 = require("./cache-metrics");
Object.defineProperty(exports, "CacheMetrics", { enumerable: true, get: function () { return cache_metrics_1.CacheMetrics; } });
var cache_middleware_1 = require("./cache-middleware");
Object.defineProperty(exports, "CacheMiddleware", { enumerable: true, get: function () { return cache_middleware_1.CacheMiddleware; } });
var cache_strategies_1 = require("./cache-strategies");
Object.defineProperty(exports, "CacheStrategies", { enumerable: true, get: function () { return cache_strategies_1.CacheStrategies; } });
var cache_invalidator_1 = require("./cache-invalidator");
Object.defineProperty(exports, "CacheInvalidator", { enumerable: true, get: function () { return cache_invalidator_1.CacheInvalidator; } });
const cache_service_2 = require("./cache-service");
const cache_middleware_2 = require("./cache-middleware");
const cache_strategies_2 = require("./cache-strategies");
const cache_invalidator_2 = require("./cache-invalidator");
function createCache(config) {
    const service = new cache_service_2.CacheService(config);
    const middleware = new cache_middleware_2.CacheMiddleware(service);
    const strategies = new cache_strategies_2.CacheStrategies(service);
    const invalidator = new cache_invalidator_2.CacheInvalidator(service);
    invalidator.setupDefaultRules();
    return {
        service,
        middleware,
        strategies,
        invalidator
    };
}
//# sourceMappingURL=index.js.map