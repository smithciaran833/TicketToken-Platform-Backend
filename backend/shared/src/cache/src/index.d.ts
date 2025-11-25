export { CacheService, CacheOptions, CacheLevel, CacheStrategy } from './cache-service';
export { CacheConfig, defaultConfig } from './cache-config';
export { CacheMetrics } from './cache-metrics';
export { CacheMiddleware, CacheMiddlewareOptions } from './cache-middleware';
export { CacheStrategies, CachePattern, StrategyOptions } from './cache-strategies';
export { CacheInvalidator, InvalidationRule } from './cache-invalidator';
import { CacheService } from './cache-service';
import { CacheMiddleware } from './cache-middleware';
import { CacheStrategies } from './cache-strategies';
import { CacheInvalidator } from './cache-invalidator';
import { CacheConfig } from './cache-config';
export declare function createCache(config?: Partial<CacheConfig>): {
    service: CacheService;
    middleware: CacheMiddleware;
    strategies: CacheStrategies;
    invalidator: CacheInvalidator;
};
//# sourceMappingURL=index.d.ts.map