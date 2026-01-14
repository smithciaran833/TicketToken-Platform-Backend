/**
 * Custom Error Classes and Error Codes for Minting Service
 * 
 * Provides standardized error handling with:
 * - Custom error classes for different error categories
 * - Error codes for programmatic error handling
 * - Status codes for HTTP responses
 * - Optional context for debugging
 */

// =============================================================================
// ERROR CODES ENUM
// =============================================================================

/**
 * Standardized error codes for the minting service
 * Use these codes for programmatic error handling and logging
 */
export enum ErrorCode {
  // Minting errors (MINT_*)
  MINT_FAILED = 'MINT_FAILED',
  MINT_DUPLICATE = 'MINT_DUPLICATE',
  MINT_IN_PROGRESS = 'MINT_IN_PROGRESS',
  MINT_NOT_FOUND = 'MINT_NOT_FOUND',
  MINT_ALREADY_COMPLETED = 'MINT_ALREADY_COMPLETED',
  MINT_INVALID_STATE = 'MINT_INVALID_STATE',
  MINT_METADATA_INVALID = 'MINT_METADATA_INVALID',
  MINT_COLLECTION_INVALID = 'MINT_COLLECTION_INVALID',
  MINT_BATCH_FAILED = 'MINT_BATCH_FAILED',
  MINT_BATCH_PARTIAL = 'MINT_BATCH_PARTIAL',

  // Balance/Spending errors
  BALANCE_LOW = 'BALANCE_LOW',
  BALANCE_CHECK_FAILED = 'BALANCE_CHECK_FAILED',
  SPENDING_LIMIT_EXCEEDED = 'SPENDING_LIMIT_EXCEEDED',

  // Tenant errors (TENANT_*)
  TENANT_INVALID = 'TENANT_INVALID',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_CONTEXT_MISSING = 'TENANT_CONTEXT_MISSING',

  // IPFS errors (IPFS_*)
  IPFS_UPLOAD_FAILED = 'IPFS_UPLOAD_FAILED',
  IPFS_TIMEOUT = 'IPFS_TIMEOUT',
  IPFS_PIN_FAILED = 'IPFS_PIN_FAILED',
  IPFS_METADATA_INVALID = 'IPFS_METADATA_INVALID',
  IPFS_CID_VERIFICATION_FAILED = 'IPFS_CID_VERIFICATION_FAILED',
  IPFS_RATE_LIMITED = 'IPFS_RATE_LIMITED',

  // Solana errors (SOLANA_*)
  SOLANA_TIMEOUT = 'SOLANA_TIMEOUT',
  SOLANA_RPC_ERROR = 'SOLANA_RPC_ERROR',
  SOLANA_RPC_UNAVAILABLE = 'SOLANA_RPC_UNAVAILABLE',
  SOLANA_TRANSACTION_FAILED = 'SOLANA_TRANSACTION_FAILED',
  SOLANA_SIGNATURE_FAILED = 'SOLANA_SIGNATURE_FAILED',
  SOLANA_BLOCKHASH_EXPIRED = 'SOLANA_BLOCKHASH_EXPIRED',
  SOLANA_INSUFFICIENT_FUNDS = 'SOLANA_INSUFFICIENT_FUNDS',
  SOLANA_CONFIRMATION_TIMEOUT = 'SOLANA_CONFIRMATION_TIMEOUT',
  SOLANA_SIMULATION_FAILED = 'SOLANA_SIMULATION_FAILED',

  // Validation errors (VALIDATION_*)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_SCHEMA_ERROR = 'VALIDATION_SCHEMA_ERROR',

  // Authentication/Authorization errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  ROLE_INSUFFICIENT = 'ROLE_INSUFFICIENT',

  // Rate limiting errors
  RATE_LIMITED = 'RATE_LIMITED',
  RATE_LIMIT_TENANT = 'RATE_LIMIT_TENANT',
  RATE_LIMIT_GLOBAL = 'RATE_LIMIT_GLOBAL',

  // Job/Queue errors
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  JOB_FAILED = 'JOB_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  JOB_STALLED = 'JOB_STALLED',
  QUEUE_FULL = 'QUEUE_FULL',
  DLQ_MOVED = 'DLQ_MOVED',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_TIMEOUT = 'DATABASE_TIMEOUT',
  DATABASE_DEADLOCK = 'DATABASE_DEADLOCK',
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  LOCK_ACQUISITION_FAILED = 'LOCK_ACQUISITION_FAILED',

  // Circuit breaker errors
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  WEBHOOK_DUPLICATE = 'WEBHOOK_DUPLICATE'
}

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

/**
 * Base error class for all custom errors
 * Extends Error with additional properties for structured error handling
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
    
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging/response
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Error class for minting failures
 */
export class MintingError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.MINT_FAILED,
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  /**
   * Factory method for duplicate mint error
   */
  static duplicate(ticketId: string, tenantId: string): MintingError {
    return new MintingError(
      `Mint already exists for ticket ${ticketId}`,
      ErrorCode.MINT_DUPLICATE,
      409,
      { ticketId, tenantId }
    );
  }

  /**
   * Factory method for mint in progress error
   */
  static inProgress(ticketId: string, tenantId: string): MintingError {
    return new MintingError(
      `Mint already in progress for ticket ${ticketId}`,
      ErrorCode.MINT_IN_PROGRESS,
      409,
      { ticketId, tenantId }
    );
  }

  /**
   * Factory method for mint not found error
   */
  static notFound(mintId: string): MintingError {
    return new MintingError(
      `Mint ${mintId} not found`,
      ErrorCode.MINT_NOT_FOUND,
      404,
      { mintId }
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

  /**
   * Factory method for RPC timeout
   */
  static timeout(operation: string, durationMs: number): SolanaError {
    return new SolanaError(
      `Solana RPC timeout during ${operation}`,
      ErrorCode.SOLANA_TIMEOUT,
      504,
      { operation, durationMs }
    );
  }

  /**
   * Factory method for RPC unavailable
   */
  static unavailable(endpoint: string): SolanaError {
    return new SolanaError(
      'Solana RPC service unavailable',
      ErrorCode.SOLANA_RPC_UNAVAILABLE,
      503,
      { endpoint }
    );
  }

  /**
   * Factory method for insufficient funds
   */
  static insufficientFunds(required: number, available: number): SolanaError {
    return new SolanaError(
      'Insufficient SOL balance for transaction',
      ErrorCode.SOLANA_INSUFFICIENT_FUNDS,
      400,
      { required, available }
    );
  }

  /**
   * Factory method for blockhash expiration
   */
  static blockhashExpired(): SolanaError {
    return new SolanaError(
      'Transaction blockhash expired, retry required',
      ErrorCode.SOLANA_BLOCKHASH_EXPIRED,
      409
    );
  }
}

/**
 * Error class for input validation failures
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

  /**
   * Factory method from Zod errors
   */
  static fromZodError(zodError: { errors: Array<{ path: (string | number)[]; message: string }> }): ValidationError {
    const validationErrors = zodError.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));

    return new ValidationError(
      'Validation failed',
      ErrorCode.VALIDATION_FAILED,
      400,
      { errorCount: validationErrors.length },
      validationErrors
    );
  }

  /**
   * Factory method for missing required field
   */
  static missingField(field: string): ValidationError {
    return new ValidationError(
      `Missing required field: ${field}`,
      ErrorCode.VALIDATION_MISSING_FIELD,
      400,
      { field }
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors
    };
  }
}

/**
 * Error class for multi-tenancy issues
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

  /**
   * Factory method for missing tenant context
   */
  static missingContext(): TenantError {
    return new TenantError(
      'Tenant context is required but not provided',
      ErrorCode.TENANT_CONTEXT_MISSING,
      400
    );
  }

  /**
   * Factory method for tenant mismatch
   */
  static mismatch(requestTenantId: string, resourceTenantId: string): TenantError {
    return new TenantError(
      'Tenant ID mismatch - access denied',
      ErrorCode.TENANT_MISMATCH,
      403,
      { requestTenantId, resourceTenantId }
    );
  }

  /**
   * Factory method for invalid tenant
   */
  static invalid(tenantId: string): TenantError {
    return new TenantError(
      `Invalid tenant ID: ${tenantId}`,
      ErrorCode.TENANT_INVALID,
      400,
      { tenantId }
    );
  }
}

/**
 * Error class for IPFS/metadata issues
 */
export class IPFSError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.IPFS_UPLOAD_FAILED,
    statusCode: number = 502,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  /**
   * Factory method for upload timeout
   */
  static timeout(durationMs: number): IPFSError {
    return new IPFSError(
      'IPFS upload timed out',
      ErrorCode.IPFS_TIMEOUT,
      504,
      { durationMs }
    );
  }

  /**
   * Factory method for pin failure
   */
  static pinFailed(cid: string): IPFSError {
    return new IPFSError(
      `Failed to pin content to IPFS: ${cid}`,
      ErrorCode.IPFS_PIN_FAILED,
      502,
      { cid }
    );
  }

  /**
   * Factory method for CID verification failure
   */
  static cidVerificationFailed(expectedCid: string, actualCid: string): IPFSError {
    return new IPFSError(
      'IPFS CID verification failed - content integrity mismatch',
      ErrorCode.IPFS_CID_VERIFICATION_FAILED,
      500,
      { expectedCid, actualCid }
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

  /**
   * Factory method for invalid token
   */
  static invalidToken(): AuthenticationError {
    return new AuthenticationError(
      'Invalid or malformed authentication token',
      ErrorCode.TOKEN_INVALID,
      401
    );
  }

  /**
   * Factory method for expired token
   */
  static expiredToken(): AuthenticationError {
    return new AuthenticationError(
      'Authentication token has expired',
      ErrorCode.TOKEN_EXPIRED,
      401
    );
  }

  /**
   * Factory method for invalid signature
   */
  static invalidSignature(): AuthenticationError {
    return new AuthenticationError(
      'Invalid request signature',
      ErrorCode.SIGNATURE_INVALID,
      401
    );
  }

  /**
   * Factory method for forbidden access
   */
  static forbidden(requiredRole?: string): AuthenticationError {
    return new AuthenticationError(
      requiredRole ? `Insufficient permissions. Required role: ${requiredRole}` : 'Access forbidden',
      ErrorCode.FORBIDDEN,
      403,
      { requiredRole }
    );
  }

  /**
   * Factory method for insufficient role
   */
  static insufficientRole(userRole: string, requiredRole: string): AuthenticationError {
    return new AuthenticationError(
      `Insufficient role: ${userRole}. Required: ${requiredRole}`,
      ErrorCode.ROLE_INSUFFICIENT,
      403,
      { userRole, requiredRole }
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

  /**
   * Factory method for tenant rate limit
   */
  static forTenant(tenantId: string, retryAfter: number): RateLimitError {
    return new RateLimitError(
      'Rate limit exceeded for tenant',
      ErrorCode.RATE_LIMIT_TENANT,
      retryAfter,
      { tenantId }
    );
  }

  /**
   * Factory method for global rate limit
   */
  static global(retryAfter: number): RateLimitError {
    return new RateLimitError(
      'Global rate limit exceeded',
      ErrorCode.RATE_LIMIT_GLOBAL,
      retryAfter
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter
    };
  }
}

// =============================================================================
// ERROR TYPE GUARDS
// =============================================================================

/**
 * Check if error is a custom BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Check if error is an operational error (expected, can be handled gracefully)
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if error is a specific error type
 */
export function isMintingError(error: unknown): error is MintingError {
  return error instanceof MintingError;
}

export function isSolanaError(error: unknown): error is SolanaError {
  return error instanceof SolanaError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isTenantError(error: unknown): error is TenantError {
  return error instanceof TenantError;
}

export function isIPFSError(error: unknown): error is IPFSError {
  return error instanceof IPFSError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
