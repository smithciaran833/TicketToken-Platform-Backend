/**
 * Error Utilities for Payment Service
 * 
 * HIGH FIX: Implements RFC 7807 Problem Details for HTTP APIs
 * https://datatracker.ietf.org/doc/html/rfc7807
 * 
 * All API errors should use these classes for consistent error responses.
 */

import { FastifyReply } from 'fastify';

/**
 * RFC 7807 Problem Details Format
 */
export interface ProblemDetails {
  type: string;           // URI reference identifying the problem type
  title: string;          // Human-readable summary
  status: number;         // HTTP status code
  detail?: string;        // Human-readable explanation specific to this occurrence
  instance?: string;      // URI reference identifying this specific occurrence
  // Extension members
  code?: string;          // Machine-readable error code
  errors?: FieldError[];  // Validation errors array
  traceId?: string;       // Distributed tracing ID
  timestamp?: string;     // ISO 8601 timestamp
}

export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

// Error type URIs (should be resolvable in production)
const ERROR_TYPE_BASE = 'https://api.tickettoken.com/problems';

export const ErrorTypes = {
  BAD_REQUEST: `${ERROR_TYPE_BASE}/bad-request`,
  VALIDATION_ERROR: `${ERROR_TYPE_BASE}/validation-error`,
  UNAUTHORIZED: `${ERROR_TYPE_BASE}/unauthorized`,
  FORBIDDEN: `${ERROR_TYPE_BASE}/forbidden`,
  NOT_FOUND: `${ERROR_TYPE_BASE}/not-found`,
  CONFLICT: `${ERROR_TYPE_BASE}/conflict`,
  PAYMENT_FAILED: `${ERROR_TYPE_BASE}/payment-failed`,
  PAYMENT_DECLINED: `${ERROR_TYPE_BASE}/payment-declined`,
  INSUFFICIENT_FUNDS: `${ERROR_TYPE_BASE}/insufficient-funds`,
  DUPLICATE_PAYMENT: `${ERROR_TYPE_BASE}/duplicate-payment`,
  REFUND_FAILED: `${ERROR_TYPE_BASE}/refund-failed`,
  STRIPE_ERROR: `${ERROR_TYPE_BASE}/stripe-error`,
  RATE_LIMITED: `${ERROR_TYPE_BASE}/rate-limited`,
  SERVICE_UNAVAILABLE: `${ERROR_TYPE_BASE}/service-unavailable`,
  INTERNAL_ERROR: `${ERROR_TYPE_BASE}/internal-error`,
  TENANT_REQUIRED: `${ERROR_TYPE_BASE}/tenant-required`,
  CROSS_TENANT_ACCESS: `${ERROR_TYPE_BASE}/cross-tenant-access`,
} as const;

/**
 * Base application error class that produces RFC 7807 responses.
 */
export class AppError extends Error {
  public readonly type: string;
  public readonly title: string;
  public readonly status: number;
  public readonly detail?: string;
  public readonly code?: string;
  public readonly errors?: FieldError[];
  public readonly isOperational: boolean;

  constructor(options: {
    type: string;
    title: string;
    status: number;
    detail?: string;
    code?: string;
    errors?: FieldError[];
    isOperational?: boolean;
  }) {
    super(options.detail || options.title);
    this.type = options.type;
    this.title = options.title;
    this.status = options.status;
    this.detail = options.detail;
    this.code = options.code;
    this.errors = options.errors;
    this.isOperational = options.isOperational ?? true;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to RFC 7807 Problem Details format
   */
  toProblemDetails(traceId?: string, instance?: string): ProblemDetails {
    const problem: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
      timestamp: new Date().toISOString(),
    };

    if (this.detail) problem.detail = this.detail;
    if (this.code) problem.code = this.code;
    if (this.errors) problem.errors = this.errors;
    if (traceId) problem.traceId = traceId;
    if (instance) problem.instance = instance;

    return problem;
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends AppError {
  constructor(detail?: string, code?: string) {
    super({
      type: ErrorTypes.BAD_REQUEST,
      title: 'Bad Request',
      status: 400,
      detail,
      code,
    });
  }
}

/**
 * Validation Error (400) - with field-level errors
 */
export class ValidationError extends AppError {
  constructor(errors: Array<{ field: string; message: string; code?: string }>, detail?: string) {
    super({
      type: ErrorTypes.VALIDATION_ERROR,
      title: 'Validation Failed',
      status: 400,
      detail: detail || 'One or more fields failed validation',
      code: 'VALIDATION_ERROR',
      errors,
    });
  }

  static fromZod(zodError: any): ValidationError {
    const errors = zodError.errors?.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    })) || [];
    return new ValidationError(errors);
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super({
      type: ErrorTypes.UNAUTHORIZED,
      title: 'Unauthorized',
      status: 401,
      detail: detail || 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super({
      type: ErrorTypes.FORBIDDEN,
      title: 'Forbidden',
      status: 403,
      detail: detail || 'You do not have permission to access this resource',
      code: 'FORBIDDEN',
    });
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource?: string, id?: string) {
    const detail = resource && id 
      ? `${resource} with ID '${id}' not found`
      : resource 
        ? `${resource} not found`
        : 'Resource not found';
    
    super({
      type: ErrorTypes.NOT_FOUND,
      title: 'Not Found',
      status: 404,
      detail,
      code: 'NOT_FOUND',
    });
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends AppError {
  constructor(detail?: string) {
    super({
      type: ErrorTypes.CONFLICT,
      title: 'Conflict',
      status: 409,
      detail: detail || 'The request conflicts with current state',
      code: 'CONFLICT',
    });
  }
}

/**
 * Payment Failed Error (402)
 */
export class PaymentFailedError extends AppError {
  constructor(detail?: string, code?: string) {
    super({
      type: ErrorTypes.PAYMENT_FAILED,
      title: 'Payment Failed',
      status: 402,
      detail: detail || 'Payment could not be processed',
      code: code || 'PAYMENT_FAILED',
    });
  }
}

/**
 * Payment Declined Error (402)
 */
export class PaymentDeclinedError extends AppError {
  constructor(declineCode?: string, detail?: string) {
    super({
      type: ErrorTypes.PAYMENT_DECLINED,
      title: 'Payment Declined',
      status: 402,
      detail: detail || 'Your payment was declined',
      code: declineCode || 'PAYMENT_DECLINED',
    });
  }
}

/**
 * Duplicate Payment Error (409)
 */
export class DuplicatePaymentError extends AppError {
  constructor(orderId?: string) {
    super({
      type: ErrorTypes.DUPLICATE_PAYMENT,
      title: 'Duplicate Payment',
      status: 409,
      detail: orderId 
        ? `A payment for order ${orderId} has already been processed`
        : 'This payment has already been processed',
      code: 'DUPLICATE_PAYMENT',
    });
  }
}

/**
 * Refund Failed Error (422)
 */
export class RefundFailedError extends AppError {
  constructor(detail?: string, code?: string) {
    super({
      type: ErrorTypes.REFUND_FAILED,
      title: 'Refund Failed',
      status: 422,
      detail: detail || 'The refund could not be processed',
      code: code || 'REFUND_FAILED',
    });
  }
}

/**
 * Stripe Error (wrapper for Stripe API errors)
 */
export class StripeError extends AppError {
  public readonly stripeCode?: string;
  public readonly declineCode?: string;
  public readonly param?: string;

  constructor(stripeError: any) {
    const status = mapStripeErrorStatus(stripeError.type);
    const detail = stripeError.message || 'An error occurred with the payment processor';
    
    super({
      type: ErrorTypes.STRIPE_ERROR,
      title: mapStripeErrorTitle(stripeError.type),
      status,
      detail,
      code: stripeError.code,
    });

    this.stripeCode = stripeError.code;
    this.declineCode = stripeError.decline_code;
    this.param = stripeError.param;
  }
}

/**
 * Rate Limited Error (429)
 */
export class RateLimitedError extends AppError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super({
      type: ErrorTypes.RATE_LIMITED,
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMITED',
    });
    this.retryAfter = retryAfter;
  }
}

/**
 * Tenant Required Error (401)
 */
export class TenantRequiredError extends AppError {
  constructor() {
    super({
      type: ErrorTypes.TENANT_REQUIRED,
      title: 'Tenant Required',
      status: 401,
      detail: 'A valid tenant context is required for this operation',
      code: 'TENANT_REQUIRED',
    });
  }
}

/**
 * Cross Tenant Access Error (403)
 */
export class CrossTenantAccessError extends AppError {
  constructor() {
    super({
      type: ErrorTypes.CROSS_TENANT_ACCESS,
      title: 'Cross-Tenant Access Denied',
      status: 403,
      detail: 'You cannot access resources belonging to another tenant',
      code: 'CROSS_TENANT_ACCESS',
    });
  }
}

/**
 * Internal Server Error (500) - for unexpected errors
 */
export class InternalError extends AppError {
  constructor(detail?: string) {
    super({
      type: ErrorTypes.INTERNAL_ERROR,
      title: 'Internal Server Error',
      status: 500,
      detail: detail || 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      isOperational: false,
    });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapStripeErrorStatus(type?: string): number {
  switch (type) {
    case 'StripeCardError':
      return 402;
    case 'StripeRateLimitError':
      return 429;
    case 'StripeInvalidRequestError':
      return 400;
    case 'StripeAuthenticationError':
      return 401;
    case 'StripePermissionError':
      return 403;
    case 'StripeConnectionError':
    case 'StripeAPIError':
    default:
      return 500;
  }
}

function mapStripeErrorTitle(type?: string): string {
  switch (type) {
    case 'StripeCardError':
      return 'Card Error';
    case 'StripeRateLimitError':
      return 'Rate Limit Exceeded';
    case 'StripeInvalidRequestError':
      return 'Invalid Request';
    case 'StripeAuthenticationError':
      return 'Authentication Error';
    case 'StripePermissionError':
      return 'Permission Error';
    case 'StripeConnectionError':
      return 'Connection Error';
    case 'StripeAPIError':
    default:
      return 'Payment Processor Error';
  }
}

/**
 * Convert any error to an AppError (for consistent handling)
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  // Handle Stripe errors
  if (error && typeof error === 'object' && 'type' in error && 
      (error as any).type?.startsWith('Stripe')) {
    return new StripeError(error);
  }

  // Handle generic errors
  if (error instanceof Error) {
    return new InternalError(error.message);
  }

  return new InternalError('An unknown error occurred');
}

/**
 * Send RFC 7807 error response
 */
export function sendProblemResponse(
  reply: FastifyReply,
  error: AppError,
  traceId?: string,
  instance?: string
): FastifyReply {
  const problem = error.toProblemDetails(traceId, instance);
  
  return reply
    .status(problem.status)
    .header('Content-Type', 'application/problem+json')
    .send(problem);
}
