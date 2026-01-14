/**
 * Unit Tests for Global Error Handler Middleware
 * 
 * Tests RFC 7807 error responses, correlation IDs, and error mapping.
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/routes/metrics.routes', () => ({
  recordAuthFailure: jest.fn(),
}));

jest.mock('../../../src/utils/errors', () => ({
  AppError: class AppError extends Error {
    type: string;
    title: string;
    status: number;
    detail: string;
    isOperational: boolean;
    errors?: any[];
    constructor(message: string) {
      super(message);
      this.type = 'https://api.tickettoken.com/errors/test';
      this.title = 'Test Error';
      this.status = 400;
      this.detail = message;
      this.isOperational = true;
    }
  },
  ValidationError: class ValidationError extends Error {
    type = 'https://api.tickettoken.com/errors/validation-error';
    title = 'Validation Error';
    status = 400;
    detail: string;
    isOperational = true;
    errors: any[];
    constructor(errors: any[]) {
      super('Validation failed');
      this.errors = errors;
      this.detail = 'Validation failed';
    }
  },
  UnauthorizedError: class UnauthorizedError extends Error {
    type = 'https://api.tickettoken.com/errors/unauthorized';
    title = 'Unauthorized';
    status = 401;
    detail: string;
    isOperational = true;
    constructor(message: string) {
      super(message);
      this.detail = message;
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    type = 'https://api.tickettoken.com/errors/forbidden';
    title = 'Forbidden';
    status = 403;
    detail: string;
    isOperational = true;
    constructor(message: string) {
      super(message);
      this.detail = message;
    }
  },
  NotFoundError: class NotFoundError extends Error {
    type = 'https://api.tickettoken.com/errors/not-found';
    title = 'Not Found';
    status = 404;
    detail: string;
    isOperational = true;
    constructor(message?: string) {
      super(message || 'Resource not found');
      this.detail = message || 'Resource not found';
    }
  },
  InternalError: class InternalError extends Error {
    type = 'https://api.tickettoken.com/errors/internal-error';
    title = 'Internal Error';
    status = 500;
    detail: string;
    isOperational = false;
    constructor(message: string) {
      super(message);
      this.detail = message;
    }
  },
  StripeError: class StripeError extends Error {
    type = 'https://api.tickettoken.com/errors/stripe-error';
    title = 'Stripe Error';
    status = 502;
    detail: string;
    isOperational = true;
    constructor(error: Error) {
      super(error.message);
      this.detail = error.message;
    }
  },
  sendProblemResponse: jest.fn(),
  toAppError: jest.fn((error) => ({
    type: 'https://api.tickettoken.com/errors/internal-error',
    title: 'Internal Error',
    status: 500,
    detail: error.message,
    message: error.message,
    isOperational: false,
  })),
}));

import {
  globalErrorHandler,
  notFoundHandler,
  registerErrorHandlers,
  asyncHandler,
  registerShutdownHandlers,
  getCorrelationId,
  buildErrorContext,
  ErrorCode,
  ERROR_CODE_DESCRIPTIONS,
} from '../../../src/middleware/global-error-handler';
import { recordAuthFailure } from '../../../src/routes/metrics.routes';

describe('Global Error Handler', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      url: '/api/payments',
      method: 'POST',
      ip: '192.168.1.1',
      headers: {
        'x-correlation-id': 'corr-456',
        'user-agent': 'TestAgent/1.0',
      },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };
  });

  describe('getCorrelationId', () => {
    it('should return x-correlation-id if present', () => {
      const result = getCorrelationId(mockRequest);
      expect(result).toBe('corr-456');
    });

    it('should fallback to x-request-id', () => {
      mockRequest.headers = { 'x-request-id': 'req-id-789' };
      const result = getCorrelationId(mockRequest);
      expect(result).toBe('req-id-789');
    });

    it('should fallback to x-trace-id', () => {
      mockRequest.headers = { 'x-trace-id': 'trace-id-abc' };
      const result = getCorrelationId(mockRequest);
      expect(result).toBe('trace-id-abc');
    });

    it('should fallback to request.id', () => {
      mockRequest.headers = {};
      const result = getCorrelationId(mockRequest);
      expect(result).toBe('req-123');
    });
  });

  describe('buildErrorContext', () => {
    it('should build context with all fields', () => {
      mockRequest.tenantId = 'tenant-123';
      mockRequest.userId = 'user-456';

      const context = buildErrorContext(mockRequest);

      expect(context.correlationId).toBe('corr-456');
      expect(context.traceId).toBe('req-123');
      expect(context.path).toBe('/api/payments');
      expect(context.method).toBe('POST');
      expect(context.tenantId).toBe('tenant-123');
      expect(context.userId).toBe('user-456');
      expect(context.userAgent).toBe('TestAgent/1.0');
      expect(context.ip).toBe('192.168.1.1');
      expect(context.timestamp).toBeDefined();
    });

    it('should handle missing optional fields', () => {
      const context = buildErrorContext(mockRequest);

      expect(context.tenantId).toBeUndefined();
      expect(context.userId).toBeUndefined();
    });
  });

  describe('globalErrorHandler', () => {
    it('should set correlation ID headers', () => {
      const error = new Error('Test error');

      globalErrorHandler(error, mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'corr-456');
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    });

    it('should handle validation errors', () => {
      const error = {
        validation: [
          { instancePath: '/email', message: 'Invalid email', keyword: 'format' },
        ],
        statusCode: 400,
      };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.type).toHaveBeenCalledWith('application/problem+json');
    });

    it('should handle 401 errors and record auth failure', () => {
      const error = { statusCode: 401, message: 'Unauthorized' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(recordAuthFailure).toHaveBeenCalledWith('error_handler');
      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle 403 forbidden errors', () => {
      const error = { statusCode: 403, message: 'Forbidden' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle 404 errors', () => {
      const error = { statusCode: 404, message: 'Not found' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should handle Stripe errors', () => {
      const error = { name: 'StripeError', type: 'StripeCardError', message: 'Card declined' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(502);
    });

    it('should handle connection refused errors', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle timeout errors', () => {
      const error = { code: 'ETIMEDOUT', message: 'Timeout' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle PostgreSQL unique violation (23505)', () => {
      const error = { code: '23505', detail: 'Key (email)=(test@test.com) already exists' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should handle PostgreSQL foreign key violation (23503)', () => {
      const error = { code: '23503', detail: 'Foreign key violation' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle PostgreSQL not-null violation (23502)', () => {
      const error = { code: '23502', column: 'email' };

      globalErrorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle unknown errors as internal errors', () => {
      const error = new Error('Unknown error');

      globalErrorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should include error documentation link', () => {
      const error = new Error('Test error');

      globalErrorHandler(error, mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.documentation).toContain('https://docs.tickettoken.com/errors/');
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with RFC 7807 format', () => {
      notFoundHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.type).toHaveBeenCalledWith('application/problem+json');
    });

    it('should include correlation ID headers', () => {
      notFoundHandler(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'corr-456');
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    });

    it('should include route info in error', () => {
      notFoundHandler(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.detail).toContain('POST');
      expect(sendCall.detail).toContain('/api/payments');
    });
  });

  describe('registerErrorHandlers', () => {
    it('should register error and not found handlers', () => {
      const mockFastify = {
        setErrorHandler: jest.fn(),
        setNotFoundHandler: jest.fn(),
      };

      registerErrorHandlers(mockFastify as any);

      expect(mockFastify.setErrorHandler).toHaveBeenCalledWith(globalErrorHandler);
      expect(mockFastify.setNotFoundHandler).toHaveBeenCalledWith(notFoundHandler);
    });
  });

  describe('asyncHandler', () => {
    it('should pass through successful responses', async () => {
      const handler = asyncHandler(async (req, res) => {
        return { success: true };
      });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual({ success: true });
    });

    it('should re-throw errors for global handler', async () => {
      const handler = asyncHandler(async () => {
        throw new Error('Async error');
      });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Async error');
    });
  });

  describe('ErrorCode enum', () => {
    it('should have authentication error codes', () => {
      expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_1001');
      expect(ErrorCode.AUTH_INVALID_TOKEN).toBe('AUTH_1002');
      expect(ErrorCode.AUTH_TOKEN_EXPIRED).toBe('AUTH_1003');
    });

    it('should have validation error codes', () => {
      expect(ErrorCode.VALIDATION_FAILED).toBe('VAL_2001');
      expect(ErrorCode.VALIDATION_MISSING_FIELD).toBe('VAL_2002');
    });

    it('should have payment error codes', () => {
      expect(ErrorCode.PAYMENT_FAILED).toBe('PAY_4001');
      expect(ErrorCode.PAYMENT_DECLINED).toBe('PAY_4002');
    });

    it('should have Stripe error codes', () => {
      expect(ErrorCode.STRIPE_API_ERROR).toBe('STRIPE_5001');
      expect(ErrorCode.STRIPE_CARD_ERROR).toBe('STRIPE_5002');
    });

    it('should have database error codes', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe('DB_8001');
      expect(ErrorCode.DATABASE_CONFLICT).toBe('DB_8003');
    });
  });

  describe('ERROR_CODE_DESCRIPTIONS', () => {
    it('should have descriptions for all error codes', () => {
      const errorCodes = Object.values(ErrorCode);
      
      errorCodes.forEach(code => {
        expect(ERROR_CODE_DESCRIPTIONS[code as ErrorCode]).toBeDefined();
        expect(typeof ERROR_CODE_DESCRIPTIONS[code as ErrorCode]).toBe('string');
      });
    });

    it('should have meaningful descriptions', () => {
      expect(ERROR_CODE_DESCRIPTIONS[ErrorCode.AUTH_REQUIRED])
        .toContain('Authentication');
      expect(ERROR_CODE_DESCRIPTIONS[ErrorCode.VALIDATION_FAILED])
        .toContain('validation');
    });
  });

  describe('registerShutdownHandlers', () => {
    it('should register SIGTERM and SIGINT handlers', () => {
      const mockFastify = {
        close: jest.fn().mockResolvedValue(undefined),
      };

      const originalOn = process.on.bind(process);
      const handlers: Record<string, Function> = {};
      process.on = jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
        return process;
      }) as any;

      registerShutdownHandlers(mockFastify as any);

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      process.on = originalOn;
    });
  });
});
