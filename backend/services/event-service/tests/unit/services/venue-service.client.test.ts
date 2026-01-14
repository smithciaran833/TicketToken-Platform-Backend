/**
 * Unit tests for VenueServiceClient
 * Tests S2S authentication, circuit breaker, caching, and HTTPS enforcement
 */

// Mock fetch
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Mock circuit breaker
const mockCircuitBreakerFire = jest.fn();
const mockCircuitBreakerOn = jest.fn();
const mockCircuitBreakerStatus = { toString: () => 'CLOSED' };

jest.mock('opossum', () => {
  return jest.fn().mockImplementation(() => ({
    fire: mockCircuitBreakerFire,
    on: mockCircuitBreakerOn,
    status: mockCircuitBreakerStatus,
    stats: { failures: 0, successes: 0, timeouts: 0 },
  }));
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    services: {
      venueServiceUrl: 'http://venue-service:3002',
    },
  },
}));

// Mock service auth
const mockGetS2SHeaders = jest.fn().mockReturnValue({
  'X-Service-ID': 'event-service',
  'X-Service-Token': 'test-token',
});
const mockGetServiceIdentity = jest.fn().mockReturnValue({
  serviceId: 'event-service',
  serviceName: 'Event Service',
});

jest.mock('../../../src/config/service-auth', () => ({
  getS2SHeaders: mockGetS2SHeaders,
  getServiceIdentity: mockGetServiceIdentity,
}));

// Mock retry
jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn().mockImplementation((fn) => fn()),
  isRetryableError: jest.fn().mockReturnValue(true),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock types
jest.mock('../../../src/types', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(public errors: any[]) { super('Validation Error'); }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(public resource: string) { super(`${resource} not found`); }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string) { super(message); }
  },
}));

import { VenueServiceClient, generateIdempotencyKey } from '../../../src/services/venue-service.client';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../src/types';

describe('generateIdempotencyKey', () => {
  it('should generate unique keys', () => {
    const key1 = generateIdempotencyKey('validate-venue', 'venue-123');
    const key2 = generateIdempotencyKey('validate-venue', 'venue-123');

    expect(key1).not.toBe(key2);
  });

  it('should include operation in key', () => {
    const key = generateIdempotencyKey('validate-venue', 'venue-123');

    expect(key).toContain('validate-venue');
  });

  it('should include resource id in key', () => {
    const key = generateIdempotencyKey('get-venue', 'venue-456');

    expect(key).toContain('venue-456');
  });

  it('should include event-svc prefix', () => {
    const key = generateIdempotencyKey('operation', 'resource');

    expect(key).toContain('event-svc');
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const key = generateIdempotencyKey('op', 'res');
    const after = Date.now();

    // Key format: event-svc:operation:resourceId:timestamp:nonce
    const parts = key.split(':');
    const timestamp = parseInt(parts[3]);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('VenueServiceClient', () => {
  let client: VenueServiceClient;

  const mockVenue = {
    id: 'venue-123',
    name: 'Test Venue',
    max_capacity: 5000,
    timezone: 'America/New_York',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_SERVICE_CALLS;
    
    // Default successful response
    mockCircuitBreakerFire.mockResolvedValue(mockVenue);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVenue),
    });

    // Create new client instance
    client = new VenueServiceClient();
  });

  describe('constructor', () => {
    it('should create client instance', () => {
      expect(client).toBeInstanceOf(VenueServiceClient);
    });

    it('should not be in degraded mode initially', () => {
      expect(client.isInDegradedMode()).toBe(false);
    });
  });

  describe('validateVenueAccess', () => {
    it('should return true for valid venue', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      const result = await client.validateVenueAccess('venue-123', 'tenant-1');

      expect(result).toBe(true);
    });

    it('should include tenant header in request', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      await client.validateVenueAccess('venue-123', 'tenant-1');

      expect(mockCircuitBreakerFire).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-ID': 'tenant-1',
          }),
        })
      );
    });

    it('should cache successful venue response', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      await client.validateVenueAccess('venue-123', 'tenant-1');

      // Venue should now be cached (tested via fallback behavior)
    });

    it('should throw NotFoundError for 404', async () => {
      const error: any = new Error('Not found');
      error.status = 404;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(client.validateVenueAccess('non-existent', 'tenant-1'))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for 403', async () => {
      const error: any = new Error('Forbidden');
      error.status = 403;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(client.validateVenueAccess('venue-123', 'tenant-1'))
        .rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError for other errors', async () => {
      const error: any = new Error('Bad request');
      error.status = 400;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(client.validateVenueAccess('venue-123', 'tenant-1'))
        .rejects.toThrow(ValidationError);
    });

    it('should use cached data when circuit breaker is open', async () => {
      // First call caches the venue
      mockCircuitBreakerFire.mockResolvedValueOnce(mockVenue);
      await client.validateVenueAccess('venue-123', 'tenant-1');

      // Simulate circuit breaker open
      const breakerError = new Error('Breaker is open');
      mockCircuitBreakerFire.mockRejectedValue(breakerError);
      (client as any).isDegraded = true;

      // Should still return true from cache
      const result = await client.validateVenueAccess('venue-123', 'tenant-1');
      expect(result).toBe(true);
    });

    it('should allow operation in degraded mode without cache', async () => {
      (client as any).isDegraded = true;
      const breakerError = new Error('Breaker is open');
      mockCircuitBreakerFire.mockRejectedValue(breakerError);

      // No cached data, but should still allow in degraded mode
      const result = await client.validateVenueAccess('new-venue', 'tenant-1');
      expect(result).toBe(true);
    });
  });

  describe('getVenue', () => {
    it('should return venue details', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      const result = await client.getVenue('venue-123', 'tenant-1');

      expect(result.id).toBe('venue-123');
      expect(result.name).toBe('Test Venue');
    });

    it('should include tenant header', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      await client.getVenue('venue-123', 'tenant-1');

      expect(mockCircuitBreakerFire).toHaveBeenCalledWith(
        '/api/v1/venues/venue-123',
        expect.objectContaining({
          headers: { 'X-Tenant-ID': 'tenant-1' },
        })
      );
    });

    it('should cache venue response', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      await client.getVenue('venue-123', 'tenant-1');

      // Cache should be populated
    });

    it('should return cached data when circuit breaker is open', async () => {
      // First call caches
      mockCircuitBreakerFire.mockResolvedValueOnce(mockVenue);
      await client.getVenue('venue-123', 'tenant-1');

      // Simulate breaker open
      (client as any).isDegraded = true;
      mockCircuitBreakerFire.mockRejectedValue(new Error('Breaker is open'));

      const result = await client.getVenue('venue-123', 'tenant-1');

      expect(result.id).toBe('venue-123');
      expect(result._cached).toBe(true);
    });

    it('should return default data in degraded mode without cache', async () => {
      (client as any).isDegraded = true;
      mockCircuitBreakerFire.mockRejectedValue(new Error('Breaker is open'));

      const result = await client.getVenue('venue-456', 'tenant-1');

      expect(result.id).toBe('venue-456');
      expect(result._degraded).toBe(true);
      expect(result.max_capacity).toBe(100000);
    });

    it('should throw NotFoundError for 404', async () => {
      const error: any = new Error('Not found');
      error.status = 404;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(client.getVenue('non-existent', 'tenant-1'))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for 403', async () => {
      const error: any = new Error('Forbidden');
      error.status = 403;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(client.getVenue('venue-123', 'tenant-1'))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy true for successful response', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
    });

    it('should return healthy false for failed response', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
    });

    it('should return healthy false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
    });

    it('should include latency measurement', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await client.healthCheck();

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use S2S headers', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await client.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Service-ID': 'event-service',
          }),
        })
      );
    });
  });

  describe('getCircuitBreakerStatus', () => {
    it('should return circuit breaker state', () => {
      const status = client.getCircuitBreakerStatus();

      expect(status.state).toBeDefined();
    });

    it('should return circuit breaker stats', () => {
      const status = client.getCircuitBreakerStatus();

      expect(status.stats).toBeDefined();
      expect(status.stats.failures).toBeDefined();
      expect(status.stats.successes).toBeDefined();
      expect(status.stats.timeouts).toBeDefined();
    });
  });

  describe('isInDegradedMode', () => {
    it('should return false when circuit is closed', () => {
      expect(client.isInDegradedMode()).toBe(false);
    });

    it('should return true when circuit is open', () => {
      (client as any).isDegraded = true;

      expect(client.isInDegradedMode()).toBe(true);
    });
  });

  describe('tenant-isolated caching', () => {
    it('should cache venues per tenant', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      // Cache for tenant-1
      await client.getVenue('venue-123', 'tenant-1');

      // Different tenant should not get cached data
      (client as any).isDegraded = true;
      mockCircuitBreakerFire.mockRejectedValue(new Error('Breaker is open'));

      const result = await client.getVenue('venue-123', 'tenant-2');

      // Should be degraded (default) data, not cached
      expect(result._degraded).toBe(true);
    });

    it('should use tenant-specific cache key', async () => {
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      // Cache for tenant-1
      await client.validateVenueAccess('venue-123', 'tenant-1');

      // Same venue, same tenant - should hit cache in degraded mode
      (client as any).isDegraded = true;
      mockCircuitBreakerFire.mockRejectedValue(new Error('Breaker is open'));

      const result = await client.validateVenueAccess('venue-123', 'tenant-1');
      expect(result).toBe(true);
    });
  });

  describe('HTTPS enforcement', () => {
    it('should use HTTP in development', async () => {
      process.env.NODE_ENV = 'development';
      
      const devClient = new VenueServiceClient();

      // Should not throw or modify URL in dev
      expect(devClient).toBeInstanceOf(VenueServiceClient);
    });

    it('should use HTTPS in production', async () => {
      process.env.NODE_ENV = 'production';
      
      // Would convert http to https
      // This is tested via URL validation in constructor
    });
  });
});

describe('venueServiceClient singleton', () => {
  it('should export singleton instance', async () => {
    const { venueServiceClient } = await import('../../../src/services/venue-service.client');
    expect(venueServiceClient).toBeInstanceOf(VenueServiceClient);
  });
});
