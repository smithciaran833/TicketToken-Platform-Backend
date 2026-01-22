/**
 * Custom Error Classes
 */

export class AuthenticationError extends Error {
  statusCode = 401;
  code = 'AUTHENTICATION_FAILED';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends Error {
  statusCode = 403;
  code = 'ACCESS_DENIED';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class TenantError extends Error {
  statusCode = 403;
  code = 'INVALID_TENANT_ID_FORMAT';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
    Object.setPrototypeOf(this, TenantError.prototype);
  }
}

export class TokenError extends Error {
  statusCode = 401;
  code = 'TOKEN_ERROR';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
    Object.setPrototypeOf(this, TokenError.prototype);
  }
}

export class RateLimitError extends Error {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;
  ttl: number;
  limit: number;

  constructor(message: string, ttl: number = 60, limit: number = 100) {
    super(message);
    this.name = 'RateLimitError';
    this.ttl = ttl;
    this.limit = limit;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join(', '));
    this.name = 'ValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
