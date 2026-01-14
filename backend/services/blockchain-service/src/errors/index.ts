/**
 * Custom Error Classes and Error Codes for Blockchain Service
 * 
 * Issues Fixed:
 * - #7: RFC 7807 format error responses
 * - #8: Stack traces exposed (controlled exposure)
 * - Issue SL5: Error codes for all service errors
 * 
 * Provides standardized error handling with:
 * - Custom error classes for different error categories
 * - Error codes for programmatic error handling
 * - Status codes for HTTP responses
 * - RFC 7807 compliant error format
 */

// =============================================================================
// ERROR CODES ENUM
// =============================================================================

/**
 * Standardized error codes for the blockchain service
 */
export enum ErrorCode {
  // Blockchain/Solana errors (SOLANA_*)
  SOLANA_TIMEOUT = 'SOLANA_TIMEOUT',
  SOLANA_RPC_ERROR = 'SOLANA_RPC_ERROR',
  SOLANA_RPC_UNAVAILABLE = 'SOLANA_RPC_UNAVAILABLE',
  SOLANA_TRANSACTION_FAILED = 'SOLANA_TRANSACTION_FAILED',
  SOLANA_SIGNATURE_FAILED = 'SOLANA_SIGNATURE_FAILED',
  SOLANA_BLOCKHASH_EXPIRED = 'SOLANA_BLOCKHASH_EXPIRED',
  SOLANA_INSUFFICIENT_FUNDS = 'SOLANA_INSUFFICIENT_FUNDS',
  SOLANA_CONFIRMATION_TIMEOUT = 'SOLANA_CONFIRMATION_TIMEOUT',
  SOLANA_SIMULATION_FAILED = 'SOLANA_SIMULATION_FAILED',

  // Minting errors (MINT_*)
  MINT_FAILED = 'MINT_FAILED',
  MINT_DUPLICATE = 'MINT_DUPLICATE',
  MINT_IN_PROGRESS = 'MINT_IN_PROGRESS',
  MINT_NOT_FOUND = 'MINT_NOT_FOUND',
  MINT_ALREADY_COMPLETED = 'MINT_ALREADY_COMPLETED',
  MINT_INVALID_STATE = 'MINT_INVALID_STATE',
  MINT_METADATA_INVALID = 'MINT_METADATA_INVALID',

  // Wallet errors (WALLET_*)
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_NOT_INITIALIZED = 'WALLET_NOT_INITIALIZED',
  WALLET_BALANCE_LOW = 'WALLET_BALANCE_LOW',
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  TREASURY_NOT_INITIALIZED = 'TREASURY_NOT_INITIALIZED',
  TREASURY_BALANCE_LOW = 'TREASURY_BALANCE_LOW',

  // Tenant errors (TENANT_*)
  TENANT_INVALID = 'TENANT_INVALID',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_CONTEXT_MISSING = 'TENANT_CONTEXT_MISSING',

  // Validation errors (VALIDATION_*)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',

  // Authentication/Authorization errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',

  // Rate limiting errors
  RATE_LIMITED = 'RATE_LIMITED',
  RATE_LIMIT_TENANT = 'RATE_LIMIT_TENANT',

  // Job/Queue errors
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  JOB_FAILED = 'JOB_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  QUEUE_FULL = 'QUEUE_FULL',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_TIMEOUT = 'DATABASE_TIMEOUT',
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
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT'
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
   * Issue #7: RFC 7807 format
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

  static insufficientFunds(required: number, available: number): SolanaError {
    return new SolanaError(
      'Insufficient SOL balance for transaction',
      ErrorCode.SOLANA_INSUFFICIENT_FUNDS,
      400,
      { required, available }
    );
  }

  static blockhashExpired(): SolanaError {
    return new SolanaError(
      'Transaction blockhash expired, retry required',
      ErrorCode.SOLANA_BLOCKHASH_EXPIRED,
      409
    );
  }
}

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

  static duplicate(ticketId: string, tenantId: string): MintingError {
    return new MintingError(
      `Mint already exists for ticket ${ticketId}`,
      ErrorCode.MINT_DUPLICATE,
      409,
      { ticketId, tenantId }
    );
  }

  static inProgress(ticketId: string): MintingError {
    return new MintingError(
      `Mint already in progress for ticket ${ticketId}`,
      ErrorCode.MINT_IN_PROGRESS,
      409,
      { ticketId }
    );
  }

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
 * Error class for wallet issues
 * AUDIT FIX #77-80: Enhanced for wallet security
 */
export class WalletError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.WALLET_NOT_FOUND,
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
  }

  static notInitialized(): WalletError {
    return new WalletError(
      'Treasury wallet not initialized',
      ErrorCode.TREASURY_NOT_INITIALIZED,
      503
    );
  }

  static lowBalance(current: number, required: number): WalletError {
    return new WalletError(
      'Treasury wallet has insufficient balance',
      ErrorCode.TREASURY_BALANCE_LOW,
      400,
      { current, required }
    );
  }

  static connectionFailed(reason: string, context?: Record<string, unknown>): WalletError {
    return new WalletError(
      `Wallet connection failed: ${reason}`,
      ErrorCode.WALLET_CONNECTION_FAILED,
      400,
      context
    );
  }

  static notFound(walletAddress: string): WalletError {
    return new WalletError(
      `Wallet not found: ${walletAddress.substring(0, 8)}...`,
      ErrorCode.WALLET_NOT_FOUND,
      404,
      { walletAddress: walletAddress.substring(0, 8) + '...' }
    );
  }

  static invalidSignature(): WalletError {
    return new WalletError(
      'Invalid wallet signature',
      ErrorCode.SIGNATURE_INVALID,
      401
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
      400
    );
  }

  static mismatch(requestTenantId: string, resourceTenantId: string): TenantError {
    return new TenantError(
      'Tenant ID mismatch - access denied',
      ErrorCode.TENANT_MISMATCH,
      403,
      { requestTenantId, resourceTenantId }
    );
  }

  static invalid(tenantId: string): TenantError {
    return new TenantError(
      `Invalid tenant ID format`,
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

  static invalidToken(): AuthenticationError {
    return new AuthenticationError(
      'Invalid or malformed authentication token',
      ErrorCode.TOKEN_INVALID,
      401
    );
  }

  static expiredToken(): AuthenticationError {
    return new AuthenticationError(
      'Authentication token has expired',
      ErrorCode.TOKEN_EXPIRED,
      401
    );
  }

  static forbidden(requiredRole?: string): AuthenticationError {
    return new AuthenticationError(
      requiredRole ? `Insufficient permissions. Required role: ${requiredRole}` : 'Access forbidden',
      ErrorCode.FORBIDDEN,
      403,
      requiredRole ? { requiredRole } : undefined
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
 * Issue #6: 404 handler
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

export function isSolanaError(error: unknown): error is SolanaError {
  return error instanceof SolanaError;
}

export function isMintingError(error: unknown): error is MintingError {
  return error instanceof MintingError;
}

export function isWalletError(error: unknown): error is WalletError {
  return error instanceof WalletError;
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
