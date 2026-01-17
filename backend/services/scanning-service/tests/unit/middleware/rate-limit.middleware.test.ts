// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/rate-limit.middleware.ts
 */

describe('src/middleware/rate-limit.middleware.ts - Comprehensive Unit Tests', () => {
  let rateLimitMiddleware: any;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Import module under test
    rateLimitMiddleware = require('../../../src/middleware/rate-limit.middleware');

    // Mock request
    mockRequest = {
      ip: '192.168.1.100',
      body: {},
    };
  });

  // =============================================================================
  // createRateLimiter()
  // =============================================================================

  describe('createRateLimiter()', () => {
    it('should create rate limiter with default options', () => {
      const limiter = rateLimitMiddleware.createRateLimiter();

      expect(limiter.global).toBe(false);
      expect(limiter.max).toBe(100);
      expect(limiter.timeWindow).toBe(15 * 60 * 1000); // 15 minutes
    });

    it('should create rate limiter with custom max', () => {
      const limiter = rateLimitMiddleware.createRateLimiter({ max: 50 });

      expect(limiter.max).toBe(50);
    });

    it('should create rate limiter with custom time window', () => {
      const limiter = rateLimitMiddleware.createRateLimiter({ windowMs: 5000 });

      expect(limiter.timeWindow).toBe(5000);
    });

    it('should use custom key generator if provided', () => {
      const customKeyGen = jest.fn();
      const limiter = rateLimitMiddleware.createRateLimiter({ keyGenerator: customKeyGen });

      expect(limiter.keyGenerator).toBe(customKeyGen);
    });

    it('should use custom error response builder if provided', () => {
      const customBuilder = jest.fn(() => ({ custom: 'error' }));
      const limiter = rateLimitMiddleware.createRateLimiter({ errorResponseBuilder: customBuilder });

      expect(limiter.errorResponseBuilder).toBe(customBuilder);
    });

    it('should have default error response builder', () => {
      const limiter = rateLimitMiddleware.createRateLimiter();
      const error = limiter.errorResponseBuilder();

      expect(error).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
      });
    });

    it('should use custom message in error response', () => {
      const limiter = rateLimitMiddleware.createRateLimiter({ message: 'Custom message' });
      const error = limiter.errorResponseBuilder();

      expect(error.message).toBe('Custom message');
    });

    it('should merge additional options', () => {
      const limiter = rateLimitMiddleware.createRateLimiter({ 
        max: 25,
        customOption: 'value' 
      });

      expect(limiter.max).toBe(25);
      expect(limiter.customOption).toBe('value');
    });
  });

  // =============================================================================
  // apiRateLimiter
  // =============================================================================

  describe('apiRateLimiter', () => {
    it('should be configured with default values', () => {
      const limiter = rateLimitMiddleware.apiRateLimiter;

      expect(limiter.max).toBe(100);
      expect(limiter.timeWindow).toBe(15 * 60 * 1000);
      expect(limiter.global).toBe(false);
    });

    it('should have default error response', () => {
      const limiter = rateLimitMiddleware.apiRateLimiter;
      const error = limiter.errorResponseBuilder();

      expect(error.statusCode).toBe(429);
      expect(error.error).toBe('Too Many Requests');
    });
  });

  // =============================================================================
  // scanRateLimiter
  // =============================================================================

  describe('scanRateLimiter', () => {
    it('should be configured for strict scanning limits', () => {
      const limiter = rateLimitMiddleware.scanRateLimiter;

      expect(limiter.max).toBe(10);
      expect(limiter.timeWindow).toBe(1 * 60 * 1000); // 1 minute
    });

    it('should return scan-specific error response', () => {
      const limiter = rateLimitMiddleware.scanRateLimiter;
      const error = limiter.errorResponseBuilder();

      expect(error).toEqual({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many scan attempts. Please wait before trying again.',
      });
    });

    it('should generate key from IP and device ID', () => {
      const limiter = rateLimitMiddleware.scanRateLimiter;
      mockRequest.body = { device_id: 'device-123' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('192.168.1.100:device-123');
    });

    it('should use unknown when device ID missing', () => {
      const limiter = rateLimitMiddleware.scanRateLimiter;

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('192.168.1.100:unknown');
    });

    it('should handle different IPs with same device', () => {
      const limiter = rateLimitMiddleware.scanRateLimiter;
      mockRequest.body = { device_id: 'device-123' };

      const key1 = limiter.keyGenerator(mockRequest);
      
      mockRequest.ip = '192.168.1.200';
      const key2 = limiter.keyGenerator(mockRequest);

      expect(key1).not.toBe(key2);
      expect(key1).toBe('192.168.1.100:device-123');
      expect(key2).toBe('192.168.1.200:device-123');
    });
  });

  // =============================================================================
  // deviceRateLimiter
  // =============================================================================

  describe('deviceRateLimiter', () => {
    it('should be configured for device-specific limits', () => {
      const limiter = rateLimitMiddleware.deviceRateLimiter;

      expect(limiter.max).toBe(50);
      expect(limiter.timeWindow).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('should generate key from device ID', () => {
      const limiter = rateLimitMiddleware.deviceRateLimiter;
      mockRequest.body = { device_id: 'device-456' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('device-456');
    });

    it('should fallback to IP when device ID missing', () => {
      const limiter = rateLimitMiddleware.deviceRateLimiter;

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('192.168.1.100');
    });

    it('should use same key for same device across different IPs', () => {
      const limiter = rateLimitMiddleware.deviceRateLimiter;
      mockRequest.body = { device_id: 'device-789' };

      const key1 = limiter.keyGenerator(mockRequest);
      
      mockRequest.ip = '10.0.0.50';
      const key2 = limiter.keyGenerator(mockRequest);

      expect(key1).toBe(key2);
      expect(key1).toBe('device-789');
    });
  });

  // =============================================================================
  // staffRateLimiter
  // =============================================================================

  describe('staffRateLimiter', () => {
    it('should be configured for staff-specific limits', () => {
      const limiter = rateLimitMiddleware.staffRateLimiter;

      expect(limiter.max).toBe(30);
      expect(limiter.timeWindow).toBe(1 * 60 * 1000); // 1 minute
    });

    it('should generate key from staff user ID', () => {
      const limiter = rateLimitMiddleware.staffRateLimiter;
      mockRequest.body = { staff_user_id: 'staff-123' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('staff-123');
    });

    it('should fallback to IP when staff user ID missing', () => {
      const limiter = rateLimitMiddleware.staffRateLimiter;

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('192.168.1.100');
    });

    it('should use same key for same staff across different IPs', () => {
      const limiter = rateLimitMiddleware.staffRateLimiter;
      mockRequest.body = { staff_user_id: 'staff-456' };

      const key1 = limiter.keyGenerator(mockRequest);
      
      mockRequest.ip = '172.16.0.10';
      const key2 = limiter.keyGenerator(mockRequest);

      expect(key1).toBe(key2);
      expect(key1).toBe('staff-456');
    });
  });

  // =============================================================================
  // failedAttemptLimiter
  // =============================================================================

  describe('failedAttemptLimiter', () => {
    it('should be configured for failed attempts tracking', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;

      expect(limiter.max).toBe(5);
      expect(limiter.timeWindow).toBe(10 * 60 * 1000); // 10 minutes
    });

    it('should skip successful requests', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;

      expect(limiter.skipSuccessfulRequests).toBe(true);
    });

    it('should return account locked error response', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      const error = limiter.errorResponseBuilder();

      expect(error).toEqual({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many failed scan attempts. Account temporarily locked.',
      });
    });

    it('should generate composite key from IP, device, and staff', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      mockRequest.body = { 
        device_id: 'device-123',
        staff_user_id: 'staff-456'
      };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('failed:192.168.1.100:device-123:staff-456');
    });

    it('should use unknown for missing device ID', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      mockRequest.body = { staff_user_id: 'staff-456' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('failed:192.168.1.100:unknown:staff-456');
    });

    it('should use unknown for missing staff user ID', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      mockRequest.body = { device_id: 'device-123' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('failed:192.168.1.100:device-123:unknown');
    });

    it('should use unknown for both when body empty', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toBe('failed:192.168.1.100:unknown:unknown');
    });

    it('should generate different keys for different IPs', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      mockRequest.body = { 
        device_id: 'device-123',
        staff_user_id: 'staff-456'
      };

      const key1 = limiter.keyGenerator(mockRequest);
      
      mockRequest.ip = '10.0.0.1';
      const key2 = limiter.keyGenerator(mockRequest);

      expect(key1).not.toBe(key2);
      expect(key1).toBe('failed:192.168.1.100:device-123:staff-456');
      expect(key2).toBe('failed:10.0.0.1:device-123:staff-456');
    });

    it('should prefix key with "failed:"', () => {
      const limiter = rateLimitMiddleware.failedAttemptLimiter;
      mockRequest.body = { device_id: 'device-123' };

      const key = limiter.keyGenerator(mockRequest);

      expect(key).toMatch(/^failed:/);
    });
  });

  // =============================================================================
  // Integration Tests - Rate Limiter Configurations
  // =============================================================================

  describe('Rate Limiter Configurations', () => {
    it('should have scanRateLimiter stricter than apiRateLimiter', () => {
      const api = rateLimitMiddleware.apiRateLimiter;
      const scan = rateLimitMiddleware.scanRateLimiter;

      expect(scan.max).toBeLessThan(api.max);
      expect(scan.timeWindow).toBeLessThan(api.timeWindow);
    });

    it('should have failedAttemptLimiter strictest for security', () => {
      const scan = rateLimitMiddleware.scanRateLimiter;
      const failed = rateLimitMiddleware.failedAttemptLimiter;

      expect(failed.max).toBeLessThan(scan.max);
    });

    it('should have staffRateLimiter higher than scanRateLimiter', () => {
      const scan = rateLimitMiddleware.scanRateLimiter;
      const staff = rateLimitMiddleware.staffRateLimiter;

      expect(staff.max).toBeGreaterThan(scan.max);
    });

    it('should have deviceRateLimiter with longest window', () => {
      const scan = rateLimitMiddleware.scanRateLimiter;
      const staff = rateLimitMiddleware.staffRateLimiter;
      const device = rateLimitMiddleware.deviceRateLimiter;

      expect(device.timeWindow).toBeGreaterThan(scan.timeWindow);
      expect(device.timeWindow).toBeGreaterThan(staff.timeWindow);
    });

    it('all limiters should be non-global', () => {
      expect(rateLimitMiddleware.apiRateLimiter.global).toBe(false);
      expect(rateLimitMiddleware.scanRateLimiter.global).toBe(false);
      expect(rateLimitMiddleware.deviceRateLimiter.global).toBe(false);
      expect(rateLimitMiddleware.staffRateLimiter.global).toBe(false);
      expect(rateLimitMiddleware.failedAttemptLimiter.global).toBe(false);
    });
  });
});
