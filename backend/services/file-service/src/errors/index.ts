/**
 * RFC 7807 Error Classes for File Service
 * 
 * AUDIT FIX: ERR-4 - Standardized error responses
 * 
 * Reference: https://datatracker.ietf.org/doc/html/rfc7807
 */

// =============================================================================
// Types
// =============================================================================

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

// =============================================================================
// Base Error Class
// =============================================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Set prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to RFC 7807 Problem Details format
   */
  toProblemDetails(instance?: string): ProblemDetails {
    const problem: ProblemDetails = {
      type: `https://api.tickettoken.com/errors/${this.code.toLowerCase().replace(/_/g, '-')}`,
      title: this.constructor.name.replace(/Error$/, ' Error'),
      status: this.statusCode,
      detail: this.message,
    };

    if (instance) {
      problem.instance = instance;
    }

    if (this.details) {
      Object.assign(problem, this.details);
    }

    return problem;
  }
}

// =============================================================================
// 400 Bad Request Errors
// =============================================================================

export class BadRequestError extends AppError {
  constructor(
    message: string = 'Bad Request',
    code: string = 'BAD_REQUEST',
    details?: Record<string, unknown>
  ) {
    super(message, 400, code, true, details);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string; code?: string }>;

  constructor(
    message: string = 'Validation Failed',
    errors: Array<{ field: string; message: string; code?: string }> = [],
    code: string = 'VALIDATION_ERROR'
  ) {
    super(message, 400, code, true, { errors });
    this.errors = errors;
  }
}

export class InvalidFileTypeError extends AppError {
  constructor(
    message: string = 'Invalid file type',
    allowedTypes?: string[]
  ) {
    super(message, 400, 'INVALID_FILE_TYPE', true, { allowedTypes });
  }
}

export class FileTooLargeError extends AppError {
  constructor(
    message: string = 'File exceeds maximum size limit',
    maxSize?: number
  ) {
    super(message, 400, 'FILE_TOO_LARGE', true, { maxSize });
  }
}

// =============================================================================
// 401 Unauthorized Errors
// =============================================================================

export class UnauthorizedError extends AppError {
  constructor(
    message: string = 'Authentication required',
    code: string = 'UNAUTHORIZED'
  ) {
    super(message, 401, code, true);
  }
}

export class InvalidTokenError extends AppError {
  constructor(
    message: string = 'Invalid or expired token',
    code: string = 'INVALID_TOKEN'
  ) {
    super(message, 401, code, true);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired') {
    super(message, 401, 'TOKEN_EXPIRED', true);
  }
}

// =============================================================================
// 403 Forbidden Errors
// =============================================================================

export class ForbiddenError extends AppError {
  constructor(
    message: string = 'Access forbidden',
    code: string = 'FORBIDDEN',
    details?: Record<string, unknown>
  ) {
    super(message, 403, code, true, details);
  }
}

export class TenantMismatchError extends AppError {
  constructor(message: string = 'Tenant ID mismatch - cannot access another tenant\'s data') {
    super(message, 403, 'TENANT_MISMATCH', true);
  }
}

export class TenantRequiredError extends AppError {
  constructor(message: string = 'Tenant context is required for this operation') {
    super(message, 403, 'TENANT_REQUIRED', true);
  }
}

export class InsufficientPermissionsError extends AppError {
  constructor(
    message: string = 'Insufficient permissions for this operation',
    requiredPermission?: string
  ) {
    super(message, 403, 'INSUFFICIENT_PERMISSIONS', true, { requiredPermission });
  }
}

export class FileAccessDeniedError extends AppError {
  constructor(message: string = 'Access to this file is denied') {
    super(message, 403, 'FILE_ACCESS_DENIED', true);
  }
}

// =============================================================================
// 404 Not Found Errors
// =============================================================================

export class NotFoundError extends AppError {
  constructor(
    message: string = 'Resource not found',
    code: string = 'NOT_FOUND',
    resourceType?: string
  ) {
    super(message, 404, code, true, resourceType ? { resourceType } : undefined);
  }
}

export class FileNotFoundError extends AppError {
  constructor(
    message: string = 'File not found',
    fileId?: string
  ) {
    super(message, 404, 'FILE_NOT_FOUND', true, fileId ? { fileId } : undefined);
  }
}

// =============================================================================
// 409 Conflict Errors
// =============================================================================

export class ConflictError extends AppError {
  constructor(
    message: string = 'Resource conflict',
    code: string = 'CONFLICT',
    details?: Record<string, unknown>
  ) {
    super(message, 409, code, true, details);
  }
}

export class DuplicateFileError extends AppError {
  constructor(
    message: string = 'File already exists',
    existingFileId?: string
  ) {
    super(message, 409, 'DUPLICATE_FILE', true, existingFileId ? { existingFileId } : undefined);
  }
}

// =============================================================================
// 422 Unprocessable Entity Errors
// =============================================================================

export class UnprocessableEntityError extends AppError {
  constructor(
    message: string = 'Unprocessable entity',
    code: string = 'UNPROCESSABLE_ENTITY',
    details?: Record<string, unknown>
  ) {
    super(message, 422, code, true, details);
  }
}

export class FileProcessingError extends AppError {
  constructor(
    message: string = 'File processing failed',
    details?: Record<string, unknown>
  ) {
    super(message, 422, 'FILE_PROCESSING_FAILED', true, details);
  }
}

export class VirusScanError extends AppError {
  constructor(message: string = 'File failed virus scan') {
    super(message, 422, 'VIRUS_DETECTED', true);
  }
}

// =============================================================================
// 429 Too Many Requests Errors
// =============================================================================

export class RateLimitError extends AppError {
  constructor(
    message: string = 'Too many requests',
    retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, retryAfter ? { retryAfter } : undefined);
  }
}

export class QuotaExceededError extends AppError {
  constructor(
    message: string = 'Storage quota exceeded',
    quotaLimit?: number,
    currentUsage?: number
  ) {
    super(message, 429, 'QUOTA_EXCEEDED', true, { quotaLimit, currentUsage });
  }
}

// =============================================================================
// 500 Internal Server Errors
// =============================================================================

export class InternalError extends AppError {
  constructor(
    message: string = 'Internal server error',
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = false
  ) {
    super(message, 500, code, isOperational);
  }
}

export class StorageError extends AppError {
  constructor(
    message: string = 'Storage operation failed',
    operation?: string
  ) {
    super(message, 500, 'STORAGE_ERROR', true, operation ? { operation } : undefined);
  }
}

export class DatabaseError extends AppError {
  constructor(
    message: string = 'Database operation failed',
    isOperational: boolean = true
  ) {
    super(message, 500, 'DATABASE_ERROR', isOperational);
  }
}

// =============================================================================
// 503 Service Unavailable Errors
// =============================================================================

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    service?: string
  ) {
    super(message, 503, 'SERVICE_UNAVAILABLE', true, service ? { service } : undefined);
  }
}

export class StorageUnavailableError extends AppError {
  constructor(message: string = 'Storage service is temporarily unavailable') {
    super(message, 503, 'STORAGE_UNAVAILABLE', true);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an error is an operational error (expected, handled)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, 'INTERNAL_ERROR', false);
  }

  return new InternalError('An unexpected error occurred', 'INTERNAL_ERROR', false);
}

/**
 * Create a sanitized error response (no stack traces in production)
 */
export function createErrorResponse(
  error: AppError,
  requestId?: string,
  includeStack: boolean = false
): ProblemDetails & { stack?: string } {
  const response = error.toProblemDetails(requestId);

  if (includeStack && error.stack && process.env.NODE_ENV !== 'production') {
    return { ...response, stack: error.stack };
  }

  return response;
}

export default {
  AppError,
  BadRequestError,
  ValidationError,
  InvalidFileTypeError,
  FileTooLargeError,
  UnauthorizedError,
  InvalidTokenError,
  TokenExpiredError,
  ForbiddenError,
  TenantMismatchError,
  TenantRequiredError,
  InsufficientPermissionsError,
  FileAccessDeniedError,
  NotFoundError,
  FileNotFoundError,
  ConflictError,
  DuplicateFileError,
  UnprocessableEntityError,
  FileProcessingError,
  VirusScanError,
  RateLimitError,
  QuotaExceededError,
  InternalError,
  StorageError,
  DatabaseError,
  ServiceUnavailableError,
  StorageUnavailableError,
  isOperationalError,
  toAppError,
  createErrorResponse,
};
