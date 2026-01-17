// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/errors/index.ts
 */

describe('src/errors/index.ts - Comprehensive Unit Tests', () => {
  let errors: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Import module under test
    errors = require('../../../src/errors');
  });

  // =============================================================================
  // AppError Base Class
  // =============================================================================

  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new errors.AppError({
        title: 'Test Error',
        status: 500,
        detail: 'Test detail',
        correlationId: 'corr-123',
      });

      expect(error.title).toBe('Test Error');
      expect(error.status).toBe(500);
      expect(error.detail).toBe('Test detail');
      expect(error.correlationId).toBe('corr-123');
    });

    it('should generate type URL from title', () => {
      const error = new errors.AppError({
        title: 'Bad Request',
        status: 400,
      });

      expect(error.type).toBe('https://api.tickettoken.com/errors/bad-request');
    });

    it('should use custom type if provided', () => {
      const error = new errors.AppError({
        type: 'https://custom.com/error',
        title: 'Custom',
        status: 400,
      });

      expect(error.type).toBe('https://custom.com/error');
    });

    it('should set timestamp', () => {
      const error = new errors.AppError({ title: 'Test', status: 500 });
      expect(error.timestamp).toBeDefined();
      expect(new Date(error.timestamp)).toBeInstanceOf(Date);
    });

    it('should default isOperational to true', () => {
      const error = new errors.AppError({ title: 'Test', status: 500 });
      expect(error.isOperational).toBe(true);
    });

    it('should allow isOperational to be false', () => {
      const error = new errors.AppError({ title: 'Test', status: 500, isOperational: false });
      expect(error.isOperational).toBe(false);
    });

    it('should include extensions in error', () => {
      const error = new errors.AppError({
        title: 'Test',
        status: 500,
        extensions: { code: 'ERR_001', extra: 'data' },
      });

      expect(error.extensions).toEqual({ code: 'ERR_001', extra: 'data' });
    });

    it('should convert to JSON properly', () => {
      const error = new errors.AppError({
        title: 'Test Error',
        status: 500,
        detail: 'Detail message',
        correlationId: 'corr-456',
        extensions: { key: 'value' },
      });

      const json = error.toJSON();
      expect(json).toEqual({
        type: expect.any(String),
        title: 'Test Error',
        status: 500,
        detail: 'Detail message',
        instance: undefined,
        timestamp: expect.any(String),
        correlationId: 'corr-456',
        key: 'value',
      });
    });

    it('should be instanceof Error', () => {
      const error = new errors.AppError({ title: 'Test', status: 500 });
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof AppError', () => {
      const error = new errors.AppError({ title: 'Test', status: 500 });
      expect(error).toBeInstanceOf(errors.AppError);
    });
  });

  // =============================================================================
  // BadRequestError
  // =============================================================================

  describe('BadRequestError', () => {
    it('should create 400 error', () => {
      const error = new errors.BadRequestError('Invalid input');
      expect(error.status).toBe(400);
      expect(error.title).toBe('Bad Request');
      expect(error.detail).toBe('Invalid input');
    });

    it('should be instanceof BadRequestError', () => {
      const error = new errors.BadRequestError('Test');
      expect(error).toBeInstanceOf(errors.BadRequestError);
      expect(error).toBeInstanceOf(errors.AppError);
    });

    it('should include correlationId', () => {
      const error = new errors.BadRequestError('Test', { correlationId: 'corr-789' });
      expect(error.correlationId).toBe('corr-789');
    });
  });

  // =============================================================================
  // ValidationError
  // =============================================================================

  describe('ValidationError', () => {
    it('should create 400 validation error', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = new errors.ValidationError('Validation failed', validationErrors);

      expect(error.status).toBe(400);
      expect(error.title).toBe('Validation Error');
      expect(error.errors).toEqual(validationErrors);
    });

    it('should include errors in extensions', () => {
      const validationErrors = [{ field: 'name', message: 'Required' }];
      const error = new errors.ValidationError('Failed', validationErrors);

      const json = error.toJSON();
      expect(json.errors).toEqual(validationErrors);
    });
  });

  // =============================================================================
  // UnauthorizedError
  // =============================================================================

  describe('UnauthorizedError', () => {
    it('should create 401 error', () => {
      const error = new errors.UnauthorizedError();
      expect(error.status).toBe(401);
      expect(error.title).toBe('Unauthorized');
      expect(error.detail).toBe('Authentication required');
    });

    it('should accept custom detail', () => {
      const error = new errors.UnauthorizedError('Invalid token');
      expect(error.detail).toBe('Invalid token');
    });
  });

  // =============================================================================
  // ForbiddenError
  // =============================================================================

  describe('ForbiddenError', () => {
    it('should create 403 error', () => {
      const error = new errors.ForbiddenError();
      expect(error.status).toBe(403);
      expect(error.title).toBe('Forbidden');
    });

    it('should include required roles', () => {
      const error = new errors.ForbiddenError('Access denied', { required: ['ADMIN', 'MANAGER'] });
      const json = error.toJSON();
      expect(json.required).toEqual(['ADMIN', 'MANAGER']);
    });
  });

  // =============================================================================
  // NotFoundError
  // =============================================================================

  describe('NotFoundError', () => {
    it('should create 404 error', () => {
      const error = new errors.NotFoundError('Ticket');
      expect(error.status).toBe(404);
      expect(error.title).toBe('Not Found');
    });

    it('should format message without ID', () => {
      const error = new errors.NotFoundError('User');
      expect(error.detail).toBe('User not found');
    });

    it('should format message with ID', () => {
      const error = new errors.NotFoundError('Ticket', 'ticket-123');
      expect(error.detail).toBe("Ticket with id 'ticket-123' not found");
    });

    it('should include resource and id in extensions', () => {
      const error = new errors.NotFoundError('Event', 'event-456');
      const json = error.toJSON();
      expect(json.resource).toBe('Event');
      expect(json.id).toBe('event-456');
    });
  });

  // =============================================================================
  // ConflictError
  // =============================================================================

  describe('ConflictError', () => {
    it('should create 409 error', () => {
      const error = new errors.ConflictError('Duplicate entry');
      expect(error.status).toBe(409);
      expect(error.title).toBe('Conflict');
    });

    it('should include resourceId', () => {
      const error = new errors.ConflictError('Conflict', { resourceId: 'res-123' });
      const json = error.toJSON();
      expect(json.resourceId).toBe('res-123');
    });
  });

  // =============================================================================
  // UnprocessableEntityError
  // =============================================================================

  describe('UnprocessableEntityError', () => {
    it('should create 422 error', () => {
      const error = new errors.UnprocessableEntityError('Invalid business logic');
      expect(error.status).toBe(422);
      expect(error.title).toBe('Unprocessable Entity');
    });

    it('should include reason', () => {
      const error = new errors.UnprocessableEntityError('Failed', { reason: 'INSUFFICIENT_FUNDS' });
      const json = error.toJSON();
      expect(json.reason).toBe('INSUFFICIENT_FUNDS');
    });
  });

  // =============================================================================
  // TooManyRequestsError
  // =============================================================================

  describe('TooManyRequestsError', () => {
    it('should create 429 error', () => {
      const error = new errors.TooManyRequestsError();
      expect(error.status).toBe(429);
      expect(error.title).toBe('Too Many Requests');
      expect(error.detail).toBe('Rate limit exceeded');
    });

    it('should include retryAfter', () => {
      const error = new errors.TooManyRequestsError('Limit exceeded', { retryAfter: 60 });
      expect(error.retryAfter).toBe(60);
      const json = error.toJSON();
      expect(json.retryAfter).toBe(60);
    });
  });

  // =============================================================================
  // InternalServerError
  // =============================================================================

  describe('InternalServerError', () => {
    it('should create 500 error', () => {
      const error = new errors.InternalServerError();
      expect(error.status).toBe(500);
      expect(error.title).toBe('Internal Server Error');
    });

    it('should not be operational', () => {
      const error = new errors.InternalServerError();
      expect(error.isOperational).toBe(false);
    });
  });

  // =============================================================================
  // BadGatewayError
  // =============================================================================

  describe('BadGatewayError', () => {
    it('should create 502 error', () => {
      const error = new errors.BadGatewayError();
      expect(error.status).toBe(502);
      expect(error.title).toBe('Bad Gateway');
    });

    it('should include upstream service', () => {
      const error = new errors.BadGatewayError('Upstream failed', { upstream: 'payment-service' });
      const json = error.toJSON();
      expect(json.upstream).toBe('payment-service');
    });
  });

  // =============================================================================
  // ServiceUnavailableError
  // =============================================================================

  describe('ServiceUnavailableError', () => {
    it('should create 503 error', () => {
      const error = new errors.ServiceUnavailableError();
      expect(error.status).toBe(503);
      expect(error.title).toBe('Service Unavailable');
    });

    it('should include retryAfter', () => {
      const error = new errors.ServiceUnavailableError('Down', { retryAfter: 120 });
      expect(error.retryAfter).toBe(120);
    });
  });

  // =============================================================================
  // GatewayTimeoutError
  // =============================================================================

  describe('GatewayTimeoutError', () => {
    it('should create 504 error', () => {
      const error = new errors.GatewayTimeoutError();
      expect(error.status).toBe(504);
      expect(error.title).toBe('Gateway Timeout');
    });

    it('should include upstream service', () => {
      const error = new errors.GatewayTimeoutError('Timeout', { upstream: 'database' });
      const json = error.toJSON();
      expect(json.upstream).toBe('database');
    });
  });

  // =============================================================================
  // Scanning-Specific Errors
  // =============================================================================

  describe('QRValidationError', () => {
    it('should create QR validation error', () => {
      const error = new errors.QRValidationError('Invalid QR');
      expect(error.status).toBe(400);
      expect(error.title).toBe('QR Validation Error');
    });

    it('should include ticket ID and reason', () => {
      const error = new errors.QRValidationError('Expired', {
        ticketId: 'ticket-123',
        reason: 'EXPIRED',
      });
      const json = error.toJSON();
      expect(json.ticketId).toBe('ticket-123');
      expect(json.reason).toBe('EXPIRED');
    });
  });

  describe('TicketAlreadyScannedError', () => {
    it('should create ticket scanned error', () => {
      const error = new errors.TicketAlreadyScannedError('ticket-456');
      expect(error.status).toBe(409);
      expect(error.detail).toContain('ticket-456');
    });

    it('should include scan metadata', () => {
      const error = new errors.TicketAlreadyScannedError('ticket-789', {
        scannedAt: '2024-01-01T10:00:00Z',
        scannedBy: 'user-123',
      });
      const json = error.toJSON();
      expect(json.scannedAt).toBe('2024-01-01T10:00:00Z');
      expect(json.scannedBy).toBe('user-123');
    });
  });

  describe('DeviceUnauthorizedError', () => {
    it('should create device unauthorized error', () => {
      const error = new errors.DeviceUnauthorizedError('Not registered');
      expect(error.status).toBe(401);
      expect(error.title).toBe('Device Unauthorized');
    });

    it('should include device ID', () => {
      const error = new errors.DeviceUnauthorizedError('Unauthorized', { deviceId: 'dev-123' });
      const json = error.toJSON();
      expect(json.deviceId).toBe('dev-123');
    });
  });

  describe('PolicyViolationError', () => {
    it('should create policy violation error', () => {
      const error = new errors.PolicyViolationError('Policy violated');
      expect(error.status).toBe(403);
      expect(error.title).toBe('Policy Violation');
    });

    it('should include policy details', () => {
      const error = new errors.PolicyViolationError('Violated', {
        policyId: 'policy-123',
        violationType: 'MAX_ENTRIES',
      });
      const json = error.toJSON();
      expect(json.policyId).toBe('policy-123');
      expect(json.violationType).toBe('MAX_ENTRIES');
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new errors.DatabaseError('Connection failed');
      expect(error.status).toBe(500);
      expect(error.title).toBe('Database Error');
      expect(error.isOperational).toBe(false);
    });

    it('should include operation', () => {
      const error = new errors.DatabaseError('Failed', { operation: 'INSERT' });
      const json = error.toJSON();
      expect(json.operation).toBe('INSERT');
    });
  });

  // =============================================================================
  // Helper Functions
  // =============================================================================

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      const error = new errors.BadRequestError('Test');
      expect(errors.isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational errors', () => {
      const error = new errors.InternalServerError('Test');
      expect(errors.isOperationalError(error)).toBe(false);
    });

    it('should return false for non-AppError', () => {
      const error = new Error('Regular error');
      expect(errors.isOperationalError(error)).toBe(false);
    });
  });

  describe('toAppError', () => {
    it('should return AppError unchanged', () => {
      const error = new errors.BadRequestError('Test');
      const result = errors.toAppError(error);
      expect(result).toBe(error);
    });

    it('should add correlationId to AppError', () => {
      const error = new errors.BadRequestError('Test');
      const result = errors.toAppError(error, 'corr-new');
      expect(result.correlationId).toBe('corr-new');
    });

    it('should not override existing correlationId', () => {
      const error = new errors.BadRequestError('Test', { correlationId: 'corr-existing' });
      const result = errors.toAppError(error, 'corr-new');
      expect(result.correlationId).toBe('corr-existing');
    });

    it('should convert Error to InternalServerError in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const result = errors.toAppError(error, 'corr-123');

      expect(result).toBeInstanceOf(errors.InternalServerError);
      expect(result.detail).toBe('An unexpected error occurred');

      process.env.NODE_ENV = originalEnv;
    });

    it('should convert Error to InternalServerError with message in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Specific error');
      const result = errors.toAppError(error, 'corr-456');

      expect(result).toBeInstanceOf(errors.InternalServerError);
      expect(result.detail).toBe('Specific error');

      process.env.NODE_ENV = originalEnv;
    });

    it('should convert unknown to InternalServerError', () => {
      const result = errors.toAppError('string error', 'corr-789');
      expect(result).toBeInstanceOf(errors.InternalServerError);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response object', () => {
      const error = new errors.BadRequestError('Test', { correlationId: 'corr-123' });
      const response = errors.createErrorResponse(error);

      expect(response).toEqual({
        type: expect.any(String),
        title: 'Bad Request',
        status: 400,
        detail: 'Test',
        instance: undefined,
        timestamp: expect.any(String),
        correlationId: 'corr-123',
      });
    });
  });
});
