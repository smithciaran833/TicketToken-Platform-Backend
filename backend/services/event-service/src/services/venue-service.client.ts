import fetch from 'node-fetch';
import CircuitBreaker from 'opossum';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getS2SHeaders, getServiceIdentity } from '../config/service-auth';
import { withRetry, isRetryableError } from '../utils/retry';
import { ValidationError, NotFoundError, ForbiddenError } from '../types';

/**
 * AUDIT FIX (EC1): Generate idempotency key for outbound S2S calls
 * 
 * Format: event-svc:{operation}:{resourceId}:{timestamp}:{nonce}
 * This ensures that retried requests don't create duplicate operations
 * in downstream services.
 * 
 * @param operation - The operation name (e.g., 'validate-venue', 'get-venue')
 * @param resourceId - The resource ID being operated on (e.g., venueId)
 * @returns Unique idempotency key
 */
export function generateIdempotencyKey(operation: string, resourceId: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(4).toString('hex');
  return `event-svc:${operation}:${resourceId}:${timestamp}:${nonce}`;
}

/**
 * Get idempotency headers for a specific operation.
 * Only adds Idempotency-Key for mutating operations.
 * 
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param operation - Operation name for the idempotency key
 * @param resourceId - Resource ID for the idempotency key
 * @returns Headers object with Idempotency-Key if applicable
 */
function getIdempotencyHeaders(
  method: string,
  operation: string,
  resourceId: string
): Record<string, string> {
  // Only add idempotency headers for mutating operations
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(method.toUpperCase())) {
    return {};
  }

  return {
    'Idempotency-Key': generateIdempotencyKey(operation, resourceId),
  };
}

/**
 * Venue Service Client
 * 
 * CRITICAL FIX for audit findings:
 * - Uses S2S authentication instead of passing user tokens
 * - Uses dedicated service credentials
 * - Includes retry logic with exponential backoff
 * - Circuit breaker for fault tolerance
 * - HTTPS enforced in production (NS5)
 */

/**
 * Validate and normalize service URL
 * Enforces HTTPS in production environment
 */
function validateServiceUrl(url: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const parsedUrl = new URL(url);
  
  // In production, enforce HTTPS unless explicitly allowed
  if (isProduction && parsedUrl.protocol === 'http:') {
    const allowInsecure = process.env.ALLOW_INSECURE_SERVICE_CALLS === 'true';
    if (!allowInsecure) {
      // Convert HTTP to HTTPS in production
      parsedUrl.protocol = 'https:';
      logger.warn({ 
        originalUrl: url, 
        secureUrl: parsedUrl.toString() 
      }, 'Converting HTTP to HTTPS for production service call');
      return parsedUrl.toString().replace(/\/$/, ''); // Remove trailing slash
    }
    logger.warn({ url }, 'INSECURE: HTTP service call allowed in production - this is not recommended');
  }
  
  return url;
}

/**
 * Cached venue data for fallback when venue-service is unavailable
 */
interface CachedVenue {
  id: string;
  name: string;
  max_capacity: number;
  timezone?: string;
  cached_at: number;
}

/**
 * AUDIT FIX (MT-Redis): Simple in-memory cache for venue data fallback
 * 
 * Cache key format: `${tenantId}:${venueId}`
 * This ensures tenant isolation in the cache to prevent cross-tenant data leakage.
 */
const venueCache = new Map<string, CachedVenue>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key with tenant prefix for tenant isolation
 */
function getCacheKey(tenantId: string, venueId: string): string {
  return `${tenantId}:${venueId}`;
}

export class VenueServiceClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;
  private serviceIdentity: ReturnType<typeof getServiceIdentity>;
  private isDegraded: boolean = false;

  constructor() {
    // Get base URL and validate for production HTTPS enforcement
    const rawUrl = config.services?.venueServiceUrl || process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
    this.baseUrl = validateServiceUrl(rawUrl);
    this.serviceIdentity = getServiceIdentity();

    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
    };

    // CRITICAL FIX: Create circuit breaker with fallback function
    this.circuitBreaker = new CircuitBreaker(this.requestWithRetry.bind(this), options);

    // Log circuit breaker events
    this.circuitBreaker.on('open', () => {
      this.isDegraded = true;
      logger.warn({ service: 'venue-service' }, 'Circuit breaker opened - entering degraded mode');
    });
    this.circuitBreaker.on('halfOpen', () => {
      logger.info({ service: 'venue-service' }, 'Circuit breaker half-open - testing venue-service');
    });
    this.circuitBreaker.on('close', () => {
      this.isDegraded = false;
      logger.info({ service: 'venue-service' }, 'Circuit breaker closed - normal operation resumed');
    });
    this.circuitBreaker.on('fallback', (result) => {
      logger.info({ service: 'venue-service', result }, 'Using fallback response');
    });
  }

  /**
   * Check if service is in degraded mode
   */
  isInDegradedMode(): boolean {
    return this.isDegraded;
  }

  /**
   * AUDIT FIX (MT-Redis): Get cached venue data or null
   * Now uses tenant-prefixed keys for tenant isolation.
   * 
   * @param tenantId - The tenant ID for cache key
   * @param venueId - The venue ID
   * @returns Cached venue data or null
   */
  private getCachedVenue(tenantId: string, venueId: string): CachedVenue | null {
    const cacheKey = getCacheKey(tenantId, venueId);
    const cached = venueCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.cached_at > CACHE_TTL_MS) {
      venueCache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  /**
   * AUDIT FIX (MT-Redis): Cache venue data for fallback
   * Now uses tenant-prefixed keys for tenant isolation.
   * 
   * @param tenantId - The tenant ID for cache key
   * @param venue - The venue data to cache
   */
  private cacheVenue(tenantId: string, venue: any): void {
    if (!venue?.id || !tenantId) return;
    
    const cacheKey = getCacheKey(tenantId, venue.id);
    venueCache.set(cacheKey, {
      id: venue.id,
      name: venue.name || 'Unknown Venue',
      max_capacity: venue.max_capacity || 10000, // Default high capacity
      timezone: venue.timezone,
      cached_at: Date.now(),
    });
  }

  /**
   * Make HTTP request with retry logic
   */
  private async requestWithRetry(path: string, options: any = {}): Promise<any> {
    return withRetry(
      () => this.request(path, options),
      {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        operationName: `venue-service:${path}`,
        retryOn: (error: any) => {
          // Don't retry 4xx errors (except 429)
          if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            return false;
          }
          return isRetryableError(error);
        },
      }
    );
  }

  /**
   * Make HTTP request to venue service using S2S authentication
   */
  private async request(path: string, options: any = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;

    try {
      // Get S2S headers for service authentication
      const s2sHeaders = getS2SHeaders();

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...s2sHeaders,  // S2S authentication headers
          ...options.headers,  // Allow override for tenant context
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Venue service error: ${response.status}`);
        (error as any).status = response.status;
        (error as any).body = errorText;
        throw error;
      }

      return response.json();
    } catch (error: any) {
      logger.error({
        error: error.message,
        url,
        status: error.status,
        serviceId: this.serviceIdentity.serviceId,
      }, 'Venue service request failed');
      throw error;
    }
  }

  /**
   * Validate venue access for a tenant
   * 
   * Uses S2S authentication to verify venue exists and tenant has access.
   * CRITICAL FIX: Falls back to cached data when venue-service is unavailable.
   */
  async validateVenueAccess(venueId: string, tenantId: string): Promise<boolean> {
    try {
      const venue = await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'X-Tenant-ID': tenantId,
        },
      });

      // Cache successful response for fallback (tenant-aware)
      this.cacheVenue(tenantId, venue);

      logger.info({
        venueId,
        tenantId,
        exists: true,
      }, 'Venue exists and accessible');
      return true;
    } catch (error: any) {
      // CRITICAL FIX: Circuit breaker fallback - use cached data
      if (this.isDegraded || error.message?.includes('Breaker is open')) {
        const cached = this.getCachedVenue(tenantId, venueId);
        if (cached) {
          logger.warn({
            venueId,
            tenantId,
            fallback: 'cache',
          }, 'Venue validation using cached data (venue-service unavailable)');
          return true;
        }
        
        // No cache available - allow with warning for degraded mode
        logger.warn({
          venueId,
          tenantId,
          fallback: 'allow-degraded',
        }, 'Venue validation skipped - venue-service unavailable and no cache');
        return true; // Allow operation in degraded mode
      }

      logger.error({
        error: error.message,
        venueId,
        tenantId,
        status: error.status,
      }, 'Venue validation failed');

      if (error.status === 404 || error.message?.includes('404')) {
        throw new NotFoundError('Venue');
      } else if (error.status === 403 || error.message?.includes('403')) {
        throw new ForbiddenError('No access to this venue');
      }

      throw new ValidationError([{ field: 'venue_id', message: 'Invalid venue or no access' }]);
    }
  }

  /**
   * Get venue details
   * 
   * Uses S2S authentication with tenant context.
   * CRITICAL FIX: Falls back to cached data when venue-service is unavailable.
   */
  async getVenue(venueId: string, tenantId: string): Promise<any> {
    try {
      const venue = await this.circuitBreaker.fire(`/api/v1/venues/${venueId}`, {
        headers: {
          'X-Tenant-ID': tenantId,
        },
      });

      // Cache successful response for fallback (tenant-aware)
      this.cacheVenue(tenantId, venue);
      return venue;
    } catch (error: any) {
      // CRITICAL FIX: Circuit breaker fallback - use cached data
      if (this.isDegraded || error.message?.includes('Breaker is open')) {
        const cached = this.getCachedVenue(tenantId, venueId);
        if (cached) {
          logger.warn({
            venueId,
            tenantId,
            fallback: 'cache',
          }, 'Returning cached venue data (venue-service unavailable)');
          return {
            id: cached.id,
            name: cached.name,
            max_capacity: cached.max_capacity,
            timezone: cached.timezone || 'UTC',
            _cached: true,
            _cached_at: new Date(cached.cached_at).toISOString(),
          };
        }
        
        // No cache available - return default response for degraded mode
        logger.warn({
          venueId,
          tenantId,
          fallback: 'default',
        }, 'Returning default venue data - venue-service unavailable and no cache');
        return {
          id: venueId,
          name: 'Venue (Service Unavailable)',
          max_capacity: 100000, // High default to not block operations
          timezone: 'UTC',
          _degraded: true,
        };
      }

      logger.error({
        error: error.message,
        venueId,
        tenantId,
        status: error.status,
      }, 'Failed to get venue details');

      if (error.status === 404 || error.message?.includes('404')) {
        throw new NotFoundError('Venue');
      } else if (error.status === 403 || error.message?.includes('403')) {
        throw new ForbiddenError('No access to this venue');
      }

      throw new ValidationError([{ field: 'venue_id', message: 'Failed to retrieve venue details' }]);
    }
  }

  /**
   * Check if venue service is healthy (for dependency checks)
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const s2sHeaders = getS2SHeaders();
      const response = await fetch(`${this.baseUrl}/health/live`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...s2sHeaders,
        },
        timeout: 3000,
      } as any);

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: string;
    stats: {
      failures: number;
      successes: number;
      timeouts: number;
    };
  } {
    return {
      state: this.circuitBreaker.status.toString(),
      stats: {
        failures: (this.circuitBreaker as any).stats?.failures || 0,
        successes: (this.circuitBreaker as any).stats?.successes || 0,
        timeouts: (this.circuitBreaker as any).stats?.timeouts || 0,
      },
    };
  }
}

export const venueServiceClient = new VenueServiceClient();
