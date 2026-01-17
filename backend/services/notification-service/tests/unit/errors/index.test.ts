import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  NotificationSendError,
  ProviderError,
  TemplateError,
  SuppressionError,
  TenantError,
  IdempotencyError,
  sendError,
  createErrorHandler,
  isOperationalError,
  asyncHandler
} from '../../../src/errors/index';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger');

describe('Error Classes - RFC 7807 Problem Details', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
    });

    it('should create error with custom values', () => {
      const details = { field: 'email', value: 'invalid' };
      const error = new AppError('Custom error', 400, 'CUSTOM_CODE', false, details);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.isOperational).toBe(false);
      expect(error.details).toEqual(details);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should be instanceof Error', () => {
      const error = new AppError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    describe('toProblemDetails()', () => {
      it('should convert to RFC 7807 format', () => {
        const error = new AppError('Test error', 400, 'TEST_ERROR');

        const problem = error.toProblemDetails();

        expect(problem).toEqual({
          type: 'https://api.tickettoken.com/errors/test_error',
          title: 'Test Error',
          status: 400,
          detail: 'Test error',
          code: 'TEST_ERROR'
        });
      });

      it('should include instance when provided', () => {
        const error = new AppError('Test');
        const requestId = 'req-123';

        const problem = error.toProblemDetails(requestId);

        expect(problem.instance).toBe(requestId);
      });

      it('should include details when present', () => {
        const details = { field: 'email', constraint: 'format' };
        const error = new AppError('Validation failed', 400, 'VALIDATION_ERROR', true, details);

        const problem = error.toProblemDetails();

        expect(problem.field).toBe('email');
        expect(problem.constraint).toBe('format');
      });

      it('should format code as title (snake_case to Title Case)', () => {
        const error = new AppError('Test', 400, 'MULTI_WORD_ERROR_CODE');

        const problem = error.toProblemDetails();

        expect(problem.title).toBe('Multi Word Error Code');
      });

      it('should generate correct type URL', () => {
        const error = new AppError('Test', 400, 'MY_CUSTOM_ERROR');

        const problem = error.toProblemDetails();

        expect(problem.type).toBe('https://api.tickettoken.com/errors/my_custom_error');
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should include validation details', () => {
      const details = { field: 'email', rule: 'email format' };
      const error = new ValidationError('Invalid email', details);

      expect(error.details).toEqual(details);
    });

    it('should be instanceof AppError', () => {
      const error = new ValidationError('Test');

      expect(error instanceof AppError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error without ID', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.details).toEqual({ resource: 'User', id: undefined });
    });

    it('should create not found error with ID', () => {
      const error = new NotFoundError('User', '123');

      expect(error.message).toBe('User with ID 123 not found');
      expect(error.details).toEqual({ resource: 'User', id: '123' });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('should create forbidden error with custom message', () => {
      const error = new ForbiddenError('Insufficient permissions');

      expect(error.message).toBe('Insufficient permissions');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });

    it('should include conflict details', () => {
      const details = { field: 'email', existing: 'user@example.com' };
      const error = new ConflictError('Email already in use', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError(60);

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error with default message', () => {
      const error = new ServiceUnavailableError('email-service');

      expect(error.message).toBe('Service email-service is temporarily unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.details).toEqual({ service: 'email-service' });
    });

    it('should create service unavailable error with custom message', () => {
      const error = new ServiceUnavailableError('sms-service', 'Provider down');

      expect(error.message).toBe('Provider down');
      expect(error.details).toEqual({ service: 'sms-service' });
    });
  });

  describe('NotificationSendError', () => {
    it('should create notification send error', () => {
      const error = new NotificationSendError('email', 'Provider timeout');

      expect(error.message).toBe('Failed to send email notification: Provider timeout');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('NOTIFICATION_SEND_ERROR');
      expect(error.details?.channel).toBe('email');
      expect(error.details?.reason).toBe('Provider timeout');
    });

    it('should include additional details', () => {
      const extraDetails = { provider: 'sendgrid', statusCode: 503 };
      const error = new NotificationSendError('sms', 'API error', extraDetails);

      expect(error.details).toEqual({
        channel: 'sms',
        reason: 'API error',
        provider: 'sendgrid',
        statusCode: 503
      });
    });
  });

  describe('ProviderError', () => {
    it('should create provider error', () => {
      const error = new ProviderError('SendGrid', 'API key invalid');

      expect(error.message).toBe('Provider SendGrid error: API key invalid');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.details?.provider).toBe('SendGrid');
    });

    it('should include additional details', () => {
      const extraDetails = { responseCode: 401, responseBody: 'Unauthorized' };
      const error = new ProviderError('Twilio', 'Auth failed', extraDetails);

      expect(error.details).toEqual({
        provider: 'Twilio',
        responseCode: 401,
        responseBody: 'Unauthorized'
      });
    });
  });

  describe('TemplateError', () => {
    it('should create template error', () => {
      const error = new TemplateError('welcome-email', 'Variable missing');

      expect(error.message).toBe('Template error for welcome-email: Variable missing');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEMPLATE_ERROR');
      expect(error.details).toEqual({ templateId: 'welcome-email' });
    });
  });

  describe('SuppressionError', () => {
    it('should create suppression error', () => {
      const error = new SuppressionError('user@example.com', 'email', 'User unsubscribed');

      expect(error.message).toBe('Recipient user@example.com is suppressed for email: User unsubscribed');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('RECIPIENT_SUPPRESSED');
      expect(error.details).toEqual({
        recipient: 'user@example.com',
        channel: 'email',
        reason: 'User unsubscribed'
      });
    });
  });

  describe('TenantError', () => {
    it('should create tenant error', () => {
      const error = new TenantError('Tenant not found');

      expect(error.message).toBe('Tenant not found');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TENANT_ERROR');
    });
  });

  describe('IdempotencyError', () => {
    it('should create idempotency error without original request ID', () => {
      const error = new IdempotencyError('Duplicate request detected');

      expect(error.message).toBe('Duplicate request detected');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(error.details).toEqual({ originalRequestId: undefined });
    });

    it('should create idempotency error with original request ID', () => {
      const error = new IdempotencyError('Request already processed', 'req-original-123');

      expect(error.details).toEqual({ originalRequestId: 'req-original-123' });
    });
  });

  describe('sendError()', () => {
    let mockReply: any;

    beforeEach(() => {
      mockReply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
      jest.clearAllMocks();
    });

    it('should send AppError with RFC 7807 format', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      const requestId = 'req-123';

      sendError(mockReply, error, requestId);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/validation_error',
          title: 'Validation Error',
          status: 400,
          detail: 'Invalid input',
          instance: requestId,
          code: 'VALIDATION_ERROR',
          field: 'email'
        })
      );
    });

    it('should log AppError as warning', () => {
      const error = new NotFoundError('User', '123');
      const requestId = 'req-456';

      sendError(mockReply, error, requestId);

      expect(logger.warn).toHaveBeenCalledWith('Application error', {
        code: 'NOT_FOUND',
        status: 404,
        message: 'User with ID 123 not found',
        requestId: 'req-456',
        details: { resource: 'User', id: '123' }
      });
    });

    it('should handle unknown Error as internal server error', () => {
      const error = new Error('Unknown error');
      const requestId = 'req-789';

      sendError(mockReply, error, requestId);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockReply.send).toHaveBeenCalledWith({
        type: 'https://api.tickettoken.com/errors/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        instance: requestId,
        code: 'INTERNAL_ERROR'
      });
    });

    it('should log unknown error', () => {
      const error = new Error('Unexpected');
      error.stack = 'Stack trace here';
      const requestId = 'req-999';

      sendError(mockReply, error, requestId);

      expect(logger.error).toHaveBeenCalledWith('Unhandled error', {
        error: 'Unexpected',
        stack: 'Stack trace here',
        requestId: 'req-999'
      });
    });

    it('should work without requestId', () => {
      const error = new ValidationError('Test');

      sendError(mockReply, error);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: undefined
        })
      );
    });
  });

  describe('createErrorHandler()', () => {
    it('should return error handler function', () => {
      const handler = createErrorHandler();

      expect(typeof handler).toBe('function');
    });

    it('should call sendError with correct parameters', () => {
      const handler = createErrorHandler();
      const error = new ValidationError('Test');
      const request = { id: 'req-123' };
      const reply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };

      handler(error, request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: 'req-123'
        })
      );
    });
  });

  describe('isOperationalError()', () => {
    it('should return true for AppError with isOperational=true', () => {
      const error = new ValidationError('Test');

      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for AppError with isOperational=false', () => {
      const error = new AppError('Test', 500, 'TEST', false);

      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-AppError', () => {
      const error = new Error('Regular error');

      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for TypeError', () => {
      const error = new TypeError('Type error');

      expect(isOperationalError(error)).toBe(false);
    });
  });

  describe('asyncHandler()', () => {
    it('should execute function and return result on success', async () => {
      const fn = jest.fn().mockResolvedValue({ success: true });
      const wrapped = asyncHandler(fn);

      const result = await wrapped('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toEqual({ success: true });
    });

    it('should call sendError on function failure', async () => {
      const error = new ValidationError('Validation failed');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      const request = { id: 'req-123' };
      const reply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };

      await wrapped(request, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    });

    it('should extract request ID from first argument', async () => {
      const error = new NotFoundError('User');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      const request = { id: 'req-special' };
      const reply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };

      await wrapped(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: 'req-special'
        })
      );
    });

    it('should handle error without request object', async () => {
      const error = new AppError('Test');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      const reply = {
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };

      await wrapped(null, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: undefined
        })
      );
    });
  });
});
