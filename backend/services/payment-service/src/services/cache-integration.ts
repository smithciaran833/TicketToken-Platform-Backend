import { createCache } from '@tickettoken/cache';

const serviceName = process.env.SERVICE_NAME || 'payment-service';

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
export const serviceCache = {};
