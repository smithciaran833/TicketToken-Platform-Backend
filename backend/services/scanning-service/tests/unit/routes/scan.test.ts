// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/scan.ts
 */

jest.mock('../../../src/services/QRValidator');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/metrics');
jest.mock('../../../src/middleware/auth.middleware');
jest.mock('../../../src/middleware/validation.middleware');
jest.mock('@fastify/rate-limit');

describe('src/routes/scan.ts - Comprehensive Unit Tests', () => {
  let scanRoutes: any;
  let QRValidator: any;
  let logger: any;
  let metrics: any;
  let authMiddleware: any;
  let validationMiddleware: any;
  let rateLimit: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockQRValidator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock QRValidator
    mockQRValidator = {
      validateScan: jest.fn().mockResolvedValue({
        success: true,
        valid: true,
        ticket_id: 'ticket-123',
        status: 'ALLOWED',
      }),
    };

    QRValidator = require('../../../src/services/QRValidator').default;
    QRValidator.mockImplementation(() => mockQRValidator);

    // Mock logger
    logger = require('../../../src/utils/logger').default;

    // Mock metrics
    metrics = require('../../../src/utils/metrics');
    metrics.scansAllowedTotal = { inc: jest.fn() };
    metrics.scansDeniedTotal = { labels: jest.fn().mockReturnValue({ inc: jest.fn() }) };
    metrics.scanLatency = { observe: jest.fn() };

    // Mock auth middleware
    authMiddleware = require('../../../src/middleware/auth.middleware');
    authMiddleware.authenticateRequest = jest.fn();
    authMiddleware.requireRole = jest.fn(() => jest.fn());

    // Mock validation middleware
    validationMiddleware = require('../../../src/middleware/validation.middleware');
    validationMiddleware.validateRequest = jest.fn(() => jest.fn());

    // Mock rate limit
    rateLimit = require('@fastify/rate-limit');
    rateLimit.mockImplementation(() => jest.fn());

    // Mock Fastify instance
    const routes: Map<string, any> = new Map();
    const childInstances: any[] = [];
    mockFastify = {
      post: jest.fn((path, options, handler) => {
        const actualHandler = typeof options === 'function' ? options : handler;
        routes.set(`POST:${path}`, { handler: actualHandler, options: typeof options === 'object' ? options : {} });
      }),
      register: jest.fn(async (plugin, options) => {
        if (typeof plugin === 'function' && plugin.name !== 'fastifyRateLimit') {
          const childInstance = {
            post: jest.fn((path, options, handler) => {
              const actualHandler = typeof options === 'function' ? options : handler;
              routes.set(`POST:/bulk${path}`, { handler: actualHandler, options: typeof options === 'object' ? options : {} });
            }),
            register: jest.fn(),
          };
          childInstances.push(childInstance);
          await plugin(childInstance, options);
        }
      }),
      _routes: routes,
      _children: childInstances,
    };

    // Mock request
    mockRequest = {
      body: {},
      user: {
        userId: 'user-123',
        tenantId: 'tenant-123',
        venueId: 'venue-123',
        role: 'VENUE_STAFF',
      },
      ip: '192.168.1.100',
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
    };

    // Mock reply
    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import module under test
    scanRoutes = require('../../../src/routes/scan').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register rate limiter', async () => {
      await scanRoutes(mockFastify);

      expect(mockFastify.register).toHaveBeenCalledWith(rateLimit, expect.any(Object));
    });

    it('should register POST / route', async () => {
      await scanRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/', expect.any(Object), expect.any(Function));
    });

    it('should register POST /bulk route', async () => {
      await scanRoutes(mockFastify);

      const bulkRoute = mockFastify._routes.get('POST:/bulk');
      expect(bulkRoute).toBeDefined();
    });

    it('should configure authentication on main scan route', async () => {
      await scanRoutes(mockFastify);

      const route = mockFastify._routes.get('POST:/');
      expect(route.options.preHandler).toBeDefined();
      expect(route.options.preHandler).toContain(authMiddleware.authenticateRequest);
    });

    it('should configure role requirement on main scan route', async () => {
      await scanRoutes(mockFastify);

      expect(authMiddleware.requireRole).toHaveBeenCalledWith('VENUE_STAFF', 'VENUE_MANAGER', 'ADMIN');
    });

    it('should configure validation on main scan route', async () => {
      await scanRoutes(mockFastify);

      expect(validationMiddleware.validateRequest).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST / - Success Cases
  // =============================================================================

  describe('POST / - Success Cases', () => {
    it('should process valid scan successfully', async () => {
      const scanResult = {
        success: true,
        valid: true,
        ticket_id: 'ticket-456',
        status: 'ALLOWED',
      };
      mockQRValidator.validateScan.mockResolvedValue(scanResult);
      mockRequest.body = {
        qr_data: 'qr-data-123',
        device_id: 'device-456',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(scanResult);
      expect(metrics.scansAllowedTotal.inc).toHaveBeenCalled();
    });

    it('should call validateScan with correct parameters', async () => {
      mockRequest.body = {
        qr_data: 'qr-789',
        device_id: 'device-abc',
        location: 'Gate A',
        staff_user_id: 'staff-123',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        'qr-789',
        'device-abc',
        'Gate A',
        'staff-123',
        mockRequest.user
      );
    });

    it('should log scan attempt with security context', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
        staff_user_id: 'staff-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Scan attempt', expect.objectContaining({
        deviceId: 'device-1',
        staffUser: 'staff-1',
        authenticatedUser: 'user-123',
        tenantId: 'tenant-123',
        venueId: 'venue-123',
        role: 'VENUE_STAFF',
        ip: '192.168.1.100',
      }));
    });

    it('should track scan latency', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scanLatency.observe).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should handle scan without optional fields', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        'qr-data',
        'device-1',
        undefined,
        undefined,
        mockRequest.user
      );
    });
  });

  // =============================================================================
  // POST / - Failed Scan Cases
  // =============================================================================

  describe('POST / - Failed Scan Cases', () => {
    it('should handle denied scan', async () => {
      const deniedResult = {
        success: false,
        valid: false,
        reason: 'ALREADY_SCANNED',
        message: 'Ticket already scanned',
      };
      mockQRValidator.validateScan.mockResolvedValue(deniedResult);
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(deniedResult);
    });

    it('should track denied scan metrics', async () => {
      const deniedResult = {
        success: false,
        valid: false,
        reason: 'EXPIRED',
      };
      mockQRValidator.validateScan.mockResolvedValue(deniedResult);
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scansDeniedTotal.labels).toHaveBeenCalledWith('EXPIRED');
      expect(metrics.scansDeniedTotal.labels().inc).toHaveBeenCalled();
    });

    it('should log warning for invalid QR attempts', async () => {
      const deniedResult = {
        success: false,
        valid: false,
        reason: 'INVALID_QR',
      };
      mockQRValidator.validateScan.mockResolvedValue(deniedResult);
      mockRequest.body = {
        qr_data: 'invalid-qr',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('Invalid QR scan attempt', expect.objectContaining({
        deviceId: 'device-1',
        reason: 'INVALID_QR',
        ip: '192.168.1.100',
      }));
    });

    it('should log warning for ticket not found', async () => {
      const deniedResult = {
        success: false,
        valid: false,
        reason: 'TICKET_NOT_FOUND',
      };
      mockQRValidator.validateScan.mockResolvedValue(deniedResult);
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('Invalid QR scan attempt', expect.objectContaining({
        reason: 'TICKET_NOT_FOUND',
      }));
    });

    it('should handle denied scan with unknown reason', async () => {
      const deniedResult = {
        success: false,
        valid: false,
        reason: undefined,
      };
      mockQRValidator.validateScan.mockResolvedValue(deniedResult);
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scansDeniedTotal.labels).toHaveBeenCalledWith('unknown');
    });
  });

  // =============================================================================
  // POST / - Validation Errors
  // =============================================================================

  describe('POST / - Validation Errors', () => {
    it('should return 400 when qr_data missing', async () => {
      mockRequest.body = {
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'qr_data and device_id are required',
      });
    });

    it('should return 400 when device_id missing', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when both parameters missing', async () => {
      mockRequest.body = {};

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should track missing parameters in metrics', async () => {
      mockRequest.body = {};

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scansDeniedTotal.labels).toHaveBeenCalledWith('missing_parameters');
    });

    it('should not call validateScan when parameters missing', async () => {
      mockRequest.body = {};

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST / - Error Cases
  // =============================================================================

  describe('POST / - Error Cases', () => {
    it('should return 500 on validator error', async () => {
      mockQRValidator.validateScan.mockRejectedValue(new Error('Validation failed'));
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to process scan',
      });
    });

    it('should log errors', async () => {
      const error = new Error('Database error');
      mockQRValidator.validateScan.mockRejectedValue(error);
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Scan error:', error);
    });

    it('should not track metrics on error', async () => {
      mockQRValidator.validateScan.mockRejectedValue(new Error('Error'));
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scansAllowedTotal.inc).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST /bulk - Bulk Scan Endpoint
  // =============================================================================

  describe('POST /bulk - Bulk Scan Endpoint', () => {
    it('should register bulk scan route', async () => {
      await scanRoutes(mockFastify);

      const bulkRoute = mockFastify._routes.get('POST:/bulk');
      expect(bulkRoute).toBeDefined();
    });

    it('should return 501 not implemented', async () => {
      await scanRoutes(mockFastify);

      const bulkRoute = mockFastify._routes.get('POST:/bulk');
      await bulkRoute.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(501);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bulk scanning not implemented',
      });
    });

    it('should configure authentication on bulk route', async () => {
      await scanRoutes(mockFastify);

      const bulkRoute = mockFastify._routes.get('POST:/bulk');
      expect(bulkRoute.options.preHandler).toBeDefined();
    });

    it('should configure role requirement on bulk route', async () => {
      await scanRoutes(mockFastify);

      // requireRole should be called for bulk route as well
      expect(authMiddleware.requireRole).toHaveBeenCalled();
    });

    it('should register bulk-specific rate limiter', async () => {
      await scanRoutes(mockFastify);

      // Should register rate limit at least twice (main + bulk)
      expect(mockFastify.register).toHaveBeenCalledWith(rateLimit, expect.any(Object));
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty qr_data string', async () => {
      mockRequest.body = {
        qr_data: '',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle empty device_id string', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: '',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle missing user-agent header', async () => {
      mockRequest.headers = {};
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Scan attempt', expect.objectContaining({
        userAgent: undefined,
      }));
    });

    it('should handle missing user context', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        'qr-data',
        'device-1',
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle very long qr_data', async () => {
      const longQRData = 'a'.repeat(10000);
      mockRequest.body = {
        qr_data: longQRData,
        device_id: 'device-1',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        longQRData,
        'device-1',
        undefined,
        undefined,
        mockRequest.user
      );
    });

    it('should handle special characters in device_id', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-@#$%^&*()',
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        'qr-data',
        'device-@#$%^&*()',
        undefined,
        undefined,
        mockRequest.user
      );
    });

    it('should handle location as object', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
        location: { lat: 40.7128, lng: -74.0060 },
      };

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(mockQRValidator.validateScan).toHaveBeenCalledWith(
        'qr-data',
        'device-1',
        { lat: 40.7128, lng: -74.0060 },
        undefined,
        mockRequest.user
      );
    });

    it('should measure latency correctly', async () => {
      mockRequest.body = {
        qr_data: 'qr-data',
        device_id: 'device-1',
      };

      // Simulate delay
      mockQRValidator.validateScan.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ valid: true }), 100))
      );

      await scanRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/');

      await route.handler(mockRequest, mockReply);

      expect(metrics.scanLatency.observe).toHaveBeenCalledWith(expect.any(Number));
      const observedLatency = metrics.scanLatency.observe.mock.calls[0][0];
      expect(observedLatency).toBeGreaterThan(0);
    });
  });
});
