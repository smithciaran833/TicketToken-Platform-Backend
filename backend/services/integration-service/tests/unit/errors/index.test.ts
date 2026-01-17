import {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  AuthenticationError,
  ForbiddenError,
  InvalidWebhookSignatureError,
  NotFoundError,
  IntegrationNotFoundError,
  ConnectionNotFoundError,
  MappingNotFoundError,
  ConflictError,
  IntegrationAlreadyExistsError,
  IdempotencyConflictError,
  RateLimitError,
  IntegrationError,
  IntegrationErrorCategory,
  IntegrationErrors,
  OAuthError,
  OAuthStateError,
  OAuthTokenError,
  DatabaseError,
  DatabaseConnectionError,
  InternalError,
  ServiceUnavailableError,
  isOperationalError,
  isErrorType,
  toBaseError,
  categorizeProviderError,
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError({ message: 'Invalid input' });

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.title).toBe('Validation Error');
      expect(error.isOperational).toBe(true);
    });

    it('should include validation errors array', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Name is required' },
      ];

      const error = new ValidationError({
        message: 'Validation failed',
        validationErrors,
      });

      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should include validation errors in RFC7807 format', () => {
      const validationErrors = [{ field: 'email', message: 'Invalid' }];
      const error = new ValidationError({
        message: 'Validation failed',
        validationErrors,
        requestId: 'req-123',
      });

      const rfc7807 = error.toRFC7807();

      expect(rfc7807.validationErrors).toEqual(validationErrors);
      expect(rfc7807.status).toBe(400);
      expect(rfc7807.instance).toBe('req-123');
    });
  });

  describe('BadRequestError', () => {
    it('should create bad request error', () => {
      const error = new BadRequestError('Bad request', 'req-123');

      expect(error.message).toBe('Bad request');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
      expect(error.requestId).toBe('req-123');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthenticationError', () => {
    it('should be an alias for UnauthorizedError', () => {
      const error = new AuthenticationError('Auth failed');

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error', () => {
      const error = new ForbiddenError('Access denied', 'req-123', 'tenant-456');

      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.tenantId).toBe('tenant-456');
    });

    it('should use default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Access denied');
    });
  });

  describe('InvalidWebhookSignatureError', () => {
    it('should include provider in error', () => {
      const error = new InvalidWebhookSignatureError('stripe', 'req-123');

      expect(error.message).toBe('Invalid webhook signature for provider: stripe');
      expect(error.provider).toBe('stripe');
      expect(error.statusCode).toBe(401);
    });

    it('should include provider in RFC7807 format', () => {
      const error = new InvalidWebhookSignatureError('square');
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.provider).toBe('square');
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource name only', () => {
      const error = new NotFoundError('Integration');

      expect(error.message).toBe('Integration not found');
      expect(error.resource).toBe('Integration');
      expect(error.statusCode).toBe(404);
    });

    it('should create with resource name and ID', () => {
      const error = new NotFoundError('Integration', 'int-123');

      expect(error.message).toBe('Integration with ID int-123 not found');
      expect(error.resourceId).toBe('int-123');
    });

    it('should include resource info in RFC7807 format', () => {
      const error = new NotFoundError('Connection', 'conn-456', 'req-789');
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.resource).toBe('Connection');
      expect(rfc7807.resourceId).toBe('conn-456');
    });
  });

  describe('IntegrationNotFoundError', () => {
    it('should create integration not found error', () => {
      const error = new IntegrationNotFoundError('int-123');

      expect(error.message).toBe('Integration with ID int-123 not found');
      expect(error.resource).toBe('Integration');
    });
  });

  describe('ConnectionNotFoundError', () => {
    it('should create connection not found error', () => {
      const error = new ConnectionNotFoundError('conn-123');

      expect(error.message).toBe('Connection with ID conn-123 not found');
      expect(error.resource).toBe('Connection');
    });
  });

  describe('MappingNotFoundError', () => {
    it('should create mapping not found error', () => {
      const error = new MappingNotFoundError('map-123');

      expect(error.message).toBe('Mapping with ID map-123 not found');
      expect(error.resource).toBe('Mapping');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('IntegrationAlreadyExistsError', () => {
    it('should create with provider and venue', () => {
      const error = new IntegrationAlreadyExistsError('stripe', 'venue-123');

      expect(error.message).toBe('Integration for provider stripe already exists for venue venue-123');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('IdempotencyConflictError', () => {
    it('should include idempotency key and retry after', () => {
      const error = new IdempotencyConflictError('idem-key-123', 10, 'req-456');

      expect(error.idempotencyKey).toBe('idem-key-123');
      expect(error.retryAfter).toBe(10);
      expect(error.statusCode).toBe(409);
    });

    it('should use default retry after', () => {
      const error = new IdempotencyConflictError('idem-key-123');

      expect(error.retryAfter).toBe(5);
    });

    it('should include fields in RFC7807 format', () => {
      const error = new IdempotencyConflictError('key-123', 15);
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.idempotencyKey).toBe('key-123');
      expect(rfc7807.retryAfter).toBe(15);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError({
        retryAfter: 60,
        limit: 100,
        remaining: 0,
        requestId: 'req-123',
      });

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
    });

    it('should include fields in RFC7807 format', () => {
      const error = new RateLimitError({ retryAfter: 30, limit: 50 });
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.retryAfter).toBe(30);
      expect(rfc7807.limit).toBe(50);
    });
  });

  describe('IntegrationError', () => {
    it('should create integration error with category', () => {
      const error = new IntegrationError({
        message: 'API call failed',
        provider: 'stripe',
        category: IntegrationErrorCategory.PROVIDER,
      });

      expect(error.message).toBe('API call failed');
      expect(error.provider).toBe('stripe');
      expect(error.category).toBe(IntegrationErrorCategory.PROVIDER);
      expect(error.statusCode).toBe(502);
    });

    it('should set correct status codes for each category', () => {
      const testCases = [
        { category: IntegrationErrorCategory.AUTHENTICATION, expectedStatus: 401 },
        { category: IntegrationErrorCategory.AUTHORIZATION, expectedStatus: 403 },
        { category: IntegrationErrorCategory.RATE_LIMIT, expectedStatus: 429 },
        { category: IntegrationErrorCategory.VALIDATION, expectedStatus: 400 },
        { category: IntegrationErrorCategory.NOT_FOUND, expectedStatus: 404 },
        { category: IntegrationErrorCategory.CONFLICT, expectedStatus: 409 },
        { category: IntegrationErrorCategory.TIMEOUT, expectedStatus: 504 },
        { category: IntegrationErrorCategory.NETWORK, expectedStatus: 502 },
        { category: IntegrationErrorCategory.INTERNAL, expectedStatus: 500 },
      ];

      testCases.forEach(({ category, expectedStatus }) => {
        const error = new IntegrationError({
          message: 'Test',
          provider: 'test',
          category,
        });
        expect(error.statusCode).toBe(expectedStatus);
      });
    });

    it('should determine retryable based on category', () => {
      const retryableCategories = [
        IntegrationErrorCategory.RATE_LIMIT,
        IntegrationErrorCategory.TIMEOUT,
        IntegrationErrorCategory.NETWORK,
      ];

      const nonRetryableCategories = [
        IntegrationErrorCategory.AUTHENTICATION,
        IntegrationErrorCategory.AUTHORIZATION,
        IntegrationErrorCategory.VALIDATION,
      ];

      retryableCategories.forEach((category) => {
        const error = new IntegrationError({
          message: 'Test',
          provider: 'test',
          category,
        });
        expect(error.retryable).toBe(true);
      });

      nonRetryableCategories.forEach((category) => {
        const error = new IntegrationError({
          message: 'Test',
          provider: 'test',
          category,
        });
        expect(error.retryable).toBe(false);
      });
    });

    it('should allow overriding retryable', () => {
      const error = new IntegrationError({
        message: 'Test',
        provider: 'test',
        category: IntegrationErrorCategory.PROVIDER,
        retryable: true,
      });

      expect(error.retryable).toBe(true);
    });

    it('should include provider error', () => {
      const providerError = { code: 'card_declined', message: 'Card was declined' };
      const error = new IntegrationError({
        message: 'Payment failed',
        provider: 'stripe',
        category: IntegrationErrorCategory.PROVIDER,
        providerError,
      });

      expect(error.providerError).toEqual(providerError);
    });
  });

  describe('IntegrationErrors factory', () => {
    it('should create authentication error', () => {
      const error = IntegrationErrors.authenticationError('stripe', 'Invalid API key');

      expect(error.category).toBe(IntegrationErrorCategory.AUTHENTICATION);
      expect(error.provider).toBe('stripe');
      expect(error.retryable).toBe(false);
    });

    it('should create authorization error', () => {
      const error = IntegrationErrors.authorizationError('square', 'Permission denied');

      expect(error.category).toBe(IntegrationErrorCategory.AUTHORIZATION);
      expect(error.retryable).toBe(false);
    });

    it('should create rate limit error', () => {
      const error = IntegrationErrors.rateLimitError('mailchimp', 60);

      expect(error.category).toBe(IntegrationErrorCategory.RATE_LIMIT);
      expect(error.message).toContain('Retry after 60s');
      expect(error.retryable).toBe(true);
    });

    it('should create timeout error', () => {
      const error = IntegrationErrors.timeoutError('quickbooks');

      expect(error.category).toBe(IntegrationErrorCategory.TIMEOUT);
      expect(error.retryable).toBe(true);
    });

    it('should create network error', () => {
      const cause = new Error('ECONNREFUSED');
      const error = IntegrationErrors.networkError('stripe', cause);

      expect(error.category).toBe(IntegrationErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
    });

    it('should create provider error', () => {
      const providerError = { code: 'INVALID_REQUEST' };
      const error = IntegrationErrors.providerError('square', 'Request failed', providerError);

      expect(error.category).toBe(IntegrationErrorCategory.PROVIDER);
      expect(error.providerError).toEqual(providerError);
    });
  });

  describe('OAuthError', () => {
    it('should create OAuth error', () => {
      const error = new OAuthError({
        message: 'OAuth failed',
        provider: 'stripe',
        oauthError: 'access_denied',
        oauthErrorDescription: 'User denied access',
      });

      expect(error.message).toBe('OAuth failed');
      expect(error.provider).toBe('stripe');
      expect(error.oauthError).toBe('access_denied');
      expect(error.statusCode).toBe(400);
    });

    it('should include OAuth fields in RFC7807 format', () => {
      const error = new OAuthError({
        message: 'OAuth error',
        provider: 'square',
        oauthError: 'invalid_grant',
      });
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.provider).toBe('square');
      expect(rfc7807.oauthError).toBe('invalid_grant');
    });
  });

  describe('OAuthStateError', () => {
    it('should create state error', () => {
      const error = new OAuthStateError('stripe');

      expect(error.message).toBe('Invalid or expired OAuth state token');
      expect(error.oauthError).toBe('invalid_state');
    });
  });

  describe('OAuthTokenError', () => {
    it('should create token error', () => {
      const error = new OAuthTokenError('mailchimp', 'Token expired');

      expect(error.message).toBe('Token expired');
      expect(error.oauthError).toBe('token_error');
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError({
        message: 'Query failed',
        query: 'SELECT * FROM users',
        constraint: 'users_email_unique',
      });

      expect(error.message).toBe('Query failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.query).toBe('SELECT * FROM users');
      expect(error.constraint).toBe('users_email_unique');
    });
  });

  describe('DatabaseConnectionError', () => {
    it('should create with default message', () => {
      const error = new DatabaseConnectionError();

      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(503);
    });

    it('should create with custom message', () => {
      const error = new DatabaseConnectionError('Pool exhausted');

      expect(error.message).toBe('Pool exhausted');
    });
  });

  describe('InternalError', () => {
    it('should create with default message', () => {
      const error = new InternalError();

      expect(error.message).toBe('An unexpected error occurred');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Redis');

      expect(error.message).toBe('Redis is temporarily unavailable');
      expect(error.statusCode).toBe(503);
    });
  });

  describe('Utility Functions', () => {
    describe('isOperationalError', () => {
      it('should return true for operational errors', () => {
        const error = new ValidationError({ message: 'Invalid' });
        expect(isOperationalError(error)).toBe(true);
      });

      it('should return false for non-operational errors', () => {
        const error = new InternalError();
        expect(isOperationalError(error)).toBe(false);
      });

      it('should return false for non-BaseError', () => {
        const error = new Error('Regular error');
        expect(isOperationalError(error)).toBe(false);
      });
    });

    describe('isErrorType', () => {
      it('should identify correct error type', () => {
        const error = new ValidationError({ message: 'Invalid' });
        expect(isErrorType(error, ValidationError)).toBe(true);
        expect(isErrorType(error, NotFoundError)).toBe(false);
      });
    });

    describe('toBaseError', () => {
      it('should return BaseError as-is', () => {
        const original = new ValidationError({ message: 'Invalid' });
        const result = toBaseError(original);

        expect(result).toBe(original);
      });

      it('should convert Error to InternalError', () => {
        const original = new Error('Something went wrong');
        const result = toBaseError(original, 'req-123');

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toBe('Something went wrong');
        expect(result.requestId).toBe('req-123');
      });

      it('should convert unknown to InternalError', () => {
        const result = toBaseError('string error');

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toBe('string error');
      });
    });

    describe('categorizeProviderError', () => {
      it('should categorize 401 as authentication error', () => {
        const error = categorizeProviderError('stripe', new Error('Unauthorized'), 401);

        expect(error.category).toBe(IntegrationErrorCategory.AUTHENTICATION);
      });

      it('should categorize 403 as authorization error', () => {
        const error = categorizeProviderError('stripe', new Error('Forbidden'), 403);

        expect(error.category).toBe(IntegrationErrorCategory.AUTHORIZATION);
      });

      it('should categorize 429 as rate limit error', () => {
        const error = categorizeProviderError('stripe', new Error('Too many requests'), 429);

        expect(error.category).toBe(IntegrationErrorCategory.RATE_LIMIT);
      });

      it('should categorize by message when no status code', () => {
        expect(categorizeProviderError('stripe', new Error('unauthorized')).category)
          .toBe(IntegrationErrorCategory.AUTHENTICATION);

        expect(categorizeProviderError('stripe', new Error('rate limit exceeded')).category)
          .toBe(IntegrationErrorCategory.RATE_LIMIT);

        expect(categorizeProviderError('stripe', new Error('request timed out')).category)
          .toBe(IntegrationErrorCategory.TIMEOUT);

        expect(categorizeProviderError('stripe', new Error('ECONNREFUSED')).category)
          .toBe(IntegrationErrorCategory.NETWORK);
      });

      it('should default to provider error', () => {
        const error = categorizeProviderError('stripe', new Error('Unknown error'));

        expect(error.category).toBe(IntegrationErrorCategory.PROVIDER);
      });
    });
  });

  describe('RFC7807 Format', () => {
    it('should include all required fields', () => {
      const error = new ValidationError({
        message: 'Invalid input',
        requestId: 'req-123',
        tenantId: 'tenant-456',
      });

      const rfc7807 = error.toRFC7807('/api/integrations');

      expect(rfc7807).toHaveProperty('type');
      expect(rfc7807).toHaveProperty('title');
      expect(rfc7807).toHaveProperty('status');
      expect(rfc7807).toHaveProperty('detail');
      expect(rfc7807).toHaveProperty('instance');
      expect(rfc7807).toHaveProperty('code');
      expect(rfc7807).toHaveProperty('timestamp');
      expect(rfc7807.tenantId).toBe('tenant-456');
    });

    it('should use requestId as instance when no instance provided', () => {
      const error = new BadRequestError('Bad request', 'req-123');
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.instance).toBe('req-123');
    });

    it('should use provided instance over requestId', () => {
      const error = new BadRequestError('Bad request', 'req-123');
      const rfc7807 = error.toRFC7807('/custom/path');

      expect(rfc7807.instance).toBe('/custom/path');
    });
  });
});
