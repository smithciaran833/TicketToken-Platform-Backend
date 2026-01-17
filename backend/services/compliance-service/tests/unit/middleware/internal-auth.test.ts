/**
 * Unit Tests for Internal Auth Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock errors
class MockUnauthorizedError extends Error {
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class MockForbiddenError extends Error {
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

jest.mock('../../../src/errors', () => ({
  UnauthorizedError: MockUnauthorizedError,
  ForbiddenError: MockForbiddenError
}));

describe('Internal Auth Middleware', () => {
  let internalAuth: any;
  let checkInternalAuth: any;
  let internalOrAdmin: any;
  let createInternalHeaders: any;
  let isInternalRequest: any;
  let getCallingService: any;
  let logger: any;

  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  const originalEnv = process.env;
  const validSecret = 'super-secret-internal-key';

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env = { 
      ...originalEnv,
      INTERNAL_SERVICE_SECRET: validSecret,
      NODE_ENV: 'production'
    };

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/middleware/internal-auth');
    internalAuth = module.internalAuth;
    checkInternalAuth = module.checkInternalAuth;
    internalOrAdmin = module.internalOrAdmin;
    createInternalHeaders = module.createInternalHeaders;
    isInternalRequest = module.isInternalRequest;
    getCallingService = module.getCallingService;

    mockReq = {
      headers: {},
      path: '/api/internal/test',
      requestId: 'req-123',
      isInternalRequest: undefined,
      internalService: undefined
    };

    mockRes = {
      status: jest.fn<(code: number) => any>().mockReturnThis(),
      json: jest.fn<(body: any) => any>().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('internalAuth', () => {
    it('should authenticate valid internal service request', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = validSecret;

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBe(true);
      expect(mockReq.internalService).toBe('api-gateway');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject request without service name', () => {
      mockReq.headers['x-internal-secret'] = validSecret;

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockUnauthorizedError));
    });

    it('should reject request without secret', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockUnauthorizedError));
    });

    it('should reject request with invalid secret', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = 'wrong-secret';

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockUnauthorizedError));
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ serviceName: 'api-gateway' }),
        expect.stringContaining('Invalid internal service secret')
      );
    });

    it('should reject unknown service', () => {
      mockReq.headers['x-internal-service'] = 'unknown-service';
      mockReq.headers['x-internal-secret'] = validSecret;

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockForbiddenError));
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ serviceName: 'unknown-service' }),
        expect.stringContaining('Unknown internal service')
      );
    });

    it('should accept all allowed internal services', () => {
      const allowedServices = [
        'api-gateway',
        'auth-service',
        'payment-service',
        'transfer-service',
        'marketplace-service',
        'notification-service',
        'admin-service'
      ];

      for (const service of allowedServices) {
        mockReq.headers['x-internal-service'] = service;
        mockReq.headers['x-internal-secret'] = validSecret;
        mockNext.mockClear();

        const middleware = internalAuth();
        middleware(mockReq, mockRes, mockNext);

        expect(mockReq.internalService).toBe(service);
        expect(mockNext).toHaveBeenCalledWith();
      }
    });

    it('should allow custom allowed services list', () => {
      mockReq.headers['x-internal-service'] = 'custom-service';
      mockReq.headers['x-internal-secret'] = validSecret;

      const middleware = internalAuth({ allowedServices: ['custom-service'] });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBe(true);
      expect(mockReq.internalService).toBe('custom-service');
    });

    it('should skip validation in development when configured', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();

      const freshModule = await import('../../../src/middleware/internal-auth');

      const middleware = freshModule.internalAuth({ skipInDev: true });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBe(true);
      expect(mockReq.internalService).toBe('dev-mode');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should not skip validation in development by default', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();

      const freshModule = await import('../../../src/middleware/internal-auth');

      mockReq.headers['x-internal-service'] = 'api-gateway';
      // No secret provided

      const middleware = freshModule.internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle missing INTERNAL_SERVICE_SECRET', async () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      jest.resetModules();

      const freshModule = await import('../../../src/middleware/internal-auth');

      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = 'some-secret';

      const middleware = freshModule.internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(MockUnauthorizedError));
    });

    it('should log debug message on successful auth', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = validSecret;

      const middleware = internalAuth();
      middleware(mockReq, mockRes, mockNext);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'api-gateway',
          path: '/api/internal/test'
        }),
        expect.stringContaining('Internal service authenticated')
      );
    });
  });

  describe('checkInternalAuth', () => {
    it('should mark valid internal request without blocking', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = validSecret;

      checkInternalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBe(true);
      expect(mockReq.internalService).toBe('api-gateway');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should not block invalid requests', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = 'wrong-secret';

      checkInternalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should not block requests without headers', () => {
      checkInternalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should not mark unknown services as internal', () => {
      mockReq.headers['x-internal-service'] = 'unknown-service';
      mockReq.headers['x-internal-secret'] = validSecret;

      checkInternalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('internalOrAdmin', () => {
    it('should allow admin users without internal auth', () => {
      mockReq.user = { role: 'admin' };

      internalOrAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should require internal auth for non-admin users', () => {
      mockReq.user = { role: 'user' };

      internalOrAdmin(mockReq, mockRes, mockNext);

      // Should call next with error since no internal headers
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow internal service without admin role', () => {
      mockReq.headers['x-internal-service'] = 'api-gateway';
      mockReq.headers['x-internal-secret'] = validSecret;

      internalOrAdmin(mockReq, mockRes, mockNext);

      expect(mockReq.isInternalRequest).toBe(true);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('createInternalHeaders', () => {
    it('should create headers with default service name', () => {
      const headers = createInternalHeaders();

      expect(headers).toEqual({
        'x-internal-service': 'compliance-service',
        'x-internal-secret': validSecret
      });
    });

    it('should create headers with custom service name', () => {
      const headers = createInternalHeaders('custom-service');

      expect(headers).toEqual({
        'x-internal-service': 'custom-service',
        'x-internal-secret': validSecret
      });
    });

    it('should throw when INTERNAL_SERVICE_SECRET not configured', async () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      jest.resetModules();

      const freshModule = await import('../../../src/middleware/internal-auth');

      expect(() => freshModule.createInternalHeaders()).toThrow(
        'INTERNAL_SERVICE_SECRET not configured'
      );
    });
  });

  describe('isInternalRequest', () => {
    it('should return true for internal requests', () => {
      mockReq.isInternalRequest = true;

      expect(isInternalRequest(mockReq)).toBe(true);
    });

    it('should return false for external requests', () => {
      mockReq.isInternalRequest = false;

      expect(isInternalRequest(mockReq)).toBe(false);
    });

    it('should return false when property is undefined', () => {
      mockReq.isInternalRequest = undefined;

      expect(isInternalRequest(mockReq)).toBe(false);
    });
  });

  describe('getCallingService', () => {
    it('should return service name when set', () => {
      mockReq.internalService = 'api-gateway';

      expect(getCallingService(mockReq)).toBe('api-gateway');
    });

    it('should return undefined when not set', () => {
      expect(getCallingService(mockReq)).toBeUndefined();
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const module = await import('../../../src/middleware/internal-auth');

      expect(module.default).toHaveProperty('internalAuth');
      expect(module.default).toHaveProperty('checkInternalAuth');
      expect(module.default).toHaveProperty('internalOrAdmin');
      expect(module.default).toHaveProperty('createInternalHeaders');
      expect(module.default).toHaveProperty('isInternalRequest');
      expect(module.default).toHaveProperty('getCallingService');
    });
  });
});
