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

    // Set the name property so stack traces show the correct error class name
    this.name = this.constructor.name;

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

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      type: this.type,
      timestamp: this.timestamp,
      requestId: this.requestId,
      tenantId: this.tenantId,
      isOperational: this.isOperational,
      stack: this.stack
    };
  }
}

// =============================================================================
// 4XX CLIENT ERROR CLASSES
// =============================================================================

/**
 * Validation Error (400)
 */
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
      title: 'Validation Error',
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.validationErrors = params.validationErrors;
  }

  toRFC7807(instance?: string): Record<string, any> {
    const rfc = super.toRFC7807(instance);
    if (this.validationErrors) {
      rfc.validationErrors = this.validationErrors;
    }
    return rfc;
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends BaseError {
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      code: 'BAD_REQUEST',
      statusCode: 400,
      message,
      requestId,
      tenantId
    });
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Authentication required', requestId?: string, tenantId?: string) {
    super({
      code: 'UNAUTHORIZED',
      statusCode: 401,
      message,
      requestId,
      tenantId
    });
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends BaseError {
  constructor(message: string = 'Access denied', requestId?: string, tenantId?: string) {
    super({
      code: 'FORBIDDEN',
      statusCode: 403,
      message,
      requestId,
      tenantId
    });
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends BaseError {
  public readonly resource?: string;
  public readonly resourceId?: string;

  constructor(resource: string, resourceId?: string, requestId?: string, tenantId?: string) {
    const message = resourceId 
      ? `${resource} with ID ${resourceId} not found`
      : `${resource} not found`;

    super({
      code: 'NOT_FOUND',
      statusCode: 404,
      message,
      requestId,
      tenantId
    });
    this.resource = resource;
    this.resourceId = resourceId;
  }

  toRFC7807(instance?: string): Record<string, any> {
    const rfc = super.toRFC7807(instance);
    if (this.resource) rfc.resource = this.resource;
    if (this.resourceId) rfc.resourceId = this.resourceId;
    return rfc;
  }
}

/**
 * Venue Not Found Error
 */
export class VenueNotFoundError extends NotFoundError {
  constructor(venueId: string, requestId?: string, tenantId?: string) {
    super('Venue', venueId, requestId, tenantId);
  }
}

/**
 * Document Not Found Error
 */
export class DocumentNotFoundError extends NotFoundError {
  constructor(documentId: string, requestId?: string, tenantId?: string) {
    super('Document', documentId, requestId, tenantId);
  }
}

/**
 * Tax Record Not Found Error
 */
export class TaxRecordNotFoundError extends NotFoundError {
  constructor(recordId: string, requestId?: string, tenantId?: string) {
    super('TaxRecord', recordId, requestId, tenantId);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends BaseError {
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      code: 'CONFLICT',
      statusCode: 409,
      message,
      requestId,
      tenantId
    });
  }
}

/**
 * Duplicate Resource Error
 */
export class DuplicateResourceError extends ConflictError {
  public readonly resource: string;
  public readonly identifier?: string;

  constructor(resource: string, identifier?: string, requestId?: string, tenantId?: string) {
    const message = identifier
      ? `${resource} with identifier ${identifier} already exists`
      : `${resource} already exists`;
    
    super(message, requestId, tenantId);
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Duplicate 1099 Error
 */
export class Duplicate1099Error extends ConflictError {
  constructor(venueId: string, year: number, requestId?: string, tenantId?: string) {
    super(
      `1099 form already exists for venue ${venueId} for year ${year}`,
      requestId,
      tenantId
    );
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, requestId?: string, tenantId?: string) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      requestId,
      tenantId
    });
    this.retryAfter = retryAfter;
  }

  toRFC7807(instance?: string): Record<string, any> {
    const rfc = super.toRFC7807(instance);
    rfc.retryAfter = this.retryAfter;
    return rfc;
  }
}

// =============================================================================
// DOMAIN-SPECIFIC ERROR CLASSES (422)
// =============================================================================

/**
 * OFAC Screening Error (422)
 */
export class OFACError extends BaseError {
  public readonly screeningId?: string;
  public readonly matchScore?: number;

  constructor(params: {
    message: string;
    screeningId?: string;
    matchScore?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'OFAC_ERROR',
      statusCode: 422,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.screeningId = params.screeningId;
    this.matchScore = params.matchScore;
  }

  toRFC7807(instance?: string): Record<string, any> {
    const rfc = super.toRFC7807(instance);
    if (this.screeningId) rfc.screeningId = this.screeningId;
    if (this.matchScore !== undefined) rfc.matchScore = this.matchScore;
    return rfc;
  }
}

/**
 * OFAC Match Error
 */
export class OFACMatchError extends OFACError {
  constructor(name: string, matchScore: number, requestId?: string, tenantId?: string) {
    super({
      message: `OFAC match found for ${name} with score ${matchScore}`,
      matchScore,
      requestId,
      tenantId
    });
    this.code = 'OFAC_MATCH';
  }
}

/**
 * OFAC Service Unavailable Error
 */
export class OFACServiceUnavailableError extends OFACError {
  constructor(requestId?: string, tenantId?: string) {
    super({
      message: 'OFAC screening service is temporarily unavailable',
      requestId,
      tenantId
    });
    this.code = 'OFAC_SERVICE_UNAVAILABLE';
  }
}

/**
 * Tax Error (400)
 */
export class TaxError extends BaseError {
  public readonly venueId?: string;
  public readonly taxYear?: number;

  constructor(params: {
    message: string;
    venueId?: string;
    taxYear?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'TAX_ERROR',
      statusCode: 400,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.taxYear = params.taxYear;
  }
}

/**
 * Tax Threshold Not Met Error
 */
export class TaxThresholdNotMetError extends TaxError {
  public readonly threshold: number;
  public readonly currentAmount: number;

  constructor(
    venueId: string,
    taxYear: number,
    threshold: number,
    currentAmount: number,
    requestId?: string,
    tenantId?: string
  ) {
    super({
      message: `Tax reporting threshold not met. Current amount $${currentAmount.toFixed(2)} is below threshold $${threshold.toFixed(2)}`,
      venueId,
      taxYear,
      requestId,
      tenantId
    });
    this.code = 'TAX_THRESHOLD_NOT_MET';
    this.threshold = threshold;
    this.currentAmount = currentAmount;
  }
}

/**
 * Invalid EIN Error
 */
export class InvalidEINError extends TaxError {
  constructor(ein: string, requestId?: string, tenantId?: string) {
    super({
      message: `Invalid EIN format. Expected format: XX-XXXXXXX`,
      requestId,
      tenantId
    });
    this.code = 'INVALID_EIN';
  }
}

/**
 * Verification Error (422)
 */
export class VerificationError extends BaseError {
  public readonly venueId?: string;
  public readonly verificationType?: string;

  constructor(params: {
    message: string;
    venueId?: string;
    verificationType?: string;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'VERIFICATION_ERROR',
      statusCode: 422,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.verificationType = params.verificationType;
  }
}

/**
 * Venue Not Verified Error
 */
export class VenueNotVerifiedError extends VerificationError {
  constructor(venueId: string, requestId?: string, tenantId?: string) {
    super({
      message: `Venue ${venueId} is not verified`,
      venueId,
      requestId,
      tenantId
    });
    this.code = 'VENUE_NOT_VERIFIED';
  }
}

/**
 * W9 Not Found Error
 */
export class W9NotFoundError extends VerificationError {
  constructor(venueId: string, requestId?: string, tenantId?: string) {
    super({
      message: `W9 form not found for venue ${venueId}`,
      venueId,
      verificationType: 'W9',
      requestId,
      tenantId
    });
    this.code = 'W9_NOT_FOUND';
  }
}

/**
 * Risk Assessment Error (422)
 */
export class RiskError extends BaseError {
  public readonly venueId?: string;
  public readonly riskScore?: number;

  constructor(params: {
    message: string;
    venueId?: string;
    riskScore?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'RISK_ERROR',
      statusCode: 422,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.venueId = params.venueId;
    this.riskScore = params.riskScore;
  }
}

/**
 * High Risk Venue Error
 */
export class HighRiskVenueError extends RiskError {
  constructor(venueId: string, riskScore: number, requestId?: string, tenantId?: string) {
    super({
      message: `Venue ${venueId} has high risk score: ${riskScore}`,
      venueId,
      riskScore,
      requestId,
      tenantId
    });
    this.code = 'HIGH_RISK_VENUE';
  }
}

/**
 * GDPR Compliance Error (400)
 */
export class GDPRError extends BaseError {
  public readonly userId?: string;
  public readonly requestType?: string;

  constructor(params: {
    message: string;
    userId?: string;
    requestType?: string;
    statusCode?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'GDPR_ERROR',
      statusCode: params.statusCode || 400,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.userId = params.userId;
    this.requestType = params.requestType;
  }
}

/**
 * GDPR Export Not Ready Error (202)
 */
export class GDPRExportNotReadyError extends GDPRError {
  constructor(userId: string, requestId?: string, tenantId?: string) {
    super({
      message: `GDPR export for user ${userId} is not ready yet`,
      userId,
      requestType: 'export',
      statusCode: 202,
      requestId,
      tenantId
    });
    this.code = 'GDPR_EXPORT_NOT_READY';
  }
}

/**
 * GDPR Retention Period Error (409)
 */
export class GDPRRetentionPeriodError extends GDPRError {
  constructor(userId: string, reason: string, requestId?: string, tenantId?: string) {
    super({
      message: `Cannot delete user ${userId} data: ${reason}`,
      userId,
      requestType: 'delete',
      statusCode: 409,
      requestId,
      tenantId
    });
    this.code = 'GDPR_RETENTION_REQUIRED';
  }
}

// =============================================================================
// 5XX SERVER ERROR CLASSES
// =============================================================================

/**
 * Database Error (500)
 */
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
      cause: params.cause,
      isOperational: false,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.query = params.query;
    this.constraint = params.constraint;
  }
}

/**
 * Database Connection Error (503)
 */
export class DatabaseConnectionError extends BaseError {
  constructor(message: string = 'Database connection failed', requestId?: string, tenantId?: string) {
    super({
      code: 'DATABASE_CONNECTION_ERROR',
      statusCode: 503,
      message,
      isOperational: false,
      requestId,
      tenantId
    });
  }
}

/**
 * External Service Error (502)
 */
export class ExternalServiceError extends BaseError {
  public readonly service: string;
  public readonly retryable: boolean;

  constructor(params: {
    message: string;
    service: string;
    retryable?: boolean;
    cause?: Error;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      message: params.message,
      cause: params.cause,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.service = params.service;
    this.retryable = params.retryable ?? false;
  }
}

/**
 * Plaid Service Error
 */
export class PlaidServiceError extends ExternalServiceError {
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      message,
      service: 'Plaid',
      retryable: true,
      requestId,
      tenantId
    });
  }
}

/**
 * SendGrid Service Error
 */
export class SendGridServiceError extends ExternalServiceError {
  constructor(message: string, requestId?: string, tenantId?: string) {
    super({
      message,
      service: 'SendGrid',
      retryable: true,
      requestId,
      tenantId
    });
  }
}

/**
 * Internal Error (500) - Non-operational
 */
export class InternalError extends BaseError {
  constructor(message: string = 'An unexpected error occurred', requestId?: string, tenantId?: string) {
    super({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message,
      isOperational: false,
      requestId,
      tenantId
    });
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends BaseError {
  constructor(serviceName?: string, requestId?: string, tenantId?: string) {
    const message = serviceName
      ? `${serviceName} is temporarily unavailable`
      : 'Service is temporarily unavailable';

    super({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      message,
      requestId,
      tenantId
    });
  }
}

/**
 * Idempotency Conflict Error (409)
 */
export class IdempotencyError extends BaseError {
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string, requestId?: string, tenantId?: string) {
    super({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
      message: `Request with idempotency key ${idempotencyKey} already processed`,
      requestId,
      tenantId
    });
    this.idempotencyKey = idempotencyKey;
  }

  toRFC7807(instance?: string): Record<string, any> {
    const rfc = super.toRFC7807(instance);
    rfc.idempotencyKey = this.idempotencyKey;
    return rfc;
  }
}

/**
 * Legacy Compliance Error (custom, maps to 400 or 422)
 */
export class ComplianceError extends BaseError {
  public readonly complianceIssue?: string;

  constructor(params: {
    message: string;
    complianceIssue?: string;
    statusCode?: number;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'COMPLIANCE_ERROR',
      statusCode: params.statusCode || 422,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.complianceIssue = params.complianceIssue;
  }
}

/**
 * Legacy Authentication Error (401)
 */
export class AuthenticationError extends BaseError {
  constructor(params: {
    message: string;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
  }
}

/**
 * Legacy Authorization Error (403)
 */
export class AuthorizationError extends BaseError {
  public readonly requiredRole?: string;

  constructor(params: {
    message: string;
    requiredRole?: string;
    requestId?: string;
    tenantId?: string;
  }) {
    super({
      code: 'AUTHORIZATION_ERROR',
      statusCode: 403,
      message: params.message,
      requestId: params.requestId,
      tenantId: params.tenantId
    });
    this.requiredRole = params.requiredRole;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if an error is operational
 */
export function isOperationalError(error: any): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if error is of a specific type
 */
export function isErrorType<T extends BaseError>(
  error: any,
  errorClass: new (...args: any[]) => T
): error is T {
  return error instanceof errorClass;
}

/**
 * Convert any error to BaseError
 */
export function toBaseError(error: any, requestId?: string): BaseError {
  if (error instanceof BaseError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, requestId);
  }

  if (typeof error === 'string') {
    return new InternalError(error, requestId);
  }

  return new InternalError('An unknown error occurred', requestId);
}

/**
 * Convert error to RFC7807 response
 */
export function toErrorResponse(error: any, requestId?: string): Record<string, any> {
  const baseError = toBaseError(error, requestId);
  return baseError.toRFC7807(requestId);
}

// =============================================================================
// ERROR FACTORY
// =============================================================================

export function createError(
  type: 'validation' | 'auth' | 'authz' | 'notfound' | 'conflict' | 'ratelimit' | 'database' | 'external' | 'unavailable' | 'compliance',
  message: string,
  metadata?: Record<string, any>
): BaseError {
  switch (type) {
    case 'validation':
      return new ValidationError({ message, ...metadata });
    case 'auth':
      return new AuthenticationError({ message, ...metadata });
    case 'authz':
      return new AuthorizationError({ message, ...metadata });
    case 'notfound':
      return new NotFoundError(metadata?.resource || 'Resource', metadata?.resourceId, metadata?.requestId, metadata?.tenantId);
    case 'conflict':
      return new ConflictError(message, metadata?.requestId, metadata?.tenantId);
    case 'ratelimit':
      return new RateLimitError(metadata?.retryAfter || 60, metadata?.requestId, metadata?.tenantId);
    case 'database':
      return new DatabaseError({ message, ...metadata });
    case 'external':
      return new ExternalServiceError({ message, service: metadata?.service || 'Unknown', ...metadata });
    case 'unavailable':
      return new ServiceUnavailableError(metadata?.serviceName, metadata?.requestId, metadata?.tenantId);
    case 'compliance':
      return new ComplianceError({ message, ...metadata });
    default:
      throw new Error(`Unknown error type: ${type}`);
  }
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
  ComplianceError,
  AuthenticationError,
  AuthorizationError,
  isOperationalError,
  isErrorType,
  toBaseError,
  toErrorResponse,
  createError
};
