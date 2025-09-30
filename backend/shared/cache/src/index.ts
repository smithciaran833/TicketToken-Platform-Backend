export { CacheService, CacheOptions, CacheLevel, CacheStrategy } from './cache-service';
export { CacheConfig, defaultConfig } from './cache-config';
export { CacheMetrics } from './cache-metrics';
export { CacheMiddleware, CacheMiddlewareOptions } from './cache-middleware';
export { CacheStrategies, CachePattern, StrategyOptions } from './cache-strategies';
export { CacheInvalidator, InvalidationRule } from './cache-invalidator';

// Factory function for easy initialization
import { CacheService } from './cache-service';
import { CacheMiddleware } from './cache-middleware';
import { CacheStrategies } from './cache-strategies';
import { CacheInvalidator } from './cache-invalidator';
import { CacheConfig } from './cache-config';

export function createCache(config?: Partial<CacheConfig>) {
  const service = new CacheService(config);
  const middleware = new CacheMiddleware(service);
  const strategies = new CacheStrategies(service);
  const invalidator = new CacheInvalidator(service);
  
  // Setup default invalidation rules
  invalidator.setupDefaultRules();
  
  return {
    service,
    middleware,
    strategies,
    invalidator
  };
}
