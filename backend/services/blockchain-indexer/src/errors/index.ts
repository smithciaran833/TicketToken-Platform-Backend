/**
 * Custom Error Classes and Error Codes for Blockchain Indexer Service
 *
 * AUDIT FIX: ERR-3, ERR-11 - RFC 7807 format error responses
 * AUDIT FIX: ERR-12 - Custom error class hierarchy
 *
 * Based on blockchain-service errors/index.ts pattern
 */

// =============================================================================
// ERROR CODES ENUM
// =============================================================================

export enum ErrorCode {
  // Indexer errors
  INDEXER_ERROR = 'INDEXER_ERROR',
  INDEXER_SYNC_FAILED = 'INDEXER_SYNC_FAILED',
  INDEXER_PROCESSING_FAILED = 'INDEXER_PROCESSING_FAILED',
  INDEXER_NOT_RUNNING = 'INDEXER_NOT_RUNNING',

  // Blockchain/Solana errors
  SOLANA_TIMEOUT = 'SOLANA_TIMEOUT',
  SOLANA_RPC_ERROR = 'SOLANA_RPC_ERROR',
  SOLANA_RPC_UNAVAILABLE = 'SOLANA_RPC_UNAVAILABLE',
  SOLANA_TRANSACTION_NOT_FOUND = 'SOLANA_TRANSACTION_NOT_FOUND',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_TIMEOUT = 'DATABASE_TIMEOUT',
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  MONGODB_ERROR = 'MONGODB_ERROR',
  MONGODB_WRITE_FAILED = 'MONGODB_WRITE_FAILED',

  // Tenant errors
  TENANT_INVALID = 'TENANT_INVALID',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  TENANT_CONTEXT_MISSING = 'TENANT_CONTEXT_MISSING',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',

  // Authentication/Authorization errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_MISSING = 'TOKEN_MISSING',

  // Rate limiting errors
  RATE_LIMITED = 'RATE_LIMITED',
  RATE_LIMIT_TENANT = 'RATE_LIMIT_TENANT',

  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

// =============================================================================
// RFC 7807 PROBLEM DETAILS TYPE
// =============================================================================

/**
 * RFC 7807 Problem Details format
 * https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  timestamp?: string;
  traceId?: string;
  validationErrors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

/**
 * Base error class with RFC 7807 support
 */
export class BaseError extends Error {
  public readonly code: ErrorCode | string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode | string,
    statusCode: number = 500,
    context?: Record<string, unknown>,
    isOperational: boolean = true
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();
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
      instance: instance,
      timestamp: this.timestamp.toISOString(),
      traceId: requestId
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString()
    };
  }
}

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Error class for indexer-specific issues
 */
export class IndexerError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INDEXER_ERROR,
    statusCode: number = 503,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static syncFailed(reason: string, slot?: number): IndexerError {
    return new IndexerError(
      `Indexer sync failed: ${reason}`,
      ErrorCode.INDEXER_SYNC_FAILED,
      503,
      { reason, slot }
    );
  }

  static processingFailed(signature: string, reason: string): IndexerError {
    return new IndexerError(
      `Failed to process transaction: ${reason}`,
      ErrorCode.INDEXER_PROCESSING_FAILED,
      500,
      { signature, reason }
    );
  }

  static notRunning(): IndexerError {
    return new IndexerError(
      'Indexer is not running',
      ErrorCode.INDEXER_NOT_RUNNING,
      503
    );
  }
}

/**
 * Error class for Solana/blockchain issues
 */
export class SolanaError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SOLANA_RPC_ERROR,
    statusCode: number = 503,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static timeout(operation: string, durationMs: number): SolanaError {
    return new SolanaError(
      `Solana RPC timeout during ${operation}`,
      ErrorCode.SOLANA_TIMEOUT,
      504,
      { operation, durationMs }
    );
  }

  static unavailable(endpoint?: string): SolanaError {
    return new SolanaError(
      'Solana RPC service unavailable',
      ErrorCode.SOLANA_RPC_UNAVAILABLE,
      503,
      endpoint ? { endpoint } : undefined
    );
  }

  static transactionNotFound(signature: string): SolanaError {
    return new SolanaError(
      `Transaction not found: ${signature.substring(0, 16)}...`,
      ErrorCode.SOLANA_TRANSACTION_NOT_FOUND,
      404,
      { signature: signature.substring(0, 16) }
    );
  }
}

/**
 * Error class for database issues
 */
export class DatabaseError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATABASE_ERROR,
    statusCode: number = 503,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static connectionFailed(database: string): DatabaseError {
    return new DatabaseError(
      `Database connection failed: ${database}`,
      ErrorCode.DATABASE_CONNECTION_FAILED,
      503,
      { database }
    );
  }

  static timeout(operation: string): DatabaseError {
    return new DatabaseError(
      `Database operation timeout: ${operation}`,
      ErrorCode.DATABASE_TIMEOUT,
      504,
      { operation }
    );
  }

  static mongoWriteFailed(collection: string, reason: string): DatabaseError {
    return new DatabaseError(
      `MongoDB write failed: ${reason}`,
      ErrorCode.MONGODB_WRITE_FAILED,
      503,
      { collection, reason }
    );
  }
}

/**
 * Error class for validation failures
 */
export class ValidationError extends BaseError {
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_FAILED,
    statusCode: number = 400,
    context?: Record<string, unknown>,
    validationErrors?: Array<{ field: string; message: string }>
  ) {
    super(message, code, statusCode, context);
    this.validationErrors = validationErrors;
  }

  static missingField(field: string): ValidationError {
    return new ValidationError(
      `Missing required field: ${field}`,
      ErrorCode.VALIDATION_MISSING_FIELD,
      400,
      { field }
    );
  }

  static invalidFormat(field: string, expected: string): ValidationError {
    return new ValidationError(
      `Invalid format for ${field}: expected ${expected}`,
      ErrorCode.VALIDATION_INVALID_FORMAT,
      400,
      { field, expected }
    );
  }

  toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    return {
      ...super.toProblemDetails(requestId, instance),
      validationErrors: this.validationErrors
    };
  }
}

/**
 * Error class for tenant issues
 */
export class TenantError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.TENANT_INVALID,
    statusCode: number = 403,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static missingContext(): TenantError {
    return new TenantError(
      'Tenant context is required but not provided',
      ErrorCode.TENANT_CONTEXT_MISSING,
      401
    );
  }

  static invalid(tenantId: string): TenantError {
    return new TenantError(
      'Invalid tenant ID format',
      ErrorCode.TENANT_INVALID,
      400,
      { tenantId: tenantId.substring(0, 8) + '...' }
    );
  }
}

/**
 * Error class for authentication failures
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    statusCode: number = 401,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static missingToken(): AuthenticationError {
    return new AuthenticationError(
      'Authentication token is required',
      ErrorCode.TOKEN_MISSING,
      401
    );
  }

  static invalidToken(reason?: string): AuthenticationError {
    return new AuthenticationError(
      reason || 'Invalid or malformed authentication token',
      ErrorCode.TOKEN_INVALID,
      401,
      reason ? { reason } : undefined
    );
  }

  static tokenExpired(): AuthenticationError {
    return new AuthenticationError(
      'Authentication token has expired',
      ErrorCode.TOKEN_EXPIRED,
      401
    );
  }

  // Keep the old method name for backwards compatibility
  static expiredToken(): AuthenticationError {
    return AuthenticationError.tokenExpired();
  }

  static insufficientPermissions(reason?: string): AuthenticationError {
    return new AuthenticationError(
      reason || 'Insufficient permissions',
      ErrorCode.FORBIDDEN,
      403,
      reason ? { reason } : undefined
    );
  }

  static forbidden(requiredPermission?: string): AuthenticationError {
    return new AuthenticationError(
      requiredPermission
        ? `Insufficient permissions. Required: ${requiredPermission}`
        : 'Access forbidden',
      ErrorCode.FORBIDDEN,
      403,
      requiredPermission ? { requiredPermission } : undefined
    );
  }
}

/**
 * Error class for rate limiting
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.RATE_LIMITED,
    retryAfter: number = 60,
    context?: Record<string, unknown>
  ) {
    super(message, code, 429, context);
    this.retryAfter = retryAfter;
  }

  static forTenant(tenantId: string, retryAfter: number): RateLimitError {
    return new RateLimitError(
      'Rate limit exceeded for tenant',
      ErrorCode.RATE_LIMIT_TENANT,
      retryAfter,
      { tenantId }
    );
  }

  toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    return {
      ...super.toProblemDetails(requestId, instance),
      retryAfter: this.retryAfter
    };
  }
}

/**
 * Not Found Error (for 404 handler)
 */
export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} '${identifier}' not found` : `${resource} not found`,
      ErrorCode.NOT_FOUND,
      404,
      { resource, identifier }
    );
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

export function isOperationalError(error: unknown): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

export function isIndexerError(error: unknown): error is IndexerError {
  return error instanceof IndexerError;
}

export function isSolanaError(error: unknown): error is SolanaError {
  return error instanceof SolanaError;
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isTenantError(error: unknown): error is TenantError {
  return error instanceof TenantError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

// =============================================================================
// ERROR HANDLER HELPER
// =============================================================================

/**
 * Convert any error to RFC 7807 ProblemDetails format
 */
export function toProblemDetails(
  error: unknown,
  requestId?: string,
  instance?: string
): ProblemDetails {
  if (isBaseError(error)) {
    return error.toProblemDetails(requestId, instance);
  }

  // Handle standard Error
  if (error instanceof Error) {
    return {
      type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
      title: 'Internal Server Error',
      status: 500,
      detail: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
      code: ErrorCode.INTERNAL_ERROR,
      instance,
      timestamp: new Date().toISOString(),
      traceId: requestId
    };
  }

  // Handle unknown error types
  return {
    type: 'https://api.tickettoken.com/errors/INTERNAL_ERROR',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
    code: ErrorCode.INTERNAL_ERROR,
    instance,
    timestamp: new Date().toISOString(),
    traceId: requestId
  };
}
