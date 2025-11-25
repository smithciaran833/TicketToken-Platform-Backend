import { createCache } from '@tickettoken/shared';

const serviceName = process.env.SERVICE_NAME || 'notification-service';

// Initialize cache with service-specific config
const cacheSystem = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: `${serviceName}:`,
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
