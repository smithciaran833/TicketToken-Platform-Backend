/**
 * Global Error Handler for Payment Service
 * 
 * HIGH FIX: Properly register notFoundHandler and global error handler
 * with RFC 7807 error responses.
 * 
 * MEDIUM FIXES:
 * - RH-2: Handler registration order documented
 * - RH-6: Correlation ID included in error responses
 * - SL-2: Enhanced error context in logs
 * - SL-4: AppError used consistently
 * - SL-5: Error codes documented with enum
 * 
 * LOW FIX:
 * - Map PostgreSQL 23505 (unique violation) → 409 Conflict
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { logger } from '../utils/logger';
import { 
  AppError, 
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalError,
  StripeError,
  sendProblemResponse,
  toAppError 
} from '../utils/errors';
import { recordAuthFailure } from '../routes/metrics.routes';

const log = logger.child({ component: 'GlobalErrorHandler' });

// =============================================================================
// SL-5: ERROR CODES ENUM
// =============================================================================

/**
 * Standardized error codes for the payment service
 */
export enum ErrorCode {
  // Authentication errors (1xxx)
  AUTH_REQUIRED = 'AUTH_1001',
  AUTH_INVALID_TOKEN = 'AUTH_1002',
  AUTH_TOKEN_EXPIRED = 'AUTH_1003',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_1004',
  
  // Validation errors (2xxx)
  VALIDATION_FAILED = 'VAL_2001',
  VALIDATION_MISSING_FIELD = 'VAL_2002',
  VALIDATION_INVALID_FORMAT = 'VAL_2003',
  VALIDATION_CONSTRAINT = 'VAL_2004',
  
  // Resource errors (3xxx)
  RESOURCE_NOT_FOUND = 'RES_3001',
  RESOURCE_CONFLICT = 'RES_3002',
  RESOURCE_LOCKED = 'RES_3003',
  
  // Payment errors (4xxx)
  PAYMENT_FAILED = 'PAY_4001',
  PAYMENT_DECLINED = 'PAY_4002',
  PAYMENT_INSUFFICIENT_FUNDS = 'PAY_4003',
  PAYMENT_CARD_ERROR = 'PAY_4004',
  PAYMENT_REFUND_FAILED = 'PAY_4005',
  PAYMENT_ALREADY_REFUNDED = 'PAY_4006',
  PAYMENT_EXPIRED = 'PAY_4007',
  
  // Stripe errors (5xxx)
  STRIPE_API_ERROR = 'STRIPE_5001',
  STRIPE_CARD_ERROR = 'STRIPE_5002',
  STRIPE_RATE_LIMIT = 'STRIPE_5003',
  STRIPE_INVALID_REQUEST = 'STRIPE_5004',
  STRIPE_AUTHENTICATION = 'STRIPE_5005',
  STRIPE_IDEMPOTENCY = 'STRIPE_5006',
  
  // Tenant errors (6xxx)
  TENANT_REQUIRED = 'TENANT_6001',
  TENANT_INVALID = 'TENANT_6002',
  TENANT_MISMATCH = 'TENANT_6003',
  TENANT_SUSPENDED = 'TENANT_6004',
  
  // Rate limit errors (7xxx)
  RATE_LIMIT_EXCEEDED = 'RATE_7001',
  RATE_LIMIT_BURST = 'RATE_7002',
  
  // Database errors (8xxx)
  DATABASE_ERROR = 'DB_8001',
  DATABASE_TIMEOUT = 'DB_8002',
  DATABASE_CONFLICT = 'DB_8003',
  DATABASE_CONSTRAINT = 'DB_8004',
  
  // Internal errors (9xxx)
  INTERNAL_ERROR = 'INT_9001',
  SERVICE_UNAVAILABLE = 'INT_9002',
  DEPENDENCY_FAILURE = 'INT_9003',
  CONFIGURATION_ERROR = 'INT_9004',
}

/**
 * Error code descriptions for documentation
 */
export const ERROR_CODE_DESCRIPTIONS: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_REQUIRED]: 'Authentication is required for this request',
  [ErrorCode.AUTH_INVALID_TOKEN]: 'The provided authentication token is invalid',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'The authentication token has expired',
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action',
  
  [ErrorCode.VALIDATION_FAILED]: 'Request validation failed',
  [ErrorCode.VALIDATION_MISSING_FIELD]: 'A required field is missing',
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 'A field has an invalid format',
  [ErrorCode.VALIDATION_CONSTRAINT]: 'A validation constraint was violated',
  
  [ErrorCode.RESOURCE_NOT_FOUND]: 'The requested resource was not found',
  [ErrorCode.RESOURCE_CONFLICT]: 'The request conflicts with current state',
  [ErrorCode.RESOURCE_LOCKED]: 'The resource is currently locked',
  
  [ErrorCode.PAYMENT_FAILED]: 'Payment processing failed',
  [ErrorCode.PAYMENT_DECLINED]: 'The payment was declined',
  [ErrorCode.PAYMENT_INSUFFICIENT_FUNDS]: 'Insufficient funds for this payment',
  [ErrorCode.PAYMENT_CARD_ERROR]: 'There was an error with the payment card',
  [ErrorCode.PAYMENT_REFUND_FAILED]: 'Refund processing failed',
  [ErrorCode.PAYMENT_ALREADY_REFUNDED]: 'This payment has already been refunded',
  [ErrorCode.PAYMENT_EXPIRED]: 'The payment has expired',
  
  [ErrorCode.STRIPE_API_ERROR]: 'An error occurred with Stripe',
  [ErrorCode.STRIPE_CARD_ERROR]: 'The card was declined by Stripe',
  [ErrorCode.STRIPE_RATE_LIMIT]: 'Stripe rate limit exceeded',
  [ErrorCode.STRIPE_INVALID_REQUEST]: 'Invalid request to Stripe',
  [ErrorCode.STRIPE_AUTHENTICATION]: 'Stripe authentication failed',
  [ErrorCode.STRIPE_IDEMPOTENCY]: 'Idempotency key conflict',
  
  [ErrorCode.TENANT_REQUIRED]: 'Tenant context is required',
  [ErrorCode.TENANT_INVALID]: 'Invalid tenant ID',
  [ErrorCode.TENANT_MISMATCH]: 'Tenant ID does not match authenticated user',
  [ErrorCode.TENANT_SUSPENDED]: 'Tenant account is suspended',
  
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded, please retry later',
  [ErrorCode.RATE_LIMIT_BURST]: 'Too many requests in a short period',
  
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred',
  [ErrorCode.DATABASE_TIMEOUT]: 'Database query timed out',
  [ErrorCode.DATABASE_CONFLICT]: 'Database conflict (concurrent modification)',
  [ErrorCode.DATABASE_CONSTRAINT]: 'Database constraint violation',
  
  [ErrorCode.INTERNAL_ERROR]: 'An internal server error occurred',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable',
  [ErrorCode.DEPENDENCY_FAILURE]: 'A dependent service failed',
  [ErrorCode.CONFIGURATION_ERROR]: 'Service configuration error',
};

// =============================================================================
// RH-6: CORRELATION ID HELPER
// =============================================================================

/**
 * Get correlation ID from request
 */
function getCorrelationId(request: FastifyRequest): string {
  return (
    request.headers['x-correlation-id'] as string ||
    request.headers['x-request-id'] as string ||
    request.headers['x-trace-id'] as string ||
    request.id
  );
}

// =============================================================================
// SL-2: ENHANCED ERROR CONTEXT
// =============================================================================

interface ErrorContext {
  correlationId: string;
  traceId: string;
  path: string;
  method: string;
  tenantId?: string;
  userId?: string;
  userAgent?: string;
  ip: string;
  timestamp: string;
}

/**
 * Build error context from request
 */
function buildErrorContext(request: FastifyRequest): ErrorContext {
  return {
    correlationId: getCorrelationId(request),
    traceId: request.id,
    path: request.url,
    method: request.method,
    tenantId: (request as any).tenantId,
    userId: (request as any).userId,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// ERROR HANDLER
// =============================================================================

/**
 * Global error handler for all unhandled errors
 * 
 * RH-2: This must be registered AFTER routes are defined via setErrorHandler
 */
export function globalErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // RH-6: Get correlation ID
  const correlationId = getCorrelationId(request);
  
  // SL-2: Build full error context
  const context = buildErrorContext(request);

  // SL-4: Convert to AppError consistently
  let appError: AppError;
  let errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR;

  if (error instanceof AppError) {
    appError = error;
    errorCode = mapAppErrorToCode(error);
  } else if ((error as FastifyError).validation) {
    // Fastify validation error
    const fastifyError = error as FastifyError;
    const errors = fastifyError.validation?.map((v: any) => ({
      field: v.instancePath?.replace(/^\//, '') || v.params?.missingProperty || 'unknown',
      message: v.message || 'Validation failed',
      code: v.keyword,
    })) || [];
    
    appError = new ValidationError(errors);
    errorCode = ErrorCode.VALIDATION_FAILED;
  } else if ((error as FastifyError).statusCode === 401) {
    appError = new UnauthorizedError(error.message);
    errorCode = ErrorCode.AUTH_REQUIRED;
    recordAuthFailure('error_handler');
  } else if ((error as FastifyError).statusCode === 403) {
    appError = new ForbiddenError(error.message);
    errorCode = ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS;
  } else if ((error as FastifyError).statusCode === 404) {
    appError = new NotFoundError(undefined, undefined);
    errorCode = ErrorCode.RESOURCE_NOT_FOUND;
  } else if (error.name === 'StripeError' || (error as any).type?.startsWith('Stripe')) {
    appError = new StripeError(error);
    errorCode = mapStripeErrorToCode(error);
  } else if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
    appError = new InternalError('Service dependency unavailable');
    errorCode = ErrorCode.DEPENDENCY_FAILURE;
  } else if ((error as any).code === 'ETIMEDOUT') {
    appError = new InternalError('Request timed out');
    errorCode = ErrorCode.DATABASE_TIMEOUT;
  } else if ((error as any).code === '23505') {
    // LOW FIX: PostgreSQL unique violation → 409 Conflict
    const detail = (error as any).detail || 'Duplicate entry';
    appError = {
      type: 'https://api.tickettoken.com/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail: `Resource already exists: ${detail}`,
      message: `Resource already exists: ${detail}`,
      isOperational: true,
    } as AppError;
    errorCode = ErrorCode.RESOURCE_CONFLICT;
  } else if ((error as any).code === '23503') {
    // PostgreSQL foreign key violation
    appError = {
      type: 'https://api.tickettoken.com/errors/constraint',
      title: 'Constraint Violation',
      status: 400,
      detail: 'Referenced resource does not exist',
      message: 'Referenced resource does not exist',
      isOperational: true,
    } as AppError;
    errorCode = ErrorCode.DATABASE_CONSTRAINT;
  } else if ((error as any).code === '23502') {
    // PostgreSQL not-null violation
    const column = (error as any).column || 'field';
    appError = {
      type: 'https://api.tickettoken.com/errors/validation',
      title: 'Validation Error',
      status: 400,
      detail: `Required field missing: ${column}`,
      message: `Required field missing: ${column}`,
      isOperational: true,
    } as AppError;
    errorCode = ErrorCode.VALIDATION_MISSING_FIELD;
  } else {
    // Unknown error - wrap as internal error
    appError = toAppError(error);
  }

  // SL-2: Enhanced logging with full context
  if (appError.isOperational) {
    log.warn({
      ...context,
      error: {
        message: appError.message,
        type: appError.type,
        code: errorCode,
        status: appError.status,
      },
    }, 'Operational error handled');
  } else {
    log.error({
      ...context,
      error: {
        message: error.message,
        stack: error.stack,
        type: appError.type,
        code: errorCode,
        status: appError.status,
        name: error.name,
      },
    }, 'Unhandled error');
  }

  // RH-6: Include correlation ID in response
  reply.header('X-Correlation-ID', correlationId);
  reply.header('X-Request-ID', request.id);

  // Send RFC 7807 response with correlation ID
  sendProblemResponseWithCorrelation(reply, appError, errorCode, correlationId, request.url);
}

/**
 * SL-4: Map AppError types to error codes
 */
function mapAppErrorToCode(error: AppError): ErrorCode {
  const typeMap: Record<string, ErrorCode> = {
    'validation-error': ErrorCode.VALIDATION_FAILED,
    'unauthorized': ErrorCode.AUTH_REQUIRED,
    'forbidden': ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    'not-found': ErrorCode.RESOURCE_NOT_FOUND,
    'conflict': ErrorCode.RESOURCE_CONFLICT,
    'rate-limit': ErrorCode.RATE_LIMIT_EXCEEDED,
    'payment-error': ErrorCode.PAYMENT_FAILED,
    'stripe-error': ErrorCode.STRIPE_API_ERROR,
    'internal-error': ErrorCode.INTERNAL_ERROR,
  };
  
  // Extract type from URL or use direct match
  const typeName = error.type.split('/').pop() || 'internal-error';
  return typeMap[typeName] || ErrorCode.INTERNAL_ERROR;
}

/**
 * Map Stripe error types to error codes
 */
function mapStripeErrorToCode(error: Error): ErrorCode {
  const stripeError = error as any;
  
  switch (stripeError.type) {
    case 'StripeCardError':
      return ErrorCode.STRIPE_CARD_ERROR;
    case 'StripeRateLimitError':
      return ErrorCode.STRIPE_RATE_LIMIT;
    case 'StripeInvalidRequestError':
      return ErrorCode.STRIPE_INVALID_REQUEST;
    case 'StripeAuthenticationError':
      return ErrorCode.STRIPE_AUTHENTICATION;
    case 'StripeIdempotencyError':
      return ErrorCode.STRIPE_IDEMPOTENCY;
    default:
      return ErrorCode.STRIPE_API_ERROR;
  }
}

/**
 * RH-6: Send problem response with correlation ID included
 */
function sendProblemResponseWithCorrelation(
  reply: FastifyReply,
  error: AppError,
  errorCode: ErrorCode,
  correlationId: string,
  instance: string
): void {
  const body = {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: error.detail,
    instance,
    // RH-6: Include correlation ID for tracking
    correlationId,
    // SL-5: Include documented error code
    code: errorCode,
    // Include validation errors if present
    ...(error.errors && { errors: error.errors }),
    // Include timestamp
    timestamp: new Date().toISOString(),
    // Include docs link
    documentation: `https://docs.tickettoken.com/errors/${errorCode}`,
  };

  reply.status(error.status).type('application/problem+json').send(body);
}

// =============================================================================
// NOT FOUND HANDLER
// =============================================================================

/**
 * Handler for routes that don't exist
 */
export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const correlationId = getCorrelationId(request);
  const context = buildErrorContext(request);

  // SL-2: Log with full context
  log.info({
    ...context,
  }, 'Route not found');

  // RH-6: Set correlation headers
  reply.header('X-Correlation-ID', correlationId);
  reply.header('X-Request-ID', request.id);

  const error = new NotFoundError(`Route ${request.method} ${request.url} not found`);
  sendProblemResponseWithCorrelation(
    reply, 
    error, 
    ErrorCode.RESOURCE_NOT_FOUND, 
    correlationId, 
    request.url
  );
}

// =============================================================================
// REGISTER HANDLERS
// =============================================================================

/**
 * Register global error handlers on Fastify instance
 * 
 * RH-2: IMPORTANT - Call this AFTER registering routes but BEFORE starting the server
 */
export function registerErrorHandlers(fastify: FastifyInstance): void {
  // Register global error handler
  fastify.setErrorHandler(globalErrorHandler);

  // Register 404 handler
  fastify.setNotFoundHandler(notFoundHandler);

  log.info('Global error handlers registered');
}

// =============================================================================
// ASYNC ERROR WRAPPER
// =============================================================================

/**
 * Wrap async route handlers to properly catch and forward errors
 */
export function asyncHandler<T>(
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
): (request: FastifyRequest, reply: FastifyReply) => Promise<T | void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<T | void> => {
    try {
      return await fn(request, reply);
    } catch (error) {
      // Forward to global error handler
      throw error;
    }
  };
}

// =============================================================================
// SHUTDOWN HANDLER
// =============================================================================

/**
 * Register graceful shutdown handlers
 */
export function registerShutdownHandlers(fastify: FastifyInstance): void {
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutdown signal received');
    
    try {
      await fastify.close();
      log.info('Server closed gracefully');
      process.exit(0);
    } catch (error) {
      log.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    log.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    log.fatal({ reason }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });

  log.info('Shutdown handlers registered');
}

// =============================================================================
// EXPORTS
// =============================================================================

export { getCorrelationId, buildErrorContext };
