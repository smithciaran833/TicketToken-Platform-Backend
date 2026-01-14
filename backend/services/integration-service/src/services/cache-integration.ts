import { createCache } from '@tickettoken/shared';
import { config } from '../config';

// Initialize cache with service-specific config from centralized config
const cacheSystem = createCache({
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    keyPrefix: `${config.server.serviceName}:`,
  },
  ttls: {
    session: 5 * 60,
    user: 5 * 60,
    event: 10 * 60,
    venue: 30 * 60,
    ticket: 30,
    template: 60 * 60,
    search: 5 * 60
  }
});

export const cache = cacheSystem.service;
export const cacheMiddleware = cacheSystem.middleware;
export const cacheStrategies = cacheSystem.strategies;
export const cacheInvalidator = cacheSystem.invalidator;
export const getCacheStats = () => cache.getStats();

// Service-specific cache functions
export const serviceCache = {
  async get(key: string, fetcher?: () => Promise<any>, ttl: number = 300): Promise<any> {
    return cache.get(key, fetcher, { ttl, level: 'BOTH' });
  },
  
  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    await cache.set(key, value, { ttl, level: 'BOTH' });
  },
  
  async delete(keys: string | string[]): Promise<void> {
    await cache.delete(keys);
  },
  
  async flush(): Promise<void> {
    await cache.flush();
  }
};
