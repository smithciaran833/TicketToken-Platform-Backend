/**
 * RFC 7807 Error Classes for Integration Service
 * 
 * AUDIT FIXES:
 * - ERR-2: Not using RFC 7807 → Structured error format
 * - ERR-3: No correlation ID in errors → requestId included
 * - ERR-4: Stack traces exposed → Sanitized in production
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
  public readonly errorCause?: Error;

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
    this.type = params.type || `urn:error:integration-service:${params.code.toLowerCase()}`;
    this.title = params.title || params.message;
    this.detail = params.detail || params.message;
    this.isOperational = params.isOperational ?? true;
    this.timestamp = new Date().toISOString();
    this.requestId = params.requestId;
    this.tenantId = params.tenantId;

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, new.target.prototype);
    
    if (params.cause) {
      this.errorCause = params.cause;
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

// Alias for backwards compatibility
export class AuthenticationError extends UnauthorizedError {
  constructor(message: string = 'Authentication required', requestId?: string) {
    super(message, requestId);
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

export class InvalidWebhookSignatureError extends UnauthorizedError {
  public readonly provider: string;

  constructor(provider: string, requestId?: string) {
    super(`Invalid webhook signature for provider: ${provider}`, requestId);
    this.provider = provider;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      provider: this.provider
    };
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

export class IntegrationNotFoundError extends NotFoundError {
  constructor(integrationId: string, requestId?: string) {
    super('Integration', integrationId, requestId);
  }
}

export class ConnectionNotFoundError extends NotFoundError {
  constructor(connectionId: string, requestId?: string) {
    super('Connection', connectionId, requestId);
  }
}

export class MappingNotFoundError extends NotFoundError {
  constructor(mappingId: string, requestId?: string) {
    super('Mapping', mappingId, requestId);
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

export class IntegrationAlreadyExistsError extends ConflictError {
  constructor(provider: string, venueId: string, requestId?: string) {
    super(`Integration for provider ${provider} already exists for venue ${venueId}`, requestId);
  }
}

export class IdempotencyConflictError extends BaseError {
  public readonly idempotencyKey: string;
  public readonly retryAfter: number;

  constructor(idempotencyKey: string, retryAfter: number = 5, requestId?: string) {
    super({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
      message: 'Request with this Idempotency-Key is still being processed',
      title: 'Idempotency Conflict',
      requestId
    });
    this.idempotencyKey = idempotencyKey;
    this.retryAfter = retryAfter;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      idempotencyKey: this.idempotencyKey,
      retryAfter: this.retryAfter
    };
  }
}

// =============================================================================
// RATE LIMIT ERRORS
// =============================================================================

export class RateLimitError extends BaseError {
  public readonly retryAfter: number;
  public readonly limit?: number;
  public readonly remaining?: number;

  constructor(params: {
    retryAfter: number;
    limit?: number;
    remaining?: number;
    requestId?: string;
  }) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      message: 'Rate limit exceeded',
      title: 'Too Many Requests',
      requestId: params.requestId
    });
    this.retryAfter = params.retryAfter;
    this.limit = params.limit;
    this.remaining = params.remaining;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      retryAfter: this.retryAfter,
      limit: this.limit,
      remaining: this.remaining
    };
  }
}

// =============================================================================
// INTEGRATION-SPECIFIC ERRORS
// =============================================================================

export enum IntegrationErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  TIMEOUT = 'TIMEOUT',
  NETWORK = 'NETWORK',
  PROVIDER = 'PROVIDER',
  INTERNAL = 'INTERNAL'
}

export class IntegrationError extends BaseError {
  public readonly provider: string;
  public readonly category: IntegrationErrorCategory;
  public readonly retryable: boolean;
  public readonly providerError?: any;

  constructor(params: {
    message: string;
    provider: string;
    category: IntegrationErrorCategory;
    retryable?: boolean;
    providerError?: any;
    cause?: Error;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: `INTEGRATION_${params.category}`,
      statusCode: IntegrationError.getCategoryStatusCode(params.category),
      message: params.message,
      type: `urn:error:integration-service:provider:${params.category.toLowerCase()}`,
      title: `Integration ${params.category} Error`,
      detail: params.message,
      isOperational: true,
      requestId: params.requestId,
      tenantId: params.tenantId,
      cause: params.cause
    });
    
    this.provider = params.provider;
    this.category = params.category;
    this.retryable = params.retryable ?? this.isRetryable(params.category);
    this.providerError = params.providerError;
  }

  private static getCategoryStatusCode(category: IntegrationErrorCategory): number {
    const statusCodes: Record<IntegrationErrorCategory, number> = {
      [IntegrationErrorCategory.AUTHENTICATION]: 401,
      [IntegrationErrorCategory.AUTHORIZATION]: 403,
      [IntegrationErrorCategory.RATE_LIMIT]: 429,
      [IntegrationErrorCategory.VALIDATION]: 400,
      [IntegrationErrorCategory.NOT_FOUND]: 404,
      [IntegrationErrorCategory.CONFLICT]: 409,
      [IntegrationErrorCategory.TIMEOUT]: 504,
      [IntegrationErrorCategory.NETWORK]: 502,
      [IntegrationErrorCategory.PROVIDER]: 502,
      [IntegrationErrorCategory.INTERNAL]: 500
    };
    return statusCodes[category];
  }

  private isRetryable(category: IntegrationErrorCategory): boolean {
    return [
      IntegrationErrorCategory.RATE_LIMIT,
      IntegrationErrorCategory.TIMEOUT,
      IntegrationErrorCategory.NETWORK
    ].includes(category);
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      provider: this.provider,
      category: this.category,
      retryable: this.retryable
    };
  }
}

// Factory functions for common integration errors
export const IntegrationErrors = {
  authenticationError: (provider: string, message: string, requestId?: string) =>
    new IntegrationError({
      message,
      provider,
      category: IntegrationErrorCategory.AUTHENTICATION,
      retryable: false,
      requestId
    }),

  authorizationError: (provider: string, message: string, requestId?: string) =>
    new IntegrationError({
      message,
      provider,
      category: IntegrationErrorCategory.AUTHORIZATION,
      retryable: false,
      requestId
    }),

  rateLimitError: (provider: string, retryAfter?: number, requestId?: string) =>
    new IntegrationError({
      message: `Rate limit exceeded for ${provider}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      provider,
      category: IntegrationErrorCategory.RATE_LIMIT,
      retryable: true,
      requestId
    }),

  timeoutError: (provider: string, requestId?: string) =>
    new IntegrationError({
      message: `Request to ${provider} timed out`,
      provider,
      category: IntegrationErrorCategory.TIMEOUT,
      retryable: true,
      requestId
    }),

  networkError: (provider: string, cause?: Error, requestId?: string) =>
    new IntegrationError({
      message: `Network error connecting to ${provider}`,
      provider,
      category: IntegrationErrorCategory.NETWORK,
      retryable: true,
      cause,
      requestId
    }),

  providerError: (provider: string, message: string, providerError?: any, requestId?: string) =>
    new IntegrationError({
      message,
      provider,
      category: IntegrationErrorCategory.PROVIDER,
      retryable: false,
      providerError,
      requestId
    })
};

// =============================================================================
// OAUTH ERRORS
// =============================================================================

export class OAuthError extends BaseError {
  public readonly provider: string;
  public readonly oauthError?: string;
  public readonly oauthErrorDescription?: string;

  constructor(params: {
    message: string;
    provider: string;
    oauthError?: string;
    oauthErrorDescription?: string;
    requestId?: string;
  }) {
    super({
      code: 'OAUTH_ERROR',
      statusCode: 400,
      message: params.message,
      title: 'OAuth Error',
      requestId: params.requestId
    });
    this.provider = params.provider;
    this.oauthError = params.oauthError;
    this.oauthErrorDescription = params.oauthErrorDescription;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      provider: this.provider,
      oauthError: this.oauthError,
      oauthErrorDescription: this.oauthErrorDescription
    };
  }
}

export class OAuthStateError extends OAuthError {
  constructor(provider: string, requestId?: string) {
    super({
      message: 'Invalid or expired OAuth state token',
      provider,
      oauthError: 'invalid_state',
      requestId
    });
  }
}

export class OAuthTokenError extends OAuthError {
  constructor(provider: string, message: string, requestId?: string) {
    super({
      message,
      provider,
      oauthError: 'token_error',
      requestId
    });
  }
}

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
 * Categorize provider error from API response
 */
export function categorizeProviderError(
  provider: string,
  error: Error,
  statusCode?: number,
  requestId?: string
): IntegrationError {
  const message = error.message.toLowerCase();
  
  if (statusCode === 401 || message.includes('unauthorized') || message.includes('authentication')) {
    return IntegrationErrors.authenticationError(provider, error.message, requestId);
  }
  
  if (statusCode === 403 || message.includes('forbidden') || message.includes('permission')) {
    return IntegrationErrors.authorizationError(provider, error.message, requestId);
  }
  
  if (statusCode === 429 || message.includes('rate limit') || message.includes('too many')) {
    return IntegrationErrors.rateLimitError(provider, undefined, requestId);
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return IntegrationErrors.timeoutError(provider, requestId);
  }
  
  if (message.includes('network') || message.includes('connect') || message.includes('econnrefused')) {
    return IntegrationErrors.networkError(provider, error, requestId);
  }
  
  return IntegrationErrors.providerError(provider, error.message, undefined, requestId);
}

export default {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  AuthenticationError,
  ForbiddenError,
  InvalidWebhookSignatureError,
  NotFoundError,
  IntegrationNotFoundError,
  ConnectionNotFoundError,
  MappingNotFoundError,
  ConflictError,
  IntegrationAlreadyExistsError,
  IdempotencyConflictError,
  RateLimitError,
  IntegrationError,
  IntegrationErrorCategory,
  IntegrationErrors,
  OAuthError,
  OAuthStateError,
  OAuthTokenError,
  DatabaseError,
  DatabaseConnectionError,
  InternalError,
  ServiceUnavailableError,
  isOperationalError,
  isErrorType,
  toBaseError,
  categorizeProviderError
};
