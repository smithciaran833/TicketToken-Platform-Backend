import { createCache } from '@tickettoken/shared/cache/dist';

const serviceName = process.env.SERVICE_NAME || 'blockchain-service';

// Initialize cache with service-specific config
const cacheSystem = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: `${serviceName}:`,
  }
});

export const cache = cacheSystem.service;
export const cacheMiddleware = cacheSystem.middleware;
export const cacheStrategies = cacheSystem.strategies;
export const cacheInvalidator = cacheSystem.invalidator;
export const getCacheStats = () => cache.getStats();
