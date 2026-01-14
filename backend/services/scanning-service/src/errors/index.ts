/**
 * RFC 7807 Problem Details for HTTP APIs
 * https://tools.ietf.org/html/rfc7807
 * 
 * Fixes ERR-3: Implements standard error format
 */

export interface ProblemDetails {
  /** URI reference identifying the problem type */
  type: string;
  /** Short human-readable summary */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation specific to this occurrence */
  detail?: string;
  /** URI reference identifying the specific occurrence */
  instance?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Base error class implementing RFC 7807
 */
export class AppError extends Error {
  public readonly type: string;
  public readonly title: string;
  public readonly status: number;
  public readonly detail?: string;
  public readonly instance?: string;
  public readonly timestamp: string;
  public readonly correlationId?: string;
  public readonly isOperational: boolean;
  public readonly extensions: Record<string, unknown>;

  constructor(
    options: {
      type?: string;
      title: string;
      status: number;
      detail?: string;
      instance?: string;
      correlationId?: string;
      isOperational?: boolean;
      extensions?: Record<string, unknown>;
    }
  ) {
    super(options.detail || options.title);
    
    this.type = options.type || `https://api.tickettoken.com/errors/${options.title.toLowerCase().replace(/\s+/g, '-')}`;
    this.title = options.title;
    this.status = options.status;
    this.detail = options.detail;
    this.instance = options.instance;
    this.timestamp = new Date().toISOString();
    this.correlationId = options.correlationId;
    this.isOperational = options.isOperational ?? true;
    this.extensions = options.extensions || {};

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
    
    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert to RFC 7807 response object
   */
  toJSON(): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      ...this.extensions
    };
  }
}

/**
 * 400 Bad Request - Invalid input
 */
export class BadRequestError extends AppError {
  constructor(detail: string, options?: { instance?: string; correlationId?: string; extensions?: Record<string, unknown> }) {
    super({
      type: 'https://api.tickettoken.com/errors/bad-request',
      title: 'Bad Request',
      status: 400,
      detail,
      ...options
    });
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * 400 Validation Error - Schema validation failed
 */
export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string; code?: string }>;

  constructor(
    detail: string,
    errors: Array<{ field: string; message: string; code?: string }>,
    options?: { instance?: string; correlationId?: string }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/validation-error',
      title: 'Validation Error',
      status: 400,
      detail,
      extensions: { errors },
      ...options
    });
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(detail?: string, options?: { instance?: string; correlationId?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: detail || 'Authentication required',
      ...options
    });
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(detail?: string, options?: { instance?: string; correlationId?: string; required?: string[] }) {
    super({
      type: 'https://api.tickettoken.com/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: detail || 'Insufficient permissions',
      extensions: options?.required ? { required: options.required } : {},
      ...options
    });
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string, options?: { instance?: string; correlationId?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      extensions: { resource, id },
      ...options
    });
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate, concurrent modification)
 */
export class ConflictError extends AppError {
  constructor(detail: string, options?: { instance?: string; correlationId?: string; resourceId?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail,
      extensions: options?.resourceId ? { resourceId: options.resourceId } : {},
      ...options
    });
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 422 Unprocessable Entity - Business logic validation failed
 */
export class UnprocessableEntityError extends AppError {
  constructor(detail: string, options?: { instance?: string; correlationId?: string; reason?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/unprocessable-entity',
      title: 'Unprocessable Entity',
      status: 422,
      detail,
      extensions: options?.reason ? { reason: options.reason } : {},
      ...options
    });
    Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
  public readonly retryAfter?: number;

  constructor(detail?: string, options?: { instance?: string; correlationId?: string; retryAfter?: number }) {
    super({
      type: 'https://api.tickettoken.com/errors/too-many-requests',
      title: 'Too Many Requests',
      status: 429,
      detail: detail || 'Rate limit exceeded',
      extensions: options?.retryAfter ? { retryAfter: options.retryAfter } : {},
      ...options
    });
    this.retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(detail?: string, options?: { instance?: string; correlationId?: string; cause?: Error }) {
    super({
      type: 'https://api.tickettoken.com/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: detail || 'An unexpected error occurred',
      isOperational: false,
      ...options
    });
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * 502 Bad Gateway - Upstream service error
 */
export class BadGatewayError extends AppError {
  constructor(detail?: string, options?: { instance?: string; correlationId?: string; upstream?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/bad-gateway',
      title: 'Bad Gateway',
      status: 502,
      detail: detail || 'Upstream service error',
      extensions: options?.upstream ? { upstream: options.upstream } : {},
      ...options
    });
    Object.setPrototypeOf(this, BadGatewayError.prototype);
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  public readonly retryAfter?: number;

  constructor(detail?: string, options?: { instance?: string; correlationId?: string; retryAfter?: number }) {
    super({
      type: 'https://api.tickettoken.com/errors/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: detail || 'Service temporarily unavailable',
      extensions: options?.retryAfter ? { retryAfter: options.retryAfter } : {},
      ...options
    });
    this.retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * 504 Gateway Timeout
 */
export class GatewayTimeoutError extends AppError {
  constructor(detail?: string, options?: { instance?: string; correlationId?: string; upstream?: string }) {
    super({
      type: 'https://api.tickettoken.com/errors/gateway-timeout',
      title: 'Gateway Timeout',
      status: 504,
      detail: detail || 'Upstream service timeout',
      extensions: options?.upstream ? { upstream: options.upstream } : {},
      ...options
    });
    Object.setPrototypeOf(this, GatewayTimeoutError.prototype);
  }
}

// ============================================
// Scanning-Service Specific Errors
// ============================================

/**
 * QR Code validation failed
 */
export class QRValidationError extends AppError {
  constructor(
    detail: string,
    options?: { 
      instance?: string; 
      correlationId?: string;
      ticketId?: string;
      reason?: 'EXPIRED' | 'INVALID_FORMAT' | 'INVALID_SIGNATURE' | 'ALREADY_USED' | 'REVOKED';
    }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/qr-validation-error',
      title: 'QR Validation Error',
      status: 400,
      detail,
      extensions: {
        ticketId: options?.ticketId,
        reason: options?.reason
      },
      ...options
    });
    Object.setPrototypeOf(this, QRValidationError.prototype);
  }
}

/**
 * Ticket has already been scanned
 */
export class TicketAlreadyScannedError extends AppError {
  constructor(
    ticketId: string,
    options?: { 
      instance?: string; 
      correlationId?: string;
      scannedAt?: string;
      scannedBy?: string;
    }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/ticket-already-scanned',
      title: 'Ticket Already Scanned',
      status: 409,
      detail: `Ticket ${ticketId} has already been scanned`,
      extensions: {
        ticketId,
        scannedAt: options?.scannedAt,
        scannedBy: options?.scannedBy
      },
      ...options
    });
    Object.setPrototypeOf(this, TicketAlreadyScannedError.prototype);
  }
}

/**
 * Device not registered or unauthorized
 */
export class DeviceUnauthorizedError extends AppError {
  constructor(
    detail: string,
    options?: { 
      instance?: string; 
      correlationId?: string;
      deviceId?: string;
    }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/device-unauthorized',
      title: 'Device Unauthorized',
      status: 401,
      detail,
      extensions: {
        deviceId: options?.deviceId
      },
      ...options
    });
    Object.setPrototypeOf(this, DeviceUnauthorizedError.prototype);
  }
}

/**
 * Entry policy violation
 */
export class PolicyViolationError extends AppError {
  constructor(
    detail: string,
    options?: { 
      instance?: string; 
      correlationId?: string;
      policyId?: string;
      violationType?: string;
    }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/policy-violation',
      title: 'Policy Violation',
      status: 403,
      detail,
      extensions: {
        policyId: options?.policyId,
        violationType: options?.violationType
      },
      ...options
    });
    Object.setPrototypeOf(this, PolicyViolationError.prototype);
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  constructor(
    detail: string,
    options?: { 
      instance?: string; 
      correlationId?: string;
      operation?: string;
    }
  ) {
    super({
      type: 'https://api.tickettoken.com/errors/database-error',
      title: 'Database Error',
      status: 500,
      detail,
      isOperational: false,
      extensions: {
        operation: options?.operation
      },
      ...options
    });
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Check if an error is an operational error (expected) vs programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert unknown error to AppError
 */
export function toAppError(error: unknown, correlationId?: string): AppError {
  if (error instanceof AppError) {
    if (correlationId && !error.correlationId) {
      return new AppError({
        ...error,
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.detail,
        correlationId,
        extensions: error.extensions
      });
    }
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(
      process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      { correlationId }
    );
  }

  return new InternalServerError('An unexpected error occurred', { correlationId });
}

/**
 * Create error response object
 */
export function createErrorResponse(error: AppError): ProblemDetails {
  return error.toJSON();
}
