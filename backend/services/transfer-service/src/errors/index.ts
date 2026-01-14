/**
 * Error Classes for Transfer Service
 * 
 * AUDIT FIXES:
 * - ERR-H2: No RFC 7807 error format → Structured error classes
 * - ERR-H5: Blockchain errors not wrapped → BlockchainError class
 * - BC-H4: No error categorization → Categorized error types
 * 
 * RFC 7807 Problem Details format:
 * {
 *   type: string (URI reference)
 *   title: string
 *   status: number
 *   detail: string
 *   instance: string (request ID)
 *   ...extensions
 * }
 */

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string;
  public readonly timestamp: string;
  public readonly requestId?: string;
  public readonly tenantId?: string;
  public readonly cause?: Error;

  constructor(params: {
    code: string;
    statusCode: number;
    message: string;
    type?: string;
    title?: string;
    detail?: string;
    isOperational?: boolean;
    requestId?: string;
    tenantId?: string;
    cause?: Error;
  }) {
    super(params.message);
    
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.type = params.type || `urn:error:transfer-service:${params.code.toLowerCase()}`;
    this.title = params.title || params.message;
    this.detail = params.detail || params.message;
    this.isOperational = params.isOperational ?? true;
    this.timestamp = new Date().toISOString();
    this.requestId = params.requestId;
    this.tenantId = params.tenantId;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Set prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    
    // Capture cause if provided
    if (params.cause) {
      this.cause = params.cause;
    }
  }

  /**
   * Convert to RFC 7807 Problem Details format
   */
  toRFC7807(instance?: string): Record<string, any> {
    return {
      type: this.type,
      title: this.title,
      status: this.statusCode,
      detail: this.detail,
      instance: instance || this.requestId,
      code: this.code,
      timestamp: this.timestamp,
      ...(this.tenantId && { tenantId: this.tenantId })
    };
  }
}

// =============================================================================
// VALIDATION ERRORS
// =============================================================================

export class ValidationError extends BaseError {
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(params: {
    message: string;
    validationErrors?: Array<{ field: string; message: string }>;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: params.message,
      title: 'Validation Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.validationErrors = params.validationErrors;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      validationErrors: this.validationErrors
    };
  }
}

export class BadRequestError extends BaseError {
  constructor(message: string, requestId?: string) {
    super({
      code: 'BAD_REQUEST',
      statusCode: 400,
      message,
      title: 'Bad Request',
      requestId
    });
  }
}

// =============================================================================
// AUTHENTICATION & AUTHORIZATION ERRORS
// =============================================================================

export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Authentication required', requestId?: string) {
    super({
      code: 'UNAUTHORIZED',
      statusCode: 401,
      message,
      title: 'Unauthorized',
      requestId
    });
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Access denied', requestId?: string, tenantId?: string) {
    super({
      code: 'FORBIDDEN',
      statusCode: 403,
      message,
      title: 'Forbidden',
      requestId,
      tenantId
    });
  }
}

// =============================================================================
// NOT FOUND ERRORS
// =============================================================================

export class NotFoundError extends BaseError {
  public readonly resource: string;
  public readonly resourceId?: string;

  constructor(resource: string, resourceId?: string, requestId?: string) {
    super({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: resourceId 
        ? `${resource} with ID ${resourceId} not found`
        : `${resource} not found`,
      title: 'Resource Not Found',
      requestId
    });
    this.resource = resource;
    this.resourceId = resourceId;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      resource: this.resource,
      resourceId: this.resourceId
    };
  }
}

export class TransferNotFoundError extends NotFoundError {
  constructor(transferId: string, requestId?: string) {
    super('Transfer', transferId, requestId);
  }
}

export class TicketNotFoundError extends NotFoundError {
  constructor(ticketId: string, requestId?: string) {
    super('Ticket', ticketId, requestId);
  }
}

// =============================================================================
// CONFLICT ERRORS
// =============================================================================

export class ConflictError extends BaseError {
  constructor(message: string, requestId?: string) {
    super({
      code: 'CONFLICT',
      statusCode: 409,
      message,
      title: 'Resource Conflict',
      requestId
    });
  }
}

export class TransferAlreadyExistsError extends ConflictError {
  constructor(ticketId: string, requestId?: string) {
    super(`Transfer already exists for ticket ${ticketId}`, requestId);
  }
}

export class TransferAlreadyAcceptedError extends ConflictError {
  constructor(transferId: string, requestId?: string) {
    super(`Transfer ${transferId} has already been accepted`, requestId);
  }
}

// =============================================================================
// RATE LIMIT ERRORS
// =============================================================================

export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, requestId?: string) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      message: 'Rate limit exceeded',
      title: 'Too Many Requests',
      requestId
    });
    this.retryAfter = retryAfter;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      retryAfter: this.retryAfter
    };
  }
}

// =============================================================================
// BLOCKCHAIN ERRORS (BC-H4)
// =============================================================================

export enum BlockchainErrorCategory {
  NETWORK = 'NETWORK',           // RPC connectivity issues
  TRANSACTION = 'TRANSACTION',   // Transaction submission failures
  SIGNATURE = 'SIGNATURE',       // Signature/signing issues
  BALANCE = 'BALANCE',           // Insufficient funds
  TIMEOUT = 'TIMEOUT',           // Transaction timeout
  CONFIRMATION = 'CONFIRMATION', // Confirmation failures
  SIMULATION = 'SIMULATION',     // Simulation failures
  RATE_LIMIT = 'RATE_LIMIT',     // RPC rate limiting
  INTERNAL = 'INTERNAL'          // Unknown/internal errors
}

export class BlockchainError extends BaseError {
  public readonly category: BlockchainErrorCategory;
  public readonly signature?: string;
  public readonly transactionId?: string;
  public readonly retryable: boolean;
  public readonly originalError?: Error;

  constructor(params: {
    message: string;
    category: BlockchainErrorCategory;
    signature?: string;
    transactionId?: string;
    retryable?: boolean;
    cause?: Error;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: `BLOCKCHAIN_${params.category}`,
      statusCode: params.category === BlockchainErrorCategory.RATE_LIMIT ? 429 : 502,
      message: params.message,
      type: `urn:error:transfer-service:blockchain:${params.category.toLowerCase()}`,
      title: `Blockchain ${params.category} Error`,
      detail: params.message,
      isOperational: true,
      requestId: params.requestId,
      tenantId: params.tenantId,
      cause: params.cause
    });
    
    this.category = params.category;
    this.signature = params.signature;
    this.transactionId = params.transactionId;
    this.retryable = params.retryable ?? this.isRetryable(params.category);
    this.originalError = params.cause;
  }

  private isRetryable(category: BlockchainErrorCategory): boolean {
    return [
      BlockchainErrorCategory.NETWORK,
      BlockchainErrorCategory.TIMEOUT,
      BlockchainErrorCategory.RATE_LIMIT
    ].includes(category);
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      category: this.category,
      signature: this.signature,
      transactionId: this.transactionId,
      retryable: this.retryable
    };
  }
}

// Factory functions for common blockchain errors
export const BlockchainErrors = {
  networkError: (message: string, cause?: Error, requestId?: string) =>
    new BlockchainError({
      message,
      category: BlockchainErrorCategory.NETWORK,
      retryable: true,
      cause,
      requestId
    }),

  transactionError: (message: string, signature?: string, cause?: Error, requestId?: string) =>
    new BlockchainError({
      message,
      category: BlockchainErrorCategory.TRANSACTION,
      signature,
      retryable: false,
      cause,
      requestId
    }),

  signatureError: (message: string, requestId?: string) =>
    new BlockchainError({
      message,
      category: BlockchainErrorCategory.SIGNATURE,
      retryable: false,
      requestId
    }),

  balanceError: (message: string, requestId?: string) =>
    new BlockchainError({
      message,
      category: BlockchainErrorCategory.BALANCE,
      retryable: false,
      requestId
    }),

  timeoutError: (signature?: string, requestId?: string) =>
    new BlockchainError({
      message: 'Transaction confirmation timed out',
      category: BlockchainErrorCategory.TIMEOUT,
      signature,
      retryable: true,
      requestId
    }),

  confirmationError: (signature: string, requestId?: string) =>
    new BlockchainError({
      message: `Transaction ${signature} failed to confirm`,
      category: BlockchainErrorCategory.CONFIRMATION,
      signature,
      retryable: true,
      requestId
    }),

  simulationError: (message: string, requestId?: string) =>
    new BlockchainError({
      message,
      category: BlockchainErrorCategory.SIMULATION,
      retryable: false,
      requestId
    }),

  rateLimitError: (requestId?: string) =>
    new BlockchainError({
      message: 'Blockchain RPC rate limit exceeded',
      category: BlockchainErrorCategory.RATE_LIMIT,
      retryable: true,
      requestId
    })
};

// =============================================================================
// DATABASE ERRORS
// =============================================================================

export class DatabaseError extends BaseError {
  public readonly query?: string;
  public readonly constraint?: string;

  constructor(params: {
    message: string;
    query?: string;
    constraint?: string;
    cause?: Error;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'DATABASE_ERROR',
      statusCode: 500,
      message: params.message,
      title: 'Database Error',
      detail: params.message,
      isOperational: true,
      requestId: params.requestId,
      tenantId: params.tenantId,
      cause: params.cause
    });
    this.query = params.query;
    this.constraint = params.constraint;
  }
}

export class DatabaseConnectionError extends BaseError {
  constructor(message: string = 'Database connection failed', requestId?: string) {
    super({
      code: 'DATABASE_CONNECTION_ERROR',
      statusCode: 503,
      message,
      title: 'Database Unavailable',
      isOperational: true,
      requestId
    });
  }
}

// =============================================================================
// INTERNAL ERRORS
// =============================================================================

export class InternalError extends BaseError {
  constructor(message: string = 'An unexpected error occurred', requestId?: string) {
    super({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message,
      title: 'Internal Server Error',
      isOperational: false,
      requestId
    });
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(service: string, requestId?: string) {
    super({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      message: `${service} is temporarily unavailable`,
      title: 'Service Unavailable',
      isOperational: true,
      requestId
    });
  }
}

// =============================================================================
// TRANSFER-SPECIFIC ERRORS
// =============================================================================

export class TransferError extends BaseError {
  public readonly transferId?: string;
  public readonly ticketId?: string;

  constructor(params: {
    code: string;
    message: string;
    statusCode?: number;
    transferId?: string;
    ticketId?: string;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code,
      statusCode: params.statusCode || 400,
      message: params.message,
      title: 'Transfer Error',
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.transferId = params.transferId;
    this.ticketId = params.ticketId;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      transferId: this.transferId,
      ticketId: this.ticketId
    };
  }
}

export class InvalidAcceptanceCodeError extends TransferError {
  constructor(transferId: string, requestId?: string) {
    super({
      code: 'INVALID_ACCEPTANCE_CODE',
      message: 'Invalid or expired acceptance code',
      statusCode: 400,
      transferId,
      requestId
    });
  }
}

export class TransferExpiredError extends TransferError {
  constructor(transferId: string, requestId?: string) {
    super({
      code: 'TRANSFER_EXPIRED',
      message: 'Transfer has expired',
      statusCode: 410,
      transferId,
      requestId
    });
  }
}

export class TransferCancelledError extends TransferError {
  constructor(transferId: string, requestId?: string) {
    super({
      code: 'TRANSFER_CANCELLED',
      message: 'Transfer has been cancelled',
      statusCode: 410,
      transferId,
      requestId
    });
  }
}

export class TicketNotTransferableError extends TransferError {
  constructor(ticketId: string, reason: string, requestId?: string) {
    super({
      code: 'TICKET_NOT_TRANSFERABLE',
      message: `Ticket cannot be transferred: ${reason}`,
      statusCode: 400,
      ticketId,
      requestId
    });
  }
}

// =============================================================================
// ERROR UTILITIES
// =============================================================================

/**
 * Check if error is an operational error (expected, handled)
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
export function isErrorType<T extends BaseError>(
  error: unknown,
  errorClass: new (...args: any[]) => T
): error is T {
  return error instanceof errorClass;
}

/**
 * Convert unknown error to BaseError
 */
export function toBaseError(error: unknown, requestId?: string): BaseError {
  if (error instanceof BaseError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new InternalError(error.message, requestId);
  }
  
  return new InternalError(String(error), requestId);
}

/**
 * Categorize blockchain error from RPC response
 */
export function categorizeBlockchainError(
  error: Error,
  requestId?: string
): BlockchainError {
  const message = error.message.toLowerCase();
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return BlockchainErrors.timeoutError(undefined, requestId);
  }
  
  if (message.includes('rate limit') || message.includes('429')) {
    return BlockchainErrors.rateLimitError(requestId);
  }
  
  if (message.includes('insufficient') || message.includes('balance')) {
    return BlockchainErrors.balanceError(error.message, requestId);
  }
  
  if (message.includes('signature') || message.includes('sign')) {
    return BlockchainErrors.signatureError(error.message, requestId);
  }
  
  if (message.includes('network') || message.includes('connect') || message.includes('econnrefused')) {
    return BlockchainErrors.networkError(error.message, error, requestId);
  }
  
  if (message.includes('simulation') || message.includes('simulate')) {
    return BlockchainErrors.simulationError(error.message, requestId);
  }
  
  // Default to transaction error
  return new BlockchainError({
    message: error.message,
    category: BlockchainErrorCategory.INTERNAL,
    retryable: false,
    cause: error,
    requestId
  });
}

export default {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TransferNotFoundError,
  TicketNotFoundError,
  ConflictError,
  TransferAlreadyExistsError,
  TransferAlreadyAcceptedError,
  RateLimitError,
  BlockchainError,
  BlockchainErrorCategory,
  BlockchainErrors,
  DatabaseError,
  DatabaseConnectionError,
  InternalError,
  ServiceUnavailableError,
  TransferError,
  InvalidAcceptanceCodeError,
  TransferExpiredError,
  TransferCancelledError,
  TicketNotTransferableError,
  isOperationalError,
  isErrorType,
  toBaseError,
  categorizeBlockchainError
};
