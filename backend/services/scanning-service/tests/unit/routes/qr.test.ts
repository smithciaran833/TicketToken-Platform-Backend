// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/qr.ts
 */

jest.mock('../../../src/services/QRGenerator');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware/auth.middleware');
jest.mock('../../../src/errors');

describe('src/routes/qr.ts - Comprehensive Unit Tests', () => {
  let qrRoutes: any;
  let QRGenerator: any;
  let logger: any;
  let authMiddleware: any;
  let errors: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockQRGenerator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock QRGenerator
    mockQRGenerator = {
      generateRotatingQR: jest.fn().mockResolvedValue({
        qr_data: 'ticket-123:nonce:signature',
        expires_at: '2024-01-01T12:00:00Z',
      }),
    };

    QRGenerator = require('../../../src/services/QRGenerator').default;
    QRGenerator.mockImplementation(() => mockQRGenerator);

    // Mock logger
    logger = require('../../../src/utils/logger').default;

    // Mock auth middleware
    authMiddleware = require('../../../src/middleware/auth.middleware');
    authMiddleware.authenticateRequest = jest.fn((req, reply) => Promise.resolve());
    authMiddleware.requireRole = jest.fn(() => jest.fn((req, reply) => Promise.resolve()));

    // Mock errors
    errors = require('../../../src/errors');
    errors.BadRequestError = class BadRequestError extends Error {
      constructor(message, options = {}) {
        super(message);
        this.name = 'BadRequestError';
        this.status = 400;
        this.correlationId = options.correlationId;
        this.extensions = options.extensions;
      }
      toJSON() {
        return {
          error: this.name,
          message: this.message,
          status: this.status,
        };
      }
    };
    errors.NotFoundError = class NotFoundError extends Error {
      constructor(message, options = {}) {
        super(message);
        this.name = 'NotFoundError';
        this.status = 404;
      }
      toJSON() {
        return {
          error: this.name,
          message: this.message,
          status: this.status,
        };
      }
    };
    errors.toAppError = jest.fn((error, correlationId) => {
      if (error.status) return error;
      return {
        status: 500,
        message: error.message,
        toJSON: () => ({ error: 'InternalError', message: error.message, status: 500 }),
      };
    });

    // Mock Fastify instance
    const routes: Map<string, any> = new Map();
    let preHandlers: any[] = [];
    mockFastify = {
      get: jest.fn((path, options, handler) => {
        const actualHandler = typeof options === 'function' ? options : handler;
        routes.set(`GET:${path}`, { handler: actualHandler, options: typeof options === 'object' ? options : {} });
      }),
      post: jest.fn((path, options, handler) => {
        const actualHandler = typeof options === 'function' ? options : handler;
        routes.set(`POST:${path}`, { handler: actualHandler, options: typeof options === 'object' ? options : {} });
      }),
      addHook: jest.fn((hook, handler) => {
        if (hook === 'preHandler') preHandlers.push(handler);
      }),
      _routes: routes,
      _preHandlers: preHandlers,
    };

    // Mock request
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { userId: 'user-123', role: 'VENUE_STAFF' },
      tenantId: 'tenant-123',
      correlationId: 'corr-123',
    };

    // Mock reply
    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import module under test
    qrRoutes = require('../../../src/routes/qr').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register authentication hook', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.addHook).toHaveBeenCalledWith('preHandler', authMiddleware.authenticateRequest);
    });

    it('should register GET /generate/:ticketId route', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/generate/:ticketId', expect.any(Object), expect.any(Function));
    });

    it('should register POST /validate route', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/validate', expect.any(Object), expect.any(Function));
    });

    it('should register GET /status/:ticketId route', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/status/:ticketId', expect.any(Object), expect.any(Function));
    });

    it('should register POST /revoke/:ticketId route', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/revoke/:ticketId', expect.any(Object), expect.any(Function));
    });

    it('should register exactly 5 routes', async () => {
      await qrRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(2);
      expect(mockFastify.post).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // GET /generate/:ticketId - Success Cases
  // =============================================================================

  describe('GET /generate/:ticketId - Success Cases', () => {
    it('should generate QR code for valid ticket', async () => {
      const qrResult = {
        qr_data: 'ticket-456:nonce:sig',
        expires_at: '2024-01-01T12:00:00Z',
      };
      mockQRGenerator.generateRotatingQR.mockResolvedValue(qrResult);
      mockRequest.params = { ticketId: 'ticket-456' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockQRGenerator.generateRotatingQR).toHaveBeenCalledWith('ticket-456');
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        ...qrResult,
        success: true,
      });
    });

    it('should log QR generation', async () => {
      mockRequest.params = { ticketId: 'ticket-789' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Generating QR code', expect.objectContaining({
        ticketId: 'ticket-789',
        userId: 'user-123',
        tenantId: 'tenant-123',
        correlationId: 'corr-123',
      }));
    });

    it('should log successful generation', async () => {
      mockRequest.params = { ticketId: 'ticket-abc' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('QR code generated successfully', expect.objectContaining({
        ticketId: 'ticket-abc',
        correlationId: 'corr-123',
      }));
    });

    it('should require authentication', async () => {
      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      expect(route.options.preHandler).toBeDefined();
    });
  });

  // =============================================================================
  // GET /generate/:ticketId - Error Cases
  // =============================================================================

  describe('GET /generate/:ticketId - Error Cases', () => {
    it('should handle generation errors', async () => {
      const error = new Error('Generation failed');
      mockQRGenerator.generateRotatingQR.mockRejectedValue(error);
      mockRequest.params = { ticketId: 'ticket-error' };

      errors.toAppError.mockReturnValue({
        status: 500,
        message: 'Generation failed',
        toJSON: () => ({ error: 'InternalError', message: 'Generation failed', status: 500 }),
      });

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'InternalError',
        message: 'Generation failed',
      }));
    });

    it('should log generation errors', async () => {
      const error = new Error('QR error');
      mockQRGenerator.generateRotatingQR.mockRejectedValue(error);
      mockRequest.params = { ticketId: 'ticket-fail' };

      errors.toAppError.mockReturnValue({
        status: 500,
        message: 'QR error',
        toJSON: () => ({}),
      });

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('QR generation error', expect.objectContaining({
        ticketId: 'ticket-fail',
        error: 'QR error',
      }));
    });
  });

  // =============================================================================
  // POST /validate - Success Cases
  // =============================================================================

  describe('POST /validate - Success Cases', () => {
    it('should validate properly formatted QR code', async () => {
      mockRequest.body = {
        qr_data: '550e8400-e29b-41d4-a716-446655440000:timestamp:hmac',
        device_id: 'device-123',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        valid: true,
        ticket_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'VALID',
        message: expect.any(String),
      });
    });

    it('should extract ticket ID from QR data', async () => {
      mockRequest.body = {
        qr_data: 'a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890:nonce:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: 'a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890',
        })
      );
    });

    it('should log validation request', async () => {
      mockRequest.body = {
        qr_data: '550e8400-e29b-41d4-a716-446655440000:data:sig',
        device_id: 'device-456',
        location: { lat: 40.7128, lng: -74.0060 },
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Validating QR code', expect.objectContaining({
        hasDeviceId: true,
        hasLocation: true,
      }));
    });

    it('should log successful validation', async () => {
      mockRequest.body = {
        qr_data: '550e8400-e29b-41d4-a716-446655440000:data:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('QR code basic validation passed', expect.objectContaining({
        ticketId: '550e8400-e29b-41d4-a716-446655440000',
      }));
    });
  });

  // =============================================================================
  // POST /validate - Validation Errors
  // =============================================================================

  describe('POST /validate - Validation Errors', () => {
    it('should reject QR data that is too short', async () => {
      mockRequest.body = {
        qr_data: 'short',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty QR data', async () => {
      mockRequest.body = {
        qr_data: '',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should reject QR data without colons', async () => {
      mockRequest.body = {
        qr_data: 'invalidformatnodelimiters',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should reject QR data with only one part', async () => {
      mockRequest.body = {
        qr_data: 'single-part-only',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should reject invalid UUID format', async () => {
      mockRequest.body = {
        qr_data: 'not-a-uuid:timestamp:hmac',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should reject malformed UUID', async () => {
      mockRequest.body = {
        qr_data: '550e8400-invalid-uuid-format:data:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should log validation failures', async () => {
      mockRequest.body = {
        qr_data: 'invalid',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith('QR validation failed', expect.any(Object));
    });
  });

  // =============================================================================
  // GET /status/:ticketId - Success Cases
  // =============================================================================

  describe('GET /status/:ticketId - Success Cases', () => {
    it('should return QR status for ticket', async () => {
      mockRequest.params = { ticketId: 'ticket-status-123' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/status/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ticket_id: 'ticket-status-123',
        qr_enabled: true,
        rotation_enabled: true,
        last_generated: expect.any(String),
        scanned: false,
      });
    });

    it('should log status request', async () => {
      mockRequest.params = { ticketId: 'ticket-log-456' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/status/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith('Getting QR status', expect.objectContaining({
        ticketId: 'ticket-log-456',
        userId: 'user-123',
      }));
    });
  });

  // =============================================================================
  // GET /status/:ticketId - Error Cases
  // =============================================================================

  describe('GET /status/:ticketId - Error Cases', () => {
    it('should handle errors gracefully', async () => {
      mockRequest.params = { ticketId: 'ticket-error' };
      // Force an error by making reply.send throw
      mockReply.send.mockImplementationOnce(() => {
        throw new Error('Status error');
      });

      errors.toAppError.mockReturnValue({
        status: 500,
        message: 'Status error',
        toJSON: () => ({ error: 'InternalError', message: 'Status error' }),
      });

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/status/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST /revoke/:ticketId - Success Cases
  // =============================================================================

  describe('POST /revoke/:ticketId - Success Cases', () => {
    it('should revoke QR code', async () => {
      mockRequest.params = { ticketId: 'ticket-revoke-123' };
      mockRequest.body = { reason: 'Security issue' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'QR code revoked successfully',
        ticket_id: 'ticket-revoke-123',
        revoked_at: expect.any(String),
        revoked_by: 'user-123',
      });
    });

    it('should log revocation with reason', async () => {
      mockRequest.params = { ticketId: 'ticket-456' };
      mockRequest.body = { reason: 'Fraud detected' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Revoking QR code', expect.objectContaining({
        ticketId: 'ticket-456',
        reason: 'Fraud detected',
        userId: 'user-123',
      }));
    });

    it('should handle revocation without reason', async () => {
      mockRequest.params = { ticketId: 'ticket-789' };
      mockRequest.body = {};

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should include revoked_by in response', async () => {
      mockRequest.params = { ticketId: 'ticket-abc' };
      mockRequest.body = {};
      mockRequest.user = { userId: 'admin-999' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked_by: 'admin-999',
        })
      );
    });
  });

  // =============================================================================
  // POST /revoke/:ticketId - Error Cases
  // =============================================================================

  describe('POST /revoke/:ticketId - Error Cases', () => {
    it('should handle revocation errors', async () => {
      mockRequest.params = { ticketId: 'ticket-error' };
      mockRequest.body = {};
      mockReply.send.mockImplementationOnce(() => {
        throw new Error('Revocation failed');
      });

      errors.toAppError.mockReturnValue({
        status: 500,
        message: 'Revocation failed',
        toJSON: () => ({ error: 'InternalError', message: 'Revocation failed' }),
      });

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error revoking QR code', expect.any(Object));
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle QR data with multiple colons', async () => {
      mockRequest.body = {
        qr_data: '550e8400-e29b-41d4-a716-446655440000:extra:data:parts:here',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_id: '550e8400-e29b-41d4-a716-446655440000',
        })
      );
    });

    it('should handle missing device_id and location', async () => {
      mockRequest.body = {
        qr_data: '550e8400-e29b-41d4-a716-446655440000:data:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Validating QR code', expect.objectContaining({
        hasDeviceId: false,
        hasLocation: false,
      }));
    });

    it('should handle missing correlationId', async () => {
      mockRequest.correlationId = undefined;
      mockRequest.params = { ticketId: 'ticket-no-corr' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Generating QR code', expect.objectContaining({
        correlationId: undefined,
      }));
    });

    it('should handle missing user in request', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { ticketId: 'ticket-no-user' };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('GET:/generate/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith('Generating QR code', expect.objectContaining({
        userId: undefined,
      }));
    });

    it('should accept uppercase UUID', async () => {
      mockRequest.body = {
        qr_data: '550E8400-E29B-41D4-A716-446655440000:data:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should accept mixed case UUID', async () => {
      mockRequest.body = {
        qr_data: '550e8400-E29b-41D4-a716-446655440000:data:sig',
      };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/validate');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle very long reason in revoke', async () => {
      mockRequest.params = { ticketId: 'ticket-long' };
      mockRequest.body = { reason: 'A'.repeat(500) };

      await qrRoutes(mockFastify);
      const route = mockFastify._routes.get('POST:/revoke/:ticketId');

      await route.handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });
});
