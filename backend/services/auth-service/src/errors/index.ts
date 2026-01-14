export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public errors: any[];

  constructor(errors: any[]) {
    super('Validation failed', 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', code = 'AUTHENTICATION_FAILED') {
    super(message, 401, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'ACCESS_DENIED');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  public ttl?: number;

  constructor(message = 'Too many requests', ttl?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.ttl = ttl;
  }
}

export class TokenError extends AppError {
  constructor(message = 'Invalid or expired token') {
    super(message, 401, 'TOKEN_INVALID');
  }
}

export class TenantError extends AppError {
  constructor(message = 'Invalid tenant context') {
    super(message, 400, 'TENANT_INVALID');
  }
}

export class MFARequiredError extends AppError {
  constructor(message = 'MFA verification required') {
    super(message, 401, 'MFA_REQUIRED');
  }
}

export class CaptchaError extends AppError {
  constructor(message = 'CAPTCHA verification required', code = 'CAPTCHA_REQUIRED') {
    super(message, 400, code);
  }
}

export class SessionError extends AppError {
  constructor(message = 'Session expired') {
    super(message, 401, 'SESSION_EXPIRED');
  }
}
