/**
 * Error Classes for Compliance Service
 * 
 * AUDIT FIXES:
 * - ERR-3: Not RFC 7807 format → Structured error classes
 * - ERR-4: No correlation ID → Request ID in errors
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
    this.type = params.type || `urn:error:compliance-service:${params.code.toLowerCase().replace(/_/g, '-')}`;
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
  public readonly validationErrors?: Array<{ field: string; message: string; code?: string }>;

  constructor(params: {
    message: string;
    validationErrors?: Array<{ field: string; message: string; code?: string }>;
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
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      code: 'BAD_REQUEST',
      statusCode: 400,
      message,
      title: 'Bad Request',
      requestId,
      tenantId
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

export class VenueNotFoundError extends NotFoundError {
  constructor(venueId: string, requestId?: string) {
    super('Venue', venueId, requestId);
  }
}

export class DocumentNotFoundError extends NotFoundError {
  constructor(documentId: string, requestId?: string) {
    super('Document', documentId, requestId);
  }
}

export class TaxRecordNotFoundError extends NotFoundError {
  constructor(recordId: string, requestId?: string) {
    super('TaxRecord', recordId, requestId);
  }
}

// =============================================================================
// CONFLICT ERRORS
// =============================================================================

export class ConflictError extends BaseError {
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      code: 'CONFLICT',
      statusCode: 409,
      message,
      title: 'Resource Conflict',
      requestId,
      tenantId
    });
  }
}

export class DuplicateResourceError extends ConflictError {
  public readonly resource: string;
  public readonly identifier?: string;

  constructor(resource: string, identifier?: string, requestId?: string) {
    super(
      identifier 
        ? `${resource} with identifier ${identifier} already exists`
        : `${resource} already exists`,
      requestId
    );
    this.resource = resource;
    this.identifier = identifier;
  }
}

export class Duplicate1099Error extends ConflictError {
  constructor(venueId: string, year: number, requestId?: string) {
    super(`1099 form already exists for venue ${venueId} for year ${year}`, requestId);
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
// COMPLIANCE-SPECIFIC ERRORS
// =============================================================================

/**
 * OFAC Screening Errors
 */
export class OFACError extends BaseError {
  public readonly screeningId?: string;
  public readonly matchScore?: number;

  constructor(params: {
    message: string;
    code?: string;
    screeningId?: string;
    matchScore?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code || 'OFAC_ERROR',
      statusCode: 422,
      message: params.message,
      type: `urn:error:compliance-service:ofac:${(params.code || 'error').toLowerCase().replace(/_/g, '-')}`,
      title: 'OFAC Screening Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.screeningId = params.screeningId;
    this.matchScore = params.matchScore;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      screeningId: this.screeningId,
      matchScore: this.matchScore
    };
  }
}

export class OFACMatchError extends OFACError {
  constructor(name: string, matchScore: number, requestId?: string) {
    super({
      message: `OFAC potential match found for ${name} with score ${matchScore}`,
      code: 'OFAC_MATCH',
      matchScore,
      requestId
    });
  }
}

export class OFACServiceUnavailableError extends OFACError {
  constructor(requestId?: string) {
    super({
      message: 'OFAC screening service is temporarily unavailable',
      code: 'OFAC_SERVICE_UNAVAILABLE',
      requestId
    });
  }
}

/**
 * Tax/1099 Errors
 */
export class TaxError extends BaseError {
  public readonly venueId?: string;
  public readonly taxYear?: number;

  constructor(params: {
    message: string;
    code?: string;
    venueId?: string;
    taxYear?: number;
    statusCode?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code || 'TAX_ERROR',
      statusCode: params.statusCode || 400,
      message: params.message,
      type: `urn:error:compliance-service:tax:${(params.code || 'error').toLowerCase().replace(/_/g, '-')}`,
      title: 'Tax Processing Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.taxYear = params.taxYear;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      venueId: this.venueId,
      taxYear: this.taxYear
    };
  }
}

export class TaxThresholdNotMetError extends TaxError {
  public readonly threshold: number;
  public readonly currentAmount: number;

  constructor(venueId: string, year: number, threshold: number, currentAmount: number, requestId?: string) {
    super({
      message: `1099 threshold not met: $${currentAmount.toFixed(2)} of $${threshold.toFixed(2)} required`,
      code: 'TAX_THRESHOLD_NOT_MET',
      venueId,
      taxYear: year,
      requestId
    });
    this.threshold = threshold;
    this.currentAmount = currentAmount;
  }
}

export class InvalidEINError extends TaxError {
  constructor(ein: string, requestId?: string) {
    super({
      message: 'Invalid EIN format. Expected format: XX-XXXXXXX',
      code: 'INVALID_EIN',
      statusCode: 400,
      requestId
    });
  }
}

/**
 * Verification Errors
 */
export class VerificationError extends BaseError {
  public readonly venueId?: string;
  public readonly verificationType?: string;

  constructor(params: {
    message: string;
    code?: string;
    venueId?: string;
    verificationType?: string;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code || 'VERIFICATION_ERROR',
      statusCode: 422,
      message: params.message,
      type: `urn:error:compliance-service:verification:${(params.code || 'error').toLowerCase().replace(/_/g, '-')}`,
      title: 'Verification Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.verificationType = params.verificationType;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      venueId: this.venueId,
      verificationType: this.verificationType
    };
  }
}

export class VenueNotVerifiedError extends VerificationError {
  constructor(venueId: string, requestId?: string) {
    super({
      message: `Venue ${venueId} has not completed verification`,
      code: 'VENUE_NOT_VERIFIED',
      venueId,
      requestId
    });
  }
}

export class W9NotFoundError extends VerificationError {
  constructor(venueId: string, requestId?: string) {
    super({
      message: `W9 form not found for venue ${venueId}`,
      code: 'W9_NOT_FOUND',
      venueId,
      verificationType: 'W9',
      requestId
    });
  }
}

/**
 * Risk Assessment Errors
 */
export class RiskError extends BaseError {
  public readonly venueId?: string;
  public readonly riskScore?: number;

  constructor(params: {
    message: string;
    code?: string;
    venueId?: string;
    riskScore?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code || 'RISK_ERROR',
      statusCode: 422,
      message: params.message,
      type: `urn:error:compliance-service:risk:${(params.code || 'error').toLowerCase().replace(/_/g, '-')}`,
      title: 'Risk Assessment Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.riskScore = params.riskScore;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      venueId: this.venueId,
      riskScore: this.riskScore
    };
  }
}

export class HighRiskVenueError extends RiskError {
  constructor(venueId: string, riskScore: number, requestId?: string) {
    super({
      message: `Venue ${venueId} is flagged as high risk with score ${riskScore}`,
      code: 'HIGH_RISK_VENUE',
      venueId,
      riskScore,
      requestId
    });
  }
}

/**
 * GDPR Errors
 */
export class GDPRError extends BaseError {
  public readonly userId?: string;
  public readonly requestType?: 'export' | 'delete';

  constructor(params: {
    message: string;
    code?: string;
    userId?: string;
    requestType?: 'export' | 'delete';
    statusCode?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: params.code || 'GDPR_ERROR',
      statusCode: params.statusCode || 400,
      message: params.message,
      type: `urn:error:compliance-service:gdpr:${(params.code || 'error').toLowerCase().replace(/_/g, '-')}`,
      title: 'GDPR Request Error',
      detail: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.userId = params.userId;
    this.requestType = params.requestType;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      userId: this.userId,
      requestType: this.requestType
    };
  }
}

export class GDPRExportNotReadyError extends GDPRError {
  constructor(userId: string, requestId?: string) {
    super({
      message: `GDPR export for user ${userId} is not yet ready`,
      code: 'GDPR_EXPORT_NOT_READY',
      userId,
      requestType: 'export',
      statusCode: 202,
      requestId
    });
  }
}

export class GDPRRetentionPeriodError extends GDPRError {
  constructor(userId: string, reason: string, requestId?: string) {
    super({
      message: `Cannot delete data for user ${userId}: ${reason}`,
      code: 'GDPR_RETENTION_REQUIRED',
      userId,
      requestType: 'delete',
      statusCode: 409,
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
// EXTERNAL SERVICE ERRORS
// =============================================================================

export class ExternalServiceError extends BaseError {
  public readonly service: string;
  public readonly retryable: boolean;

  constructor(params: {
    service: string;
    message: string;
    retryable?: boolean;
    cause?: Error;
    requestId?: string;
  }) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      message: params.message,
      type: `urn:error:compliance-service:external:${params.service.toLowerCase()}`,
      title: `${params.service} Service Error`,
      detail: params.message,
      isOperational: true,
      requestId: params.requestId,
      cause: params.cause
    });
    this.service = params.service;
    this.retryable = params.retryable ?? false;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      service: this.service,
      retryable: this.retryable
    };
  }
}

export class PlaidServiceError extends ExternalServiceError {
  constructor(message: string, requestId?: string) {
    super({
      service: 'Plaid',
      message,
      retryable: true,
      requestId
    });
  }
}

export class SendGridServiceError extends ExternalServiceError {
  constructor(message: string, requestId?: string) {
    super({
      service: 'SendGrid',
      message,
      retryable: true,
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
  constructor(service: string = 'Service', requestId?: string) {
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
// IDEMPOTENCY ERRORS
// =============================================================================

export class IdempotencyError extends BaseError {
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string, requestId?: string) {
    super({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
      message: `Request with idempotency key ${idempotencyKey} is already being processed`,
      title: 'Idempotency Conflict',
      requestId
    });
    this.idempotencyKey = idempotencyKey;
  }

  toRFC7807(instance?: string): Record<string, any> {
    return {
      ...super.toRFC7807(instance),
      idempotencyKey: this.idempotencyKey
    };
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
 * Create error response from error
 */
export function toErrorResponse(error: unknown, requestId?: string): Record<string, any> {
  const baseError = toBaseError(error, requestId);
  return baseError.toRFC7807(requestId);
}

export default {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  VenueNotFoundError,
  DocumentNotFoundError,
  TaxRecordNotFoundError,
  ConflictError,
  DuplicateResourceError,
  Duplicate1099Error,
  RateLimitError,
  OFACError,
  OFACMatchError,
  OFACServiceUnavailableError,
  TaxError,
  TaxThresholdNotMetError,
  InvalidEINError,
  VerificationError,
  VenueNotVerifiedError,
  W9NotFoundError,
  RiskError,
  HighRiskVenueError,
  GDPRError,
  GDPRExportNotReadyError,
  GDPRRetentionPeriodError,
  DatabaseError,
  DatabaseConnectionError,
  ExternalServiceError,
  PlaidServiceError,
  SendGridServiceError,
  InternalError,
  ServiceUnavailableError,
  IdempotencyError,
  isOperationalError,
  isErrorType,
  toBaseError,
  toErrorResponse
};
