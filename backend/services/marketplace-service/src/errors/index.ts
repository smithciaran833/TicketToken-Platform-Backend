/**
 * Standardized Error Types for Marketplace Service
 * 
 * Issues Fixed:
 * - ERR-1: No standardized error types → Consistent error classes
 * - ERR-2: Inconsistent error responses → RFC 7807 Problem Details format
 * - LOG-H2: Errors not structured for logging → Error classes with context
 */

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resource
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',
  
  // Business Logic
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  LISTING_NOT_AVAILABLE = 'LISTING_NOT_AVAILABLE',
  TRANSFER_FAILED = 'TRANSFER_FAILED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PRICE_LIMIT_EXCEEDED = 'PRICE_LIMIT_EXCEEDED',
  
  // External Services
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  STRIPE_ERROR = 'STRIPE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  
  // Idempotency
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  
  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED'
}

/**
 * RFC 7807 Problem Details format
 */
export interface ProblemDetails {
  type: string;           // URI identifying the problem type
  title: string;          // Short human-readable summary
  status: number;         // HTTP status code
  detail: string;         // Human-readable explanation
  instance?: string;      // URI identifying the specific occurrence
  code?: ErrorCode;       // Machine-readable error code
  requestId?: string;     // Request ID for tracing
  [key: string]: any;     // Additional properties
}

/**
 * Base Error class with RFC 7807 support
 */
export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    context: Record<string, any> = {},
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to RFC 7807 Problem Details format
   */
  toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    return {
      type: `https://api.tickettoken.com/errors/${this.code}`,
      title: this.name,
      status: this.statusCode,
      detail: this.message,
      code: this.code,
      instance,
      requestId,
      ...this.context
    };
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Authentication Errors
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string = 'Authentication required',
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    statusCode: number = 401,
    context: Record<string, any> = {}
  ) {
    super(message, code, statusCode, context);
  }

  static invalidToken(): AuthenticationError {
    return new AuthenticationError('Invalid or expired token', ErrorCode.INVALID_TOKEN, 401);
  }

  static tokenExpired(): AuthenticationError {
    return new AuthenticationError('Token has expired', ErrorCode.TOKEN_EXPIRED, 401);
  }

  static forbidden(resource?: string): AuthenticationError {
    return new AuthenticationError(
      resource ? `Access to ${resource} is forbidden` : 'Access forbidden',
      ErrorCode.FORBIDDEN,
      403
    );
  }
}

/**
 * Validation Errors
 */
export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly violations: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    violations: Array<{ field: string; message: string }> = [],
    context: Record<string, any> = {}
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, 400, { violations, ...context });
    this.violations = violations;
    if (violations.length > 0) {
      this.field = violations[0].field;
    }
  }

  static missingField(field: string): ValidationError {
    return new ValidationError(`Missing required field: ${field}`, [{ field, message: 'Field is required' }]);
  }

  static invalidField(field: string, reason: string): ValidationError {
    return new ValidationError(`Invalid ${field}: ${reason}`, [{ field, message: reason }]);
  }

  toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    return {
      ...super.toProblemDetails(requestId, instance),
      violations: this.violations
    };
  }
}

/**
 * Resource Not Found Errors
 */
export class NotFoundError extends BaseError {
  public readonly resource: string;

  constructor(resource: string, context: Record<string, any> = {}) {
    super(`${resource} not found`, ErrorCode.NOT_FOUND, 404, { resource, ...context });
    this.resource = resource;
  }
}

/**
 * Conflict Errors (already exists, version mismatch, etc.)
 */
export class ConflictError extends BaseError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, ErrorCode.CONFLICT, 409, context);
  }

  static alreadyExists(resource: string): ConflictError {
    return new ConflictError(`${resource} already exists`, { resource });
  }
}

/**
 * Business Logic Errors
 */
export class BusinessError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context: Record<string, any> = {}
  ) {
    super(message, code, 422, context);
  }

  static insufficientFunds(required: number, available: number): BusinessError {
    return new BusinessError(
      'Insufficient funds for this transaction',
      ErrorCode.INSUFFICIENT_FUNDS,
      { required, available }
    );
  }

  static listingNotAvailable(listingId: string): BusinessError {
    return new BusinessError(
      'Listing is no longer available',
      ErrorCode.LISTING_NOT_AVAILABLE,
      { listingId }
    );
  }

  static priceLimitExceeded(price: number, limit: number): BusinessError {
    return new BusinessError(
      `Price ${price} exceeds the maximum allowed limit of ${limit}`,
      ErrorCode.PRICE_LIMIT_EXCEEDED,
      { price, limit }
    );
  }
}

/**
 * External Service Errors
 */
export class ExternalServiceError extends BaseError {
  public readonly service: string;

  constructor(
    service: string,
    message: string,
    code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE,
    context: Record<string, any> = {}
  ) {
    super(`${service}: ${message}`, code, 503, { service, ...context });
    this.service = service;
  }

  static blockchain(message: string, context: Record<string, any> = {}): ExternalServiceError {
    return new ExternalServiceError('Blockchain Service', message, ErrorCode.BLOCKCHAIN_ERROR, context);
  }

  static stripe(message: string, context: Record<string, any> = {}): ExternalServiceError {
    return new ExternalServiceError('Stripe', message, ErrorCode.STRIPE_ERROR, context);
  }

  static circuitOpen(service: string, retryAfter: number): ExternalServiceError {
    return new ExternalServiceError(
      service,
      `Service temporarily unavailable. Retry after ${retryAfter} seconds.`,
      ErrorCode.CIRCUIT_OPEN,
      { retryAfter }
    );
  }
}

/**
 * Rate Limit Error
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, context: Record<string, any> = {}) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
      ErrorCode.RATE_LIMITED,
      429,
      { retryAfter, ...context }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Database Error
 */
export class DatabaseError extends BaseError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, ErrorCode.DATABASE_ERROR, 500, context, false);
  }
}

/**
 * Helper to determine if an error is operational (expected) vs programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap unknown errors in a BaseError
 */
export function wrapError(error: unknown): BaseError {
  if (error instanceof BaseError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new BaseError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500,
      { originalError: error.name },
      false
    );
  }
  
  return new BaseError(
    String(error),
    ErrorCode.INTERNAL_ERROR,
    500,
    {},
    false
  );
}
