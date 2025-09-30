import { createCache } from './cache/dist';
import axios from 'axios';

const cache = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'isc:', // inter-service-cache
  }
});

/**
 * Cached service client - replaces direct HTTP calls
 */
export class CachedServiceClient {
  private baseUrl: string;
  private serviceName: string;
  private defaultTTL: number;

  constructor(serviceName: string, port: number, defaultTTL: number = 300) {
    this.serviceName = serviceName;
    this.baseUrl = `http://localhost:${port}`;
    this.defaultTTL = defaultTTL;
  }

  /**
   * GET request with caching
   */
  async get<T>(path: string, options?: { ttl?: number; skipCache?: boolean }): Promise<T> {
    const cacheKey = `${this.serviceName}:GET:${path}`;
    
    if (!options?.skipCache) {
      const cached = await cache.service.get<T>(cacheKey);
      if (cached) {
        console.log(`Cache HIT: ${cacheKey}`);
        return cached;
      }
    }

    console.log(`Cache MISS: ${cacheKey} - calling service`);
    const response = await axios.get(`${this.baseUrl}${path}`);
    
    // Cache successful responses
    if (response.status === 200 && response.data) {
      await cache.service.set(cacheKey, response.data, {
        ttl: options?.ttl || this.defaultTTL
      });
    }

    return response.data;
  }

  /**
   * POST request (no caching, but invalidates related caches)
   */
  async post<T>(path: string, data: any, invalidatePatterns?: string[]): Promise<T> {
    const response = await axios.post(`${this.baseUrl}${path}`, data);
    
    // Invalidate related caches
    if (invalidatePatterns) {
      for (const pattern of invalidatePatterns) {
        await cache.service.delete(`${this.serviceName}:GET:${pattern}`);
      }
    }

    return response.data;
  }

  /**
   * Invalidate cache for specific paths
   */
  async invalidate(paths: string[]): Promise<void> {
    const keys = paths.map(path => `${this.serviceName}:GET:${path}`);
    await cache.service.delete(keys);
  }
}

// Pre-configured service clients
export const serviceClients = {
  auth: new CachedServiceClient('auth', 3001, 300),
  user: new CachedServiceClient('user', 3002, 300),
  venue: new CachedServiceClient('venue', 3003, 600),
  event: new CachedServiceClient('event', 3004, 600),
  ticket: new CachedServiceClient('ticket', 3005, 30),
  payment: new CachedServiceClient('payment', 3006, 60),
  notification: new CachedServiceClient('notification', 3007, 3600),
  marketplace: new CachedServiceClient('marketplace', 3008, 300),
};

// Helper to get user from auth service with caching
export async function getCachedUser(userId: string): Promise<any> {
  return serviceClients.auth.get(`/users/${userId}`, { ttl: 300 });
}

// Helper to get event details with caching
export async function getCachedEvent(eventId: string): Promise<any> {
  return serviceClients.event.get(`/events/${eventId}`, { ttl: 600 });
}

// Helper to check ticket availability with short cache
export async function getCachedTicketAvailability(eventId: string): Promise<any> {
  return serviceClients.ticket.get(`/events/${eventId}/availability`, { ttl: 30 });
}

export default cache;
