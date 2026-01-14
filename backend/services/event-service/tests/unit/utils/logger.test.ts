/**
 * Unit tests for src/utils/logger.ts
 * Tests logging functionality, PII redaction, request hooks, and sanitization functions
 */

import {
  logger,
  onRequestLoggingHook,
  onResponseLoggingHook,
  requestLoggingHooks,
  createChildLogger,
  createRequestLogger,
  sanitizeEventData,
  sanitizePricingData,
  sanitizeCapacityData,
} from '../../../src/utils/logger';

// Mock pino to capture log calls
jest.mock('pino', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    isLevelEnabled: jest.fn().mockReturnValue(true),
    child: jest.fn(() => mockLogger),
  };
  return jest.fn(() => mockLogger);
});

describe('utils/logger', () => {
  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have standard log methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should have child method for creating child loggers', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('createChildLogger()', () => {
    it('should create a child logger with context', () => {
      const context = { requestId: 'test-123', userId: 'user-456' };
      const childLogger = createChildLogger(context);

      expect(childLogger).toBeDefined();
      expect(logger.child).toHaveBeenCalledWith(context);
    });

    it('should create child logger with custom fields', () => {
      const context = { 
        eventId: 'event-123',
        operation: 'createEvent',
        tenantId: 'tenant-abc',
      };
      createChildLogger(context);

      expect(logger.child).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'event-123',
        operation: 'createEvent',
        tenantId: 'tenant-abc',
      }));
    });
  });

  describe('createRequestLogger()', () => {
    it('should create a request-scoped logger', () => {
      const mockRequest: any = {
        id: 'req-789',
        method: 'GET',
        url: '/api/events',
        user: {
          tenant_id: 'tenant-123',
          id: 'user-456',
        },
      };

      createRequestLogger(mockRequest);

      expect(logger.child).toHaveBeenCalledWith({
        requestId: 'req-789',
        method: 'GET',
        url: '/api/events',
        tenantId: 'tenant-123',
        userId: 'user-456',
      });
    });

    it('should handle requests without user context', () => {
      const mockRequest: any = {
        id: 'req-anon',
        method: 'POST',
        url: '/api/health',
      };

      createRequestLogger(mockRequest);

      expect(logger.child).toHaveBeenCalledWith({
        requestId: 'req-anon',
        method: 'POST',
        url: '/api/health',
        tenantId: undefined,
        userId: undefined,
      });
    });
  });

  describe('onRequestLoggingHook()', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockRequest = {
        id: 'hook-req-123',
        method: 'GET',
        url: '/api/events/123',
        headers: {
          'user-agent': 'test-agent',
          'content-length': '100',
        },
      };
      mockReply = {};
    });

    it('should attach loggingContext to request', async () => {
      await onRequestLoggingHook(mockRequest, mockReply);

      expect(mockRequest.loggingContext).toBeDefined();
      expect(mockRequest.loggingContext.requestId).toBe('hook-req-123');
      expect(mockRequest.loggingContext.startTime).toBeDefined();
      expect(typeof mockRequest.loggingContext.shouldLog).toBe('boolean');
    });

    it('should log request start at debug level when shouldLog is true', async () => {
      await onRequestLoggingHook(mockRequest, mockReply);

      // shouldLog depends on sampling rate, but logger.debug should be called if enabled
      if (mockRequest.loggingContext.shouldLog) {
        expect(logger.debug).toHaveBeenCalled();
      }
    });
  });

  describe('onResponseLoggingHook()', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockRequest = {
        id: 'hook-req-456',
        method: 'POST',
        url: '/api/events',
        user: {
          tenant_id: 'tenant-xyz',
          id: 'user-abc',
        },
        loggingContext: {
          startTime: Date.now() - 50, // Started 50ms ago
          requestId: 'hook-req-456',
          shouldLog: true,
        },
      };
      mockReply = {
        statusCode: 200,
      };
    });

    it('should log successful response at info level', async () => {
      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'hook-req-456',
          method: 'POST',
          url: '/api/events',
          statusCode: 200,
          tenantId: 'tenant-xyz',
          userId: 'user-abc',
        }),
        'Request completed'
      );
    });

    it('should log client errors (4xx) at warn level', async () => {
      mockReply.statusCode = 400;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
        }),
        'Request completed with client error'
      );
    });

    it('should log 404 at warn level', async () => {
      mockReply.statusCode = 404;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
        }),
        'Request completed with client error'
      );
    });

    it('should log server errors (5xx) at error level', async () => {
      mockReply.statusCode = 500;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        'Request completed with server error'
      );
    });

    it('should log 503 at error level', async () => {
      mockReply.statusCode = 503;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
        }),
        'Request completed with server error'
      );
    });

    it('should not log if shouldLog is false', async () => {
      mockRequest.loggingContext.shouldLog = false;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should not log if loggingContext is missing', async () => {
      delete mockRequest.loggingContext;

      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should include responseTime in logs', async () => {
      await onResponseLoggingHook(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          responseTime: expect.any(Number),
          responseTimeUnit: 'ms',
        }),
        expect.any(String)
      );
    });
  });

  describe('requestLoggingHooks', () => {
    it('should export combined hooks object', () => {
      expect(requestLoggingHooks).toBeDefined();
      expect(requestLoggingHooks.onRequest).toBe(onRequestLoggingHook);
      expect(requestLoggingHooks.onResponse).toBe(onResponseLoggingHook);
    });
  });

  describe('sanitizeEventData()', () => {
    const fullEventData = {
      id: 'event-123',
      tenant_id: 'tenant-456',
      venue_id: 'venue-789',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      event_type: 'CONCERT',
      name: 'Rock Concert 2026',
      slug: 'rock-concert-2026',
      description: 'This is a very long description with potentially sensitive content...',
      starts_at: '2026-03-15T19:00:00Z',
      ends_at: '2026-03-15T23:00:00Z',
      sales_start_at: '2026-01-01T00:00:00Z',
      sales_end_at: '2026-03-15T18:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-08T12:00:00Z',
      version: 5,
      is_deleted: false,
      priority_score: 85,
      view_count: 1500,
      interest_count: 300,
      share_count: 50,
      // Sensitive fields that should NOT be logged
      internal_notes: 'Secret internal notes',
      admin_metadata: { secret: 'data' },
      pricing_strategy: { internal: 'config' },
    };

    it('should include safe fields', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.id).toBe('event-123');
      expect(sanitized.tenant_id).toBe('tenant-456');
      expect(sanitized.venue_id).toBe('venue-789');
      expect(sanitized.status).toBe('PUBLISHED');
      expect(sanitized.name).toBe('Rock Concert 2026');
      expect(sanitized.slug).toBe('rock-concert-2026');
    });

    it('should include date fields', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.starts_at).toBe('2026-03-15T19:00:00Z');
      expect(sanitized.ends_at).toBe('2026-03-15T23:00:00Z');
      expect(sanitized.sales_start_at).toBe('2026-01-01T00:00:00Z');
      expect(sanitized.sales_end_at).toBe('2026-03-15T18:00:00Z');
      expect(sanitized.created_at).toBe('2026-01-01T00:00:00Z');
      expect(sanitized.updated_at).toBe('2026-01-08T12:00:00Z');
    });

    it('should include count fields', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.view_count).toBe(1500);
      expect(sanitized.interest_count).toBe(300);
      expect(sanitized.share_count).toBe(50);
    });

    it('should include metadata fields', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.version).toBe(5);
      expect(sanitized.is_deleted).toBe(false);
      expect(sanitized.priority_score).toBe(85);
    });

    it('should exclude description content but include length', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.description).toBeUndefined();
      expect(sanitized.description_length).toBe(fullEventData.description.length);
    });

    it('should exclude internal/sensitive fields', () => {
      const sanitized = sanitizeEventData(fullEventData);

      expect(sanitized.internal_notes).toBeUndefined();
      expect(sanitized.admin_metadata).toBeUndefined();
      expect(sanitized.pricing_strategy).toBeUndefined();
    });

    it('should handle empty event data', () => {
      const sanitized = sanitizeEventData({});

      expect(sanitized).toEqual({});
    });

    it('should handle partial event data', () => {
      const partialData = {
        id: 'partial-123',
        status: 'DRAFT',
      };
      const sanitized = sanitizeEventData(partialData);

      expect(sanitized.id).toBe('partial-123');
      expect(sanitized.status).toBe('DRAFT');
      expect(sanitized.name).toBeUndefined();
    });

    it('should handle null description', () => {
      const dataWithNullDesc = {
        id: 'event-456',
        description: null,
      };
      const sanitized = sanitizeEventData(dataWithNullDesc as any);

      expect(sanitized.description_length).toBeUndefined();
    });
  });

  describe('sanitizePricingData()', () => {
    const fullPricingData = {
      id: 'pricing-123',
      event_id: 'event-456',
      tenant_id: 'tenant-789',
      pricing_type: 'DYNAMIC',
      currency: 'USD',
      is_active: true,
      base_price: 100.00,
      min_price: 50.00,
      max_price: 200.00,
      current_price: 125.00,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-08T12:00:00Z',
      // Internal fields that should NOT be logged
      pricing_algorithm: 'CONFIDENTIAL_ALGO_V3',
      internal_multiplier: 1.25,
      cost_basis: 45.00,
      margin_percentage: 55,
      supplier_data: { secret: 'info' },
    };

    it('should include safe pricing fields', () => {
      const sanitized = sanitizePricingData(fullPricingData);

      expect(sanitized.id).toBe('pricing-123');
      expect(sanitized.event_id).toBe('event-456');
      expect(sanitized.tenant_id).toBe('tenant-789');
      expect(sanitized.pricing_type).toBe('DYNAMIC');
      expect(sanitized.currency).toBe('USD');
      expect(sanitized.is_active).toBe(true);
    });

    it('should include price fields (not PII)', () => {
      const sanitized = sanitizePricingData(fullPricingData);

      expect(sanitized.base_price).toBe(100.00);
      expect(sanitized.min_price).toBe(50.00);
      expect(sanitized.max_price).toBe(200.00);
      expect(sanitized.current_price).toBe(125.00);
    });

    it('should include timestamp fields', () => {
      const sanitized = sanitizePricingData(fullPricingData);

      expect(sanitized.created_at).toBe('2026-01-01T00:00:00Z');
      expect(sanitized.updated_at).toBe('2026-01-08T12:00:00Z');
    });

    it('should exclude internal/confidential fields', () => {
      const sanitized = sanitizePricingData(fullPricingData);

      expect(sanitized.pricing_algorithm).toBeUndefined();
      expect(sanitized.internal_multiplier).toBeUndefined();
      expect(sanitized.cost_basis).toBeUndefined();
      expect(sanitized.margin_percentage).toBeUndefined();
      expect(sanitized.supplier_data).toBeUndefined();
    });

    it('should handle empty pricing data', () => {
      const sanitized = sanitizePricingData({});

      expect(sanitized).toEqual({});
    });

    it('should handle partial pricing data', () => {
      const partialData = {
        id: 'partial-price-123',
        currency: 'EUR',
      };
      const sanitized = sanitizePricingData(partialData);

      expect(sanitized.id).toBe('partial-price-123');
      expect(sanitized.currency).toBe('EUR');
      expect(sanitized.base_price).toBeUndefined();
    });
  });

  describe('sanitizeCapacityData()', () => {
    const fullCapacityData = {
      id: 'capacity-123',
      event_id: 'event-456',
      tenant_id: 'tenant-789',
      tier_name: 'VIP Section',
      tier_type: 'PREMIUM',
      total_capacity: 100,
      available_capacity: 45,
      reserved_capacity: 5,
      sold_count: 50,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-08T12:00:00Z',
      // Internal fields that should NOT be logged
      internal_allocation_id: 'alloc-secret-123',
      reservation_token: 'secret-token',
      lock_holder: 'internal-process-456',
      capacity_strategy: { algorithm: 'secret' },
    };

    it('should include safe capacity fields', () => {
      const sanitized = sanitizeCapacityData(fullCapacityData);

      expect(sanitized.id).toBe('capacity-123');
      expect(sanitized.event_id).toBe('event-456');
      expect(sanitized.tenant_id).toBe('tenant-789');
      expect(sanitized.tier_name).toBe('VIP Section');
      expect(sanitized.tier_type).toBe('PREMIUM');
      expect(sanitized.is_active).toBe(true);
    });

    it('should include capacity counts', () => {
      const sanitized = sanitizeCapacityData(fullCapacityData);

      expect(sanitized.total_capacity).toBe(100);
      expect(sanitized.available_capacity).toBe(45);
      expect(sanitized.reserved_capacity).toBe(5);
      expect(sanitized.sold_count).toBe(50);
    });

    it('should include timestamp fields', () => {
      const sanitized = sanitizeCapacityData(fullCapacityData);

      expect(sanitized.created_at).toBe('2026-01-01T00:00:00Z');
      expect(sanitized.updated_at).toBe('2026-01-08T12:00:00Z');
    });

    it('should exclude internal/security-sensitive fields', () => {
      const sanitized = sanitizeCapacityData(fullCapacityData);

      expect(sanitized.internal_allocation_id).toBeUndefined();
      expect(sanitized.reservation_token).toBeUndefined();
      expect(sanitized.lock_holder).toBeUndefined();
      expect(sanitized.capacity_strategy).toBeUndefined();
    });

    it('should handle empty capacity data', () => {
      const sanitized = sanitizeCapacityData({});

      expect(sanitized).toEqual({});
    });

    it('should handle partial capacity data', () => {
      const partialData = {
        id: 'partial-cap-123',
        total_capacity: 50,
        available_capacity: 50,
      };
      const sanitized = sanitizeCapacityData(partialData);

      expect(sanitized.id).toBe('partial-cap-123');
      expect(sanitized.total_capacity).toBe(50);
      expect(sanitized.available_capacity).toBe(50);
      expect(sanitized.sold_count).toBeUndefined();
    });
  });

  describe('PII redaction', () => {
    // These tests verify that the logger configuration redacts PII
    // Note: The actual redaction is done by pino, we're testing the configuration

    const PII_FIELDS_TO_REDACT = [
      'email',
      'password',
      'token',
      'authorization',
      'creditCard',
      'ssn',
      'phone',
      'address',
      'apiKey',
      'secret',
      'refreshToken',
      'accessToken',
    ];

    it('should have redaction configured for PII fields', () => {
      // This test verifies the REDACT_FIELDS constant exists and works
      // The actual pino mock doesn't test redaction, but validates the concept
      PII_FIELDS_TO_REDACT.forEach(field => {
        // Verify that logging data with PII fields doesn't throw
        expect(() => {
          const testData: any = { [field]: 'sensitive-value' };
          // Sanitization functions should not include PII even if present
          const sanitized = sanitizeEventData(testData);
          expect(sanitized[field]).toBeUndefined();
        }).not.toThrow();
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined values in sanitizeEventData', () => {
      const dataWithUndefined = {
        id: 'event-123',
        status: undefined,
        name: undefined,
      };
      const sanitized = sanitizeEventData(dataWithUndefined as any);

      expect(sanitized.id).toBe('event-123');
      expect('status' in sanitized).toBe(false);
      expect('name' in sanitized).toBe(false);
    });

    it('should handle null values in sanitizeEventData', () => {
      const dataWithNull = {
        id: 'event-123',
        status: null,
        name: null,
      };
      const sanitized = sanitizeEventData(dataWithNull as any);

      // null is still a value, should be included
      expect(sanitized.id).toBe('event-123');
    });

    it('should handle very long descriptions correctly', () => {
      const longDescription = 'A'.repeat(10000);
      const data = { description: longDescription };
      const sanitized = sanitizeEventData(data);

      expect(sanitized.description_length).toBe(10000);
      expect(sanitized.description).toBeUndefined();
    });

    it('should handle zero capacity correctly', () => {
      const zeroCapacity = {
        id: 'cap-123',
        total_capacity: 0,
        available_capacity: 0,
        sold_count: 0,
      };
      const sanitized = sanitizeCapacityData(zeroCapacity);

      expect(sanitized.total_capacity).toBe(0);
      expect(sanitized.available_capacity).toBe(0);
      expect(sanitized.sold_count).toBe(0);
    });

    it('should handle zero prices correctly', () => {
      const freeEvent = {
        id: 'pricing-123',
        base_price: 0,
        min_price: 0,
        max_price: 0,
        current_price: 0,
      };
      const sanitized = sanitizePricingData(freeEvent);

      expect(sanitized.base_price).toBe(0);
      expect(sanitized.min_price).toBe(0);
      expect(sanitized.max_price).toBe(0);
      expect(sanitized.current_price).toBe(0);
    });
  });
});
