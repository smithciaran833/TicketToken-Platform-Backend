/**
 * Unit tests for src/utils/errors.ts
 * Tests error classes, error codes, and type guards
 */

import {
  AppError,
  ValidationError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  DatabaseConnectionError,
  DatabaseTimeoutError,
  TenantError,
  EventStateError,
  CapacityError,
  ErrorCodes,
  hasErrorCode,
  toAppError,
} from '../../../src/utils/errors';

describe('utils/errors', () => {
  describe('ValidationError', () => {
    it('should have statusCode 422 and VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should accept errors array', () => {
      const errors = [
        { field: 'email', message: 'Invalid format', code: 'INVALID_FORMAT' },
        { field: 'name', message: 'Required', code: 'REQUIRED' },
      ];
      const error = new ValidationError('Validation failed', errors);
      
      expect(error.errors).toEqual(errors);
    });

    it('should have stack trace', () => {
      const error = new ValidationError('Stack test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('BadRequestError', () => {
    it('should have statusCode 400 and default code', () => {
      const error = new BadRequestError('Bad request');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Bad request');
      expect(error.name).toBe('BadRequestError');
    });

    it('should accept custom code', () => {
      const error = new BadRequestError('Invalid date', 'INVALID_DATE');
      
      expect(error.code).toBe('INVALID_DATE');
    });
  });

  describe('NotFoundError', () => {
    it('should have statusCode 404 and NOT_FOUND code', () => {
      const error = new NotFoundError('Event not found');
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Event not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should accept resource type', () => {
      const error = new NotFoundError('Resource not found', 'event');
      
      expect(error.resourceType).toBe('event');
    });
  });

  describe('UnauthorizedError', () => {
    it('should have statusCode 401 and default message', () => {
      const error = new UnauthorizedError();
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Authentication required');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Token expired');
      
      expect(error.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('should have statusCode 403 and default message', () => {
      const error = new ForbiddenError();
      
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('should accept custom message', () => {
      const error = new ForbiddenError('Admin access required');
      
      expect(error.message).toBe('Admin access required');
    });
  });

  describe('ConflictError', () => {
    it('should have statusCode 409 and CONFLICT code', () => {
      const error = new ConflictError('Resource already exists');
      
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource already exists');
    });

    it('should accept details', () => {
      const error = new ConflictError('Duplicate', { field: 'slug' });
      
      expect(error.details).toEqual({ field: 'slug' });
    });
  });

  describe('RateLimitError', () => {
    it('should have statusCode 429 and default message', () => {
      const error = new RateLimitError();
      
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should accept custom message and retryAfter', () => {
      const error = new RateLimitError('Too many requests', 120);
      
      expect(error.message).toBe('Too many requests');
      expect(error.retryAfter).toBe(120);
    });
  });

  describe('InternalError', () => {
    it('should have statusCode 500 and default message', () => {
      const error = new InternalError();
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('An unexpected error occurred');
    });

    it('should accept custom message', () => {
      const error = new InternalError('Something went wrong');
      
      expect(error.message).toBe('Something went wrong');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should have statusCode 503 and default message', () => {
      const error = new ServiceUnavailableError();
      
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('Service temporarily unavailable');
    });

    it('should accept service name', () => {
      const error = new ServiceUnavailableError('Payment service unavailable', 'payment-service');
      
      expect(error.service).toBe('payment-service');
    });
  });

  describe('GatewayTimeoutError', () => {
    it('should have statusCode 504 and default message', () => {
      const error = new GatewayTimeoutError();
      
      expect(error.statusCode).toBe(504);
      expect(error.code).toBe('GATEWAY_TIMEOUT');
      expect(error.message).toBe('Request timed out');
    });
  });

  describe('DatabaseConnectionError', () => {
    it('should have statusCode 503 and default message', () => {
      const error = new DatabaseConnectionError();
      
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('DatabaseTimeoutError', () => {
    it('should have statusCode 504 and default message', () => {
      const error = new DatabaseTimeoutError();
      
      expect(error.statusCode).toBe(504);
      expect(error.code).toBe('DATABASE_TIMEOUT');
      expect(error.message).toBe('Database query timed out');
    });
  });

  describe('TenantError', () => {
    it('should have statusCode 400 and default message', () => {
      const error = new TenantError();
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TENANT_ERROR');
      expect(error.message).toBe('Invalid or missing tenant');
    });
  });

  describe('EventStateError', () => {
    it('should have statusCode 409 and INVALID_EVENT_STATE code', () => {
      const error = new EventStateError('Cannot transition');
      
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('INVALID_EVENT_STATE');
      expect(error.message).toBe('Cannot transition');
    });

    it('should accept current and target states', () => {
      const error = new EventStateError('Invalid transition', 'DRAFT', 'COMPLETED');
      
      expect(error.currentState).toBe('DRAFT');
      expect(error.targetState).toBe('COMPLETED');
    });
  });

  describe('CapacityError', () => {
    it('should have statusCode 409 and INSUFFICIENT_CAPACITY code', () => {
      const error = new CapacityError('Not enough capacity');
      
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('INSUFFICIENT_CAPACITY');
      expect(error.message).toBe('Not enough capacity');
    });

    it('should accept available and requested values', () => {
      const error = new CapacityError('Insufficient capacity', 50, 100);
      
      expect(error.available).toBe(50);
      expect(error.requested).toBe(100);
    });
  });

  describe('ErrorCodes', () => {
    it('should have general error codes', () => {
      expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCodes.GATEWAY_TIMEOUT).toBe('GATEWAY_TIMEOUT');
    });

    it('should have database error codes', () => {
      expect(ErrorCodes.DATABASE_CONNECTION_ERROR).toBe('DATABASE_CONNECTION_ERROR');
      expect(ErrorCodes.DATABASE_TIMEOUT).toBe('DATABASE_TIMEOUT');
      expect(ErrorCodes.DUPLICATE_RESOURCE).toBe('DUPLICATE_RESOURCE');
      expect(ErrorCodes.INVALID_REFERENCE).toBe('INVALID_REFERENCE');
    });

    it('should have tenant error codes', () => {
      expect(ErrorCodes.TENANT_REQUIRED).toBe('TENANT_REQUIRED');
      expect(ErrorCodes.TENANT_INVALID).toBe('TENANT_INVALID');
      expect(ErrorCodes.TENANT_MISMATCH).toBe('TENANT_MISMATCH');
    });

    it('should have event error codes', () => {
      expect(ErrorCodes.EVENT_NOT_FOUND).toBe('EVENT_NOT_FOUND');
      expect(ErrorCodes.INVALID_EVENT_STATE).toBe('INVALID_EVENT_STATE');
      expect(ErrorCodes.EVENT_ALREADY_PUBLISHED).toBe('EVENT_ALREADY_PUBLISHED');
      expect(ErrorCodes.EVENT_CANCELLED).toBe('EVENT_CANCELLED');
    });

    it('should have capacity error codes', () => {
      expect(ErrorCodes.INSUFFICIENT_CAPACITY).toBe('INSUFFICIENT_CAPACITY');
      expect(ErrorCodes.CAPACITY_NOT_FOUND).toBe('CAPACITY_NOT_FOUND');
    });

    it('should have pricing error codes', () => {
      expect(ErrorCodes.PRICING_NOT_FOUND).toBe('PRICING_NOT_FOUND');
      expect(ErrorCodes.INVALID_QUANTITY).toBe('INVALID_QUANTITY');
    });

    it('should have idempotency error codes', () => {
      expect(ErrorCodes.INVALID_IDEMPOTENCY_KEY).toBe('INVALID_IDEMPOTENCY_KEY');
      expect(ErrorCodes.IDEMPOTENCY_CONFLICT).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('hasErrorCode()', () => {
    it('should return true for AppError subclasses', () => {
      expect(hasErrorCode(new ValidationError('test'))).toBe(true);
      expect(hasErrorCode(new NotFoundError('test'))).toBe(true);
      expect(hasErrorCode(new RateLimitError())).toBe(true);
      expect(hasErrorCode(new EventStateError('test'))).toBe(true);
      expect(hasErrorCode(new CapacityError('test'))).toBe(true);
    });

    it('should return false for plain Error', () => {
      expect(hasErrorCode(new Error('test'))).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(hasErrorCode(null)).toBe(false);
      expect(hasErrorCode(undefined)).toBe(false);
      expect(hasErrorCode('error string')).toBe(false);
      expect(hasErrorCode({ message: 'fake error' })).toBe(false);
      expect(hasErrorCode(42)).toBe(false);
    });
  });

  describe('toAppError()', () => {
    it('should return same error if already AppError', () => {
      const original = new ValidationError('test');
      const result = toAppError(original);
      
      expect(result).toBe(original);
    });

    it('should convert plain Error to InternalError', () => {
      const original = new Error('Something failed');
      const result = toAppError(original);
      
      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBe('Something failed');
      expect(result.stack).toBe(original.stack);
    });

    it('should convert string to InternalError', () => {
      const result = toAppError('Something went wrong');
      
      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBe('Something went wrong');
    });

    it('should convert null/undefined to InternalError', () => {
      expect(toAppError(null)).toBeInstanceOf(InternalError);
      expect(toAppError(undefined)).toBeInstanceOf(InternalError);
    });

    it('should convert number to InternalError', () => {
      const result = toAppError(404);
      
      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBe('404');
    });
  });

  describe('Error inheritance', () => {
    it('ValidationError should extend AppError', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(AppError);
    });

    it('NotFoundError should extend AppError', () => {
      const error = new NotFoundError('test');
      expect(error).toBeInstanceOf(AppError);
    });

    it('EventStateError should extend AppError', () => {
      const error = new EventStateError('test');
      expect(error).toBeInstanceOf(AppError);
    });

    it('CapacityError should extend AppError', () => {
      const error = new CapacityError('test');
      expect(error).toBeInstanceOf(AppError);
    });

    it('All error classes should extend Error', () => {
      expect(new ValidationError('test')).toBeInstanceOf(Error);
      expect(new NotFoundError('test')).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
      expect(new ForbiddenError()).toBeInstanceOf(Error);
      expect(new ConflictError('test')).toBeInstanceOf(Error);
      expect(new RateLimitError()).toBeInstanceOf(Error);
      expect(new InternalError()).toBeInstanceOf(Error);
      expect(new EventStateError('test')).toBeInstanceOf(Error);
      expect(new CapacityError('test')).toBeInstanceOf(Error);
    });
  });
});
