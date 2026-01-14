/**
 * Unit Tests for Error Classes
 * Tests the standardized error types and RFC 7807 Problem Details
 */

import {
  ErrorCode,
  BaseError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  BusinessError,
  ExternalServiceError,
  RateLimitError,
  DatabaseError,
  isOperationalError,
  wrapError,
  ProblemDetails
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('ErrorCode enum', () => {
    it('should have all authentication error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
    });

    it('should have all validation error codes', () => {
      expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should have all resource error codes', () => {
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
    });

    it('should have all business logic error codes', () => {
      expect(ErrorCode.INSUFFICIENT_FUNDS).toBe('INSUFFICIENT_FUNDS');
      expect(ErrorCode.LISTING_NOT_AVAILABLE).toBe('LISTING_NOT_AVAILABLE');
      expect(ErrorCode.TRANSFER_FAILED).toBe('TRANSFER_FAILED');
      expect(ErrorCode.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
      expect(ErrorCode.PRICE_LIMIT_EXCEEDED).toBe('PRICE_LIMIT_EXCEEDED');
    });

    it('should have all external service error codes', () => {
      expect(ErrorCode.BLOCKCHAIN_ERROR).toBe('BLOCKCHAIN_ERROR');
      expect(ErrorCode.STRIPE_ERROR).toBe('STRIPE_ERROR');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCode.CIRCUIT_OPEN).toBe('CIRCUIT_OPEN');
    });

    it('should have idempotency error code', () => {
      expect(ErrorCode.IDEMPOTENCY_CONFLICT).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('should have all system error codes', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR');
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    });
  });

  describe('BaseError', () => {
    it('should create error with default values', () => {
      const error = new BaseError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({});
      expect(error.name).toBe('BaseError');
    });

    it('should create error with custom values', () => {
      const context = { userId: '123' };
      const error = new BaseError(
        'Custom error',
        ErrorCode.VALIDATION_FAILED,
        400,
        context,
        false
      );
      
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual(context);
      expect(error.isOperational).toBe(false);
    });

    it('should have stack trace', () => {
      const error = new BaseError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BaseError');
    });

    describe('toProblemDetails', () => {
      it('should convert to RFC 7807 Problem Details', () => {
        const error = new BaseError('Test error', ErrorCode.VALIDATION_FAILED, 400);
        const details = error.toProblemDetails('req-123', '/api/test');
        
        expect(details.type).toBe('https://api.tickettoken.com/errors/VALIDATION_FAILED');
        expect(details.title).toBe('BaseError');
        expect(details.status).toBe(400);
        expect(details.detail).toBe('Test error');
        expect(details.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(details.requestId).toBe('req-123');
        expect(details.instance).toBe('/api/test');
      });

      it('should include context in problem details', () => {
        const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, { extra: 'data' });
        const details = error.toProblemDetails();
        
        expect(details.extra).toBe('data');
      });
    });

    describe('toJSON', () => {
      it('should serialize to JSON', () => {
        const error = new BaseError('Test error', ErrorCode.NOT_FOUND, 404, { id: '123' });
        const json = error.toJSON();
        
        expect(json.name).toBe('BaseError');
        expect(json.message).toBe('Test error');
        expect(json.code).toBe(ErrorCode.NOT_FOUND);
        expect(json.statusCode).toBe(404);
        expect(json.context).toEqual({ id: '123' });
        expect(json.stack).toBeDefined();
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create with default values', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create with custom message', () => {
      const error = new AuthenticationError('Custom auth error');
      expect(error.message).toBe('Custom auth error');
    });

    describe('static invalidToken', () => {
      it('should create invalid token error', () => {
        const error = AuthenticationError.invalidToken();
        
        expect(error.message).toBe('Invalid or expired token');
        expect(error.code).toBe(ErrorCode.INVALID_TOKEN);
        expect(error.statusCode).toBe(401);
      });
    });

    describe('static tokenExpired', () => {
      it('should create token expired error', () => {
        const error = AuthenticationError.tokenExpired();
        
        expect(error.message).toBe('Token has expired');
        expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
        expect(error.statusCode).toBe(401);
      });
    });

    describe('static forbidden', () => {
      it('should create forbidden error without resource', () => {
        const error = AuthenticationError.forbidden();
        
        expect(error.message).toBe('Access forbidden');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
      });

      it('should create forbidden error with resource', () => {
        const error = AuthenticationError.forbidden('admin panel');
        
        expect(error.message).toBe('Access to admin panel is forbidden');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
      });
    });
  });

  describe('ValidationError', () => {
    it('should create with message and no violations', () => {
      const error = new ValidationError('Validation failed');
      
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
      expect(error.violations).toEqual([]);
      expect(error.field).toBeUndefined();
    });

    it('should create with violations', () => {
      const violations = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Too short' }
      ];
      const error = new ValidationError('Validation failed', violations);
      
      expect(error.violations).toEqual(violations);
      expect(error.field).toBe('email'); // First violation field
    });

    describe('static missingField', () => {
      it('should create missing field error', () => {
        const error = ValidationError.missingField('email');
        
        expect(error.message).toBe('Missing required field: email');
        expect(error.violations).toEqual([{ field: 'email', message: 'Field is required' }]);
        expect(error.field).toBe('email');
      });
    });

    describe('static invalidField', () => {
      it('should create invalid field error', () => {
        const error = ValidationError.invalidField('price', 'must be positive');
        
        expect(error.message).toBe('Invalid price: must be positive');
        expect(error.violations).toEqual([{ field: 'price', message: 'must be positive' }]);
        expect(error.field).toBe('price');
      });
    });

    describe('toProblemDetails', () => {
      it('should include violations in problem details', () => {
        const violations = [{ field: 'email', message: 'Invalid' }];
        const error = new ValidationError('Validation failed', violations);
        const details = error.toProblemDetails();
        
        expect(details.violations).toEqual(violations);
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('Listing');
      
      expect(error.message).toBe('Listing not found');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.resource).toBe('Listing');
      expect(error.name).toBe('NotFoundError');
    });

    it('should include resource in context', () => {
      const error = new NotFoundError('User', { id: '123' });
      const details = error.toProblemDetails();
      
      expect(details.resource).toBe('User');
      expect(details.id).toBe('123');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource locked');
      
      expect(error.message).toBe('Resource locked');
      expect(error.code).toBe(ErrorCode.CONFLICT);
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('ConflictError');
    });

    describe('static alreadyExists', () => {
      it('should create already exists error', () => {
        const error = ConflictError.alreadyExists('Listing');
        
        expect(error.message).toBe('Listing already exists');
        expect(error.context).toEqual({ resource: 'Listing' });
      });
    });
  });

  describe('BusinessError', () => {
    it('should create business error', () => {
      const error = new BusinessError('Business rule violation', ErrorCode.TRANSFER_FAILED);
      
      expect(error.message).toBe('Business rule violation');
      expect(error.code).toBe(ErrorCode.TRANSFER_FAILED);
      expect(error.statusCode).toBe(422);
      expect(error.name).toBe('BusinessError');
    });

    describe('static insufficientFunds', () => {
      it('should create insufficient funds error', () => {
        const error = BusinessError.insufficientFunds(100, 50);
        
        expect(error.message).toBe('Insufficient funds for this transaction');
        expect(error.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
        expect(error.context).toEqual({ required: 100, available: 50 });
      });
    });

    describe('static listingNotAvailable', () => {
      it('should create listing not available error', () => {
        const error = BusinessError.listingNotAvailable('listing-123');
        
        expect(error.message).toBe('Listing is no longer available');
        expect(error.code).toBe(ErrorCode.LISTING_NOT_AVAILABLE);
        expect(error.context).toEqual({ listingId: 'listing-123' });
      });
    });

    describe('static priceLimitExceeded', () => {
      it('should create price limit exceeded error', () => {
        const error = BusinessError.priceLimitExceeded(500, 300);
        
        expect(error.message).toBe('Price 500 exceeds the maximum allowed limit of 300');
        expect(error.code).toBe(ErrorCode.PRICE_LIMIT_EXCEEDED);
        expect(error.context).toEqual({ price: 500, limit: 300 });
      });
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const error = new ExternalServiceError('Payment Gateway', 'Connection timeout');
      
      expect(error.message).toBe('Payment Gateway: Connection timeout');
      expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(error.statusCode).toBe(503);
      expect(error.service).toBe('Payment Gateway');
      expect(error.name).toBe('ExternalServiceError');
    });

    it('should allow custom error code', () => {
      const error = new ExternalServiceError(
        'Blockchain',
        'Transaction failed',
        ErrorCode.BLOCKCHAIN_ERROR
      );
      
      expect(error.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
    });

    describe('static blockchain', () => {
      it('should create blockchain error', () => {
        const error = ExternalServiceError.blockchain('Network congestion');
        
        expect(error.message).toBe('Blockchain Service: Network congestion');
        expect(error.service).toBe('Blockchain Service');
        expect(error.code).toBe(ErrorCode.BLOCKCHAIN_ERROR);
      });

      it('should include context', () => {
        const error = ExternalServiceError.blockchain('Failed', { txId: 'abc' });
        expect(error.context).toMatchObject({ txId: 'abc' });
      });
    });

    describe('static stripe', () => {
      it('should create stripe error', () => {
        const error = ExternalServiceError.stripe('Card declined');
        
        expect(error.message).toBe('Stripe: Card declined');
        expect(error.service).toBe('Stripe');
        expect(error.code).toBe(ErrorCode.STRIPE_ERROR);
      });

      it('should include context', () => {
        const error = ExternalServiceError.stripe('Failed', { paymentId: '123' });
        expect(error.context).toMatchObject({ paymentId: '123' });
      });
    });

    describe('static circuitOpen', () => {
      it('should create circuit open error', () => {
        const error = ExternalServiceError.circuitOpen('API Gateway', 30);
        
        expect(error.message).toBe('API Gateway: Service temporarily unavailable. Retry after 30 seconds.');
        expect(error.code).toBe(ErrorCode.CIRCUIT_OPEN);
        expect(error.context).toMatchObject({ retryAfter: 30 });
      });
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError(60);
      
      expect(error.message).toBe('Rate limit exceeded. Retry after 60 seconds.');
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.name).toBe('RateLimitError');
    });

    it('should include context', () => {
      const error = new RateLimitError(30, { endpoint: '/api/buy' });
      expect(error.context).toMatchObject({ retryAfter: 30, endpoint: '/api/buy' });
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed');
      
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false); // Non-operational
      expect(error.name).toBe('DatabaseError');
    });

    it('should include context', () => {
      const error = new DatabaseError('Query timeout', { query: 'SELECT *' });
      expect(error.context).toEqual({ query: 'SELECT *' });
    });
  });

  describe('isOperationalError', () => {
    it('should return true for operational BaseError', () => {
      const error = new BaseError('Test');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational BaseError', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, {}, false);
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Test');
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return true for ValidationError', () => {
      const error = new ValidationError('Invalid');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return true for NotFoundError', () => {
      const error = new NotFoundError('Resource');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for DatabaseError', () => {
      const error = new DatabaseError('Connection failed');
      expect(isOperationalError(error)).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('should return BaseError as-is', () => {
      const original = new BaseError('Test');
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('should wrap regular Error in BaseError', () => {
      const original = new Error('Test error');
      const wrapped = wrapError(original);
      
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe('Test error');
      expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(wrapped.statusCode).toBe(500);
      expect(wrapped.isOperational).toBe(false);
      expect(wrapped.context).toEqual({ originalError: 'Error' });
    });

    it('should wrap ValidationError as-is', () => {
      const original = new ValidationError('Invalid input');
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('should wrap string error', () => {
      const wrapped = wrapError('Something went wrong');
      
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe('Something went wrong');
      expect(wrapped.isOperational).toBe(false);
    });

    it('should wrap unknown error types', () => {
      const wrapped = wrapError(123);
      
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe('123');
    });

    it('should wrap null', () => {
      const wrapped = wrapError(null);
      
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe('null');
    });

    it('should wrap undefined', () => {
      const wrapped = wrapError(undefined);
      
      expect(wrapped).toBeInstanceOf(BaseError);
      expect(wrapped.message).toBe('undefined');
    });
  });
});
