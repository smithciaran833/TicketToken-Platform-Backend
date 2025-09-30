// Custom error classes from NODEJS_SERVICE_REQUIREMENTS

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public errors: any[];

  constructor(errors: any[]) {
    super('Validation failed', 422);
    this.errors = errors;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  public ttl?: number;
  constructor(message: string, ttl?: number) {
    super(message, 429);
    this.ttl = ttl;
  }
}

export class TokenError extends AppError {
  constructor(message = 'Invalid or expired token') {
    super(message, 401);
  }
}
