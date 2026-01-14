import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  TokenError,
  TenantError,
  MFARequiredError,
  CaptchaError,
  SessionError,
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates error with message, statusCode, and code', () => {
      const error = new AppError('Test error', 500, 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_CODE');
      expect(error.isOperational).toBe(true);
    });

    it('defaults code to INTERNAL_ERROR', () => {
      const error = new AppError('Test error', 500);
      expect(error.code).toBe('INTERNAL_ERROR');
    });

    it('extends Error', () => {
      const error = new AppError('Test', 500);
      expect(error).toBeInstanceOf(Error);
    });

    it('captures stack trace', () => {
      const error = new AppError('Test', 500);
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('has statusCode 422', () => {
      const error = new ValidationError([]);
      expect(error.statusCode).toBe(422);
    });

    it('has code VALIDATION_ERROR', () => {
      const error = new ValidationError([]);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('stores errors array', () => {
      const errors = [{ field: 'email', message: 'Invalid' }];
      const error = new ValidationError(errors);
      expect(error.errors).toEqual(errors);
    });

    it('has message "Validation failed"', () => {
      const error = new ValidationError([]);
      expect(error.message).toBe('Validation failed');
    });

    it('extends AppError', () => {
      const error = new ValidationError([]);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('has statusCode 404', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
    });

    it('has code NOT_FOUND', () => {
      const error = new NotFoundError();
      expect(error.code).toBe('NOT_FOUND');
    });

    it('defaults to "Resource not found"', () => {
      const error = new NotFoundError();
      expect(error.message).toBe('Resource not found');
    });

    it('uses custom resource name', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
    });

    it('extends AppError', () => {
      const error = new NotFoundError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('AuthenticationError', () => {
    it('has statusCode 401', () => {
      const error = new AuthenticationError();
      expect(error.statusCode).toBe(401);
    });

    it('defaults code to AUTHENTICATION_FAILED', () => {
      const error = new AuthenticationError();
      expect(error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('defaults message to "Authentication failed"', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication failed');
    });

    it('accepts custom message and code', () => {
      const error = new AuthenticationError('Invalid token', 'TOKEN_EXPIRED');
      expect(error.message).toBe('Invalid token');
      expect(error.code).toBe('TOKEN_EXPIRED');
    });

    it('extends AppError', () => {
      const error = new AuthenticationError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('AuthorizationError', () => {
    it('has statusCode 403', () => {
      const error = new AuthorizationError();
      expect(error.statusCode).toBe(403);
    });

    it('has code ACCESS_DENIED', () => {
      const error = new AuthorizationError();
      expect(error.code).toBe('ACCESS_DENIED');
    });

    it('defaults message to "Access denied"', () => {
      const error = new AuthorizationError();
      expect(error.message).toBe('Access denied');
    });

    it('accepts custom message', () => {
      const error = new AuthorizationError('Insufficient permissions');
      expect(error.message).toBe('Insufficient permissions');
    });

    it('extends AppError', () => {
      const error = new AuthorizationError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ConflictError', () => {
    it('has statusCode 409', () => {
      const error = new ConflictError();
      expect(error.statusCode).toBe(409);
    });

    it('has code CONFLICT', () => {
      const error = new ConflictError();
      expect(error.code).toBe('CONFLICT');
    });

    it('defaults message to "Resource conflict"', () => {
      const error = new ConflictError();
      expect(error.message).toBe('Resource conflict');
    });

    it('accepts custom message', () => {
      const error = new ConflictError('Email already exists');
      expect(error.message).toBe('Email already exists');
    });

    it('extends AppError', () => {
      const error = new ConflictError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('RateLimitError', () => {
    it('has statusCode 429', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
    });

    it('has code RATE_LIMIT_EXCEEDED', () => {
      const error = new RateLimitError();
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('defaults message to "Too many requests"', () => {
      const error = new RateLimitError();
      expect(error.message).toBe('Too many requests');
    });

    it('stores ttl when provided', () => {
      const error = new RateLimitError('Too many requests', 60);
      expect(error.ttl).toBe(60);
    });

    it('ttl is undefined when not provided', () => {
      const error = new RateLimitError();
      expect(error.ttl).toBeUndefined();
    });

    it('extends AppError', () => {
      const error = new RateLimitError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('TokenError', () => {
    it('has statusCode 401', () => {
      const error = new TokenError();
      expect(error.statusCode).toBe(401);
    });

    it('has code TOKEN_INVALID', () => {
      const error = new TokenError();
      expect(error.code).toBe('TOKEN_INVALID');
    });

    it('defaults message to "Invalid or expired token"', () => {
      const error = new TokenError();
      expect(error.message).toBe('Invalid or expired token');
    });

    it('accepts custom message', () => {
      const error = new TokenError('Token expired');
      expect(error.message).toBe('Token expired');
    });

    it('extends AppError', () => {
      const error = new TokenError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('TenantError', () => {
    it('has statusCode 400', () => {
      const error = new TenantError();
      expect(error.statusCode).toBe(400);
    });

    it('has code TENANT_INVALID', () => {
      const error = new TenantError();
      expect(error.code).toBe('TENANT_INVALID');
    });

    it('defaults message to "Invalid tenant context"', () => {
      const error = new TenantError();
      expect(error.message).toBe('Invalid tenant context');
    });

    it('accepts custom message', () => {
      const error = new TenantError('Tenant not found');
      expect(error.message).toBe('Tenant not found');
    });

    it('extends AppError', () => {
      const error = new TenantError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('MFARequiredError', () => {
    it('has statusCode 401', () => {
      const error = new MFARequiredError();
      expect(error.statusCode).toBe(401);
    });

    it('has code MFA_REQUIRED', () => {
      const error = new MFARequiredError();
      expect(error.code).toBe('MFA_REQUIRED');
    });

    it('defaults message to "MFA verification required"', () => {
      const error = new MFARequiredError();
      expect(error.message).toBe('MFA verification required');
    });

    it('accepts custom message', () => {
      const error = new MFARequiredError('Please verify MFA');
      expect(error.message).toBe('Please verify MFA');
    });

    it('extends AppError', () => {
      const error = new MFARequiredError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('CaptchaError', () => {
    it('has statusCode 400', () => {
      const error = new CaptchaError();
      expect(error.statusCode).toBe(400);
    });

    it('defaults code to CAPTCHA_REQUIRED', () => {
      const error = new CaptchaError();
      expect(error.code).toBe('CAPTCHA_REQUIRED');
    });

    it('defaults message to "CAPTCHA verification required"', () => {
      const error = new CaptchaError();
      expect(error.message).toBe('CAPTCHA verification required');
    });

    it('accepts custom message and code', () => {
      const error = new CaptchaError('CAPTCHA failed', 'CAPTCHA_FAILED');
      expect(error.message).toBe('CAPTCHA failed');
      expect(error.code).toBe('CAPTCHA_FAILED');
    });

    it('extends AppError', () => {
      const error = new CaptchaError();
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('SessionError', () => {
    it('has statusCode 401', () => {
      const error = new SessionError();
      expect(error.statusCode).toBe(401);
    });

    it('has code SESSION_EXPIRED', () => {
      const error = new SessionError();
      expect(error.code).toBe('SESSION_EXPIRED');
    });

    it('defaults message to "Session expired"', () => {
      const error = new SessionError();
      expect(error.message).toBe('Session expired');
    });

    it('accepts custom message', () => {
      const error = new SessionError('Session invalid');
      expect(error.message).toBe('Session invalid');
    });

    it('extends AppError', () => {
      const error = new SessionError();
      expect(error).toBeInstanceOf(AppError);
    });
  });
});
