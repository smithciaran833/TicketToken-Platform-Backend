// Base error class
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

// Existing errors (keeping for compatibility)
export class ValidationError extends AppError {
  constructor(message: string, public details?: any) {
    super(message, 422, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

// New specific error types for better error handling

// Venue-specific errors
export class VenueNotFoundError extends NotFoundError {
  constructor(venueId: string) {
    super('Venue');
    this.details = { venueId };
  }
}

export class InsufficientPermissionsError extends ForbiddenError {
  constructor(resource: string, action: string) {
    super(`Insufficient permissions to ${action} ${resource}`);
    this.details = { resource, action };
  }
}

export class DuplicateVenueError extends ConflictError {
  constructor(field: string, value: string) {
    super(`Venue with ${field} '${value}' already exists`);
    this.details = { field, value };
  }
}

export class InvalidVenueDataError extends ValidationError {
  constructor(fields: string[]) {
    super('Invalid venue data provided', { invalidFields: fields });
  }
}

// Business logic errors
export class VenueCapacityExceededError extends AppError {
  constructor(requested: number, available: number) {
    super(`Requested capacity ${requested} exceeds available ${available}`, 400, 'CAPACITY_EXCEEDED');
    this.details = { requested, available };
  }
}

export class VenueInactiveError extends AppError {
  constructor(venueId: string) {
    super('Venue is not active', 400, 'VENUE_INACTIVE');
    this.details = { venueId };
  }
}

export class VenueOnboardingIncompleteError extends AppError {
  constructor(venueId: string, missingSteps: string[]) {
    super('Venue onboarding is incomplete', 400, 'ONBOARDING_INCOMPLETE');
    this.details = { venueId, missingSteps };
  }
}

// Infrastructure errors
export class RateLimitError extends AppError {
  constructor(resource?: string, retryAfter?: number) {
    const message = resource 
      ? `Rate limit exceeded for ${resource}` 
      : 'Rate limit exceeded';
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    if (retryAfter) {
      this.details = { retryAfter };
    }
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError?: any) {
    super(message, 500, 'DATABASE_ERROR');
    if (originalError) {
      this.details = { 
        originalMessage: originalError.message,
        code: originalError.code 
      };
    }
  }
}

export class CacheError extends AppError {
  constructor(operation: string, originalError?: any) {
    super(`Cache ${operation} failed`, 500, 'CACHE_ERROR');
    if (originalError) {
      this.details = { 
        operation,
        originalMessage: originalError.message 
      };
    }
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, retryAfter?: number) {
    super(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.details = { service, retryAfter };
  }
}

export class CircuitBreakerOpenError extends ServiceUnavailableError {
  constructor(service: string) {
    super(service);
    this.code = 'CIRCUIT_BREAKER_OPEN';
  }
}

// Helper function to map database errors to our error types
export function mapDatabaseError(error: any): AppError {
  // PostgreSQL error codes
  if (error.code === '23505') { // unique_violation
    const match = error.detail?.match(/Key \((.+?)\)=\((.+?)\)/);
    if (match) {
      return new DuplicateVenueError(match[1], match[2]);
    }
    return new ConflictError('Duplicate entry');
  }
  
  if (error.code === '23503') { // foreign_key_violation
    return new ValidationError('Referenced resource does not exist');
  }
  
  if (error.code === '23502') { // not_null_violation
    return new ValidationError(`Required field is missing: ${error.column}`);
  }
  
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return new DatabaseError('Database connection failed');
  }
  
  return new DatabaseError('Database operation failed', error);
}

// Type guards
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function isValidationError(error: any): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNotFoundError(error: any): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isRateLimitError(error: any): error is RateLimitError {
  return error instanceof RateLimitError;
}
