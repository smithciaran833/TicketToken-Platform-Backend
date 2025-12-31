/**
 * Custom Error Classes for Event Service
 * 
 * CRITICAL FIX for SL1/SL2: 
 * - All error classes include statusCode property
 * - All error classes include machine-readable code
 * 
 * These errors integrate with the RFC 7807 error handler.
 */

/**
 * Base error class with statusCode and code properties
 */
export abstract class AppError extends Error {
  /** HTTP status code */
  abstract readonly statusCode: number;
  /** Machine-readable error code */
  abstract readonly code: string;
  /** Optional additional details */
  details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation errors - 400/422
 */
export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_ERROR';
  readonly errors?: Array<{ field: string; message: string; code: string }>;

  constructor(message: string, errors?: Array<{ field: string; message: string; code: string }>) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Bad Request error - 400
 */
export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code: string;

  constructor(message: string, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'BadRequestError';
    this.code = code;
  }
}

/**
 * Not Found error - 404
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  readonly resourceType?: string;

  constructor(message: string, resourceType?: string) {
    super(message);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
  }
}

/**
 * Unauthorized error - 401
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error - 403
 */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict error - 409
 */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string, details?: any) {
    super(message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Rate limit exceeded error - 429
 */
export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
  readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal server error - 500
 */
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL_ERROR';

  constructor(message: string = 'An unexpected error occurred') {
    super(message);
    this.name = 'InternalError';
  }
}

/**
 * Service unavailable error - 503
 */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly service?: string;

  constructor(message: string = 'Service temporarily unavailable', service?: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.service = service;
  }
}

/**
 * Gateway timeout error - 504
 */
export class GatewayTimeoutError extends AppError {
  readonly statusCode = 504;
  readonly code = 'GATEWAY_TIMEOUT';

  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'GatewayTimeoutError';
  }
}

/**
 * Database connection error - 503
 */
export class DatabaseConnectionError extends AppError {
  readonly statusCode = 503;
  readonly code = 'DATABASE_CONNECTION_ERROR';

  constructor(message: string = 'Database connection failed') {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Database query timeout error - 504
 */
export class DatabaseTimeoutError extends AppError {
  readonly statusCode = 504;
  readonly code = 'DATABASE_TIMEOUT';

  constructor(message: string = 'Database query timed out') {
    super(message);
    this.name = 'DatabaseTimeoutError';
  }
}

/**
 * Tenant error - 400
 */
export class TenantError extends AppError {
  readonly statusCode = 400;
  readonly code = 'TENANT_ERROR';

  constructor(message: string = 'Invalid or missing tenant') {
    super(message);
    this.name = 'TenantError';
  }
}

/**
 * Event state error - 409
 */
export class EventStateError extends AppError {
  readonly statusCode = 409;
  readonly code = 'INVALID_EVENT_STATE';
  readonly currentState?: string;
  readonly targetState?: string;

  constructor(message: string, currentState?: string, targetState?: string) {
    super(message);
    this.name = 'EventStateError';
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

/**
 * Capacity error - 409
 */
export class CapacityError extends AppError {
  readonly statusCode = 409;
  readonly code = 'INSUFFICIENT_CAPACITY';
  readonly available?: number;
  readonly requested?: number;

  constructor(message: string, available?: number, requested?: number) {
    super(message);
    this.name = 'CapacityError';
    this.available = available;
    this.requested = requested;
  }
}

/**
 * Error codes for machine-readable error handling
 */
export const ErrorCodes = {
  // General
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  
  // Database
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_TIMEOUT: 'DATABASE_TIMEOUT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  
  // Tenant
  TENANT_REQUIRED: 'TENANT_REQUIRED',
  TENANT_INVALID: 'TENANT_INVALID',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  
  // Event
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  INVALID_EVENT_STATE: 'INVALID_EVENT_STATE',
  EVENT_ALREADY_PUBLISHED: 'EVENT_ALREADY_PUBLISHED',
  EVENT_CANCELLED: 'EVENT_CANCELLED',
  
  // Capacity
  INSUFFICIENT_CAPACITY: 'INSUFFICIENT_CAPACITY',
  CAPACITY_NOT_FOUND: 'CAPACITY_NOT_FOUND',
  
  // Pricing
  PRICING_NOT_FOUND: 'PRICING_NOT_FOUND',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  
  // Idempotency
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Helper to check if an error has a specific code
 */
export function hasErrorCode(error: unknown): error is AppError {
  return error instanceof AppError && 'code' in error && 'statusCode' in error;
}

/**
 * Helper to convert unknown errors to AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    const appError = new InternalError(error.message);
    appError.stack = error.stack;
    return appError;
  }
  
  return new InternalError(String(error));
}
