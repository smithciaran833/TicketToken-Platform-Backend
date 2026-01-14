/**
 * ERROR HANDLER MIDDLEWARE
 * 
 * Fixes Batch 8 audit findings:
 * - RH2: Error handler registered properly (used via setErrorHandler)
 * - RH5: RFC 7807 Problem Details format
 * - Default response handlers
 * 
 * AUDIT FIXES (New):
 * - RH3: Stack traces hidden in prod
 * - Consistent error message format
 * - Error aggregation for monitoring
 * - Retry guidance in error responses
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { AppError, NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'ErrorHandler' });

// =============================================================================
// ERROR AGGREGATION FOR MONITORING
// =============================================================================

/**
 * In-memory error counters for monitoring
 * In production, these would be sent to a metrics system (Prometheus, StatsD, etc.)
 */
const errorCounters: Map<string, { count: number; lastSeen: Date }> = new Map();
const ERROR_AGGREGATION_WINDOW_MS = 60000; // 1 minute window

/**
 * Track error occurrence for monitoring/alerting
 */
function trackError(errorCode: string, statusCode: number, tenantId?: string): void {
  const key = `${errorCode}:${statusCode}`;
  const existing = errorCounters.get(key);
  
  if (existing) {
    existing.count++;
    existing.lastSeen = new Date();
  } else {
    errorCounters.set(key, { count: 1, lastSeen: new Date() });
  }

  // Log structured error metric for aggregation
  log.info('Error metric', {
    metric: 'error_count',
    errorCode,
    statusCode,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get error summary for monitoring endpoints
 */
export function getErrorSummary(): Record<string, { count: number; lastSeen: string }> {
  const summary: Record<string, { count: number; lastSeen: string }> = {};
  const now = Date.now();
  
  // Clean up old entries and build summary
  for (const [key, value] of errorCounters.entries()) {
    if (now - value.lastSeen.getTime() > ERROR_AGGREGATION_WINDOW_MS) {
      errorCounters.delete(key);
    } else {
      summary[key] = { count: value.count, lastSeen: value.lastSeen.toISOString() };
    }
  }
  
  return summary;
}

/**
 * Reset error counters (for testing)
 */
export function resetErrorCounters(): void {
  errorCounters.clear();
}

// =============================================================================
// RETRY GUIDANCE CONFIGURATION
// =============================================================================

/**
 * Retry guidance for different error types
 * Helps clients implement proper retry logic
 */
interface RetryGuidance {
  retryable: boolean;
  retryAfterSeconds?: number;
  maxRetries?: number;
  backoffType?: 'none' | 'linear' | 'exponential';
  message?: string;
}

const RETRY_GUIDANCE: Record<string, RetryGuidance> = {
  // Not retryable errors (4xx client errors)
  VALIDATION_ERROR: { retryable: false, message: 'Fix the request data and try again' },
  NOT_FOUND: { retryable: false, message: 'Resource does not exist' },
  UNAUTHORIZED: { retryable: false, message: 'Provide valid authentication credentials' },
  FORBIDDEN: { retryable: false, message: 'You do not have permission to perform this action' },
  CONFLICT: { retryable: false, message: 'Resolve the conflict and try again' },
  INVALID_TENANT: { retryable: false, message: 'Check tenant ID and try again' },
  DUPLICATE_ENTRY: { retryable: false, message: 'Resource already exists' },
  
  // Retryable errors (5xx server errors, rate limiting)
  RATE_LIMITED: { retryable: true, retryAfterSeconds: 60, maxRetries: 3, backoffType: 'exponential', message: 'Too many requests, retry after the specified time' },
  INTERNAL_ERROR: { retryable: true, retryAfterSeconds: 5, maxRetries: 3, backoffType: 'exponential', message: 'Server error, retry with exponential backoff' },
  SERVICE_UNAVAILABLE: { retryable: true, retryAfterSeconds: 30, maxRetries: 5, backoffType: 'exponential', message: 'Service temporarily unavailable' },
  CIRCUIT_BREAKER_OPEN: { retryable: true, retryAfterSeconds: 30, maxRetries: 3, backoffType: 'linear', message: 'Service is recovering, retry later' },
  TIMEOUT: { retryable: true, retryAfterSeconds: 5, maxRetries: 2, backoffType: 'linear', message: 'Request timed out, retry with shorter payload or later' },
  
  // Database-related (sometimes retryable)
  DATABASE_ERROR: { retryable: true, retryAfterSeconds: 1, maxRetries: 2, backoffType: 'linear', message: 'Database error, retry shortly' },
  CONNECTION_ERROR: { retryable: true, retryAfterSeconds: 5, maxRetries: 3, backoffType: 'exponential', message: 'Connection error, retry with backoff' },
};

function getRetryGuidance(errorCode: string): RetryGuidance {
  return RETRY_GUIDANCE[errorCode] || { retryable: false, message: 'Check the error and fix the request' };
}

// =============================================================================
// RFC 7807 PROBLEM DETAILS FORMAT
// https://tools.ietf.org/html/rfc7807
// =============================================================================

export interface ProblemDetails {
  type: string;           // URI reference identifying the problem type
  title: string;          // Short human-readable summary
  status: number;         // HTTP status code
  detail?: string;        // Human-readable explanation specific to this occurrence
  instance?: string;      // URI reference for this specific problem occurrence
  // Extensions
  code?: string;          // Application-specific error code
  timestamp?: string;     // When the error occurred
  traceId?: string;       // Correlation ID for tracing
  errors?: Array<{        // Validation errors array
    field: string;
    message: string;
    code?: string;
  }>;
  // AUDIT FIX: Retry guidance in error responses
  retryAfter?: number;    // Seconds until client should retry
  retry?: {               // Detailed retry guidance
    retryable: boolean;
    maxRetries?: number;
    backoffType?: 'none' | 'linear' | 'exponential';
    guidance?: string;
  };
  // RH3: Stack trace only in development
  stack?: string;
}

/**
 * Check if stack traces should be included (RH3 fix)
 */
function shouldIncludeStack(): boolean {
  return config.env === 'development' || process.env.INCLUDE_STACK_TRACES === 'true';
}

// Error type URIs
const ERROR_TYPE_BASE = 'https://api.tickettoken.io/problems';

const ERROR_TYPES: Record<string, string> = {
  VALIDATION_ERROR: `${ERROR_TYPE_BASE}/validation-error`,
  NOT_FOUND: `${ERROR_TYPE_BASE}/not-found`,
  CONFLICT: `${ERROR_TYPE_BASE}/conflict`,
  UNAUTHORIZED: `${ERROR_TYPE_BASE}/unauthorized`,
  FORBIDDEN: `${ERROR_TYPE_BASE}/forbidden`,
  RATE_LIMITED: `${ERROR_TYPE_BASE}/rate-limited`,
  INTERNAL_ERROR: `${ERROR_TYPE_BASE}/internal-error`,
  SERVICE_UNAVAILABLE: `${ERROR_TYPE_BASE}/service-unavailable`,
  INVALID_TENANT: `${ERROR_TYPE_BASE}/invalid-tenant`,
  DUPLICATE_ENTRY: `${ERROR_TYPE_BASE}/duplicate-entry`,
  CIRCUIT_BREAKER_OPEN: `${ERROR_TYPE_BASE}/circuit-breaker-open`,
};

// =============================================================================
// ERROR MAPPING
// =============================================================================

function mapErrorToProblemDetails(
  error: Error | FastifyError | AppError,
  request: FastifyRequest
): ProblemDetails {
  const traceId = request.headers['x-trace-id'] as string || uuidv4();
  const timestamp = new Date().toISOString();
  const instance = `${request.url}#${traceId}`;

  // Handle PostgreSQL errors
  const pgCode = (error as any).code;
  
  if (pgCode === '23503') {  // FK violation
    return {
      type: ERROR_TYPES.INVALID_TENANT,
      title: 'Invalid Tenant',
      status: 400,
      detail: 'The specified tenant does not exist or you do not have access to it.',
      instance,
      code: 'INVALID_TENANT',
      timestamp,
      traceId,
    };
  }
  
  if (pgCode === '23505') {  // Unique violation
    return {
      type: ERROR_TYPES.DUPLICATE_ENTRY,
      title: 'Duplicate Entry',
      status: 409,
      detail: 'A record with this value already exists.',
      instance,
      code: 'DUPLICATE_ENTRY',
      timestamp,
      traceId,
    };
  }

  // Handle custom AppErrors
  if (error instanceof NotFoundError) {
    return {
      type: ERROR_TYPES.NOT_FOUND,
      title: 'Resource Not Found',
      status: 404,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      traceId,
    };
  }

  if (error instanceof ValidationError) {
    return {
      type: ERROR_TYPES.VALIDATION_ERROR,
      title: 'Validation Failed',
      status: 400,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      traceId,
      errors: (error as any).details?.errors,
    };
  }

  if (error instanceof ConflictError) {
    return {
      type: ERROR_TYPES.CONFLICT,
      title: 'Conflict',
      status: 409,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      traceId,
    };
  }

  if (error instanceof ForbiddenError) {
    return {
      type: ERROR_TYPES.FORBIDDEN,
      title: 'Forbidden',
      status: 403,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      traceId,
    };
  }

  if (error instanceof AppError) {
    return {
      type: `${ERROR_TYPE_BASE}/${error.code?.toLowerCase() || 'error'}`,
      title: error.name,
      status: error.statusCode,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      traceId,
    };
  }

  // Handle Fastify validation errors
  if ((error as FastifyError).validation) {
    return {
      type: ERROR_TYPES.VALIDATION_ERROR,
      title: 'Validation Failed',
      status: 400,
      detail: 'Request validation failed',
      instance,
      code: 'VALIDATION_ERROR',
      timestamp,
      traceId,
      errors: (error as FastifyError).validation?.map(v => ({
        field: String(v.instancePath || v.params?.missingProperty || 'unknown'),
        message: v.message || 'Invalid value',
        code: v.keyword?.toUpperCase() || undefined,
      })),
    };
  }

  // Handle standard errors by name
  if (error.name === 'UnauthorizedError') {
    return {
      type: ERROR_TYPES.UNAUTHORIZED,
      title: 'Unauthorized',
      status: 401,
      detail: 'Authentication required',
      instance,
      code: 'UNAUTHORIZED',
      timestamp,
      traceId,
    };
  }

  // Handle circuit breaker
  if (error.name === 'CircuitBreakerOpenError') {
    return {
      type: ERROR_TYPES.CIRCUIT_BREAKER_OPEN,
      title: 'Service Temporarily Unavailable',
      status: 503,
      detail: 'The requested service is temporarily unavailable. Please try again later.',
      instance,
      code: 'CIRCUIT_BREAKER_OPEN',
      timestamp,
      traceId,
      // MEDIUM Fix: Add Retry-After hint
      retryAfter: 30,
    };
  }

  // Handle timeout errors
  if (error.name === 'TimeoutError') {
    return {
      type: ERROR_TYPES.SERVICE_UNAVAILABLE,
      title: 'Request Timeout',
      status: 504,
      detail: 'The request timed out. Please try again.',
      instance,
      code: 'TIMEOUT',
      timestamp,
      traceId,
    };
  }

  // Default: Internal server error
  return {
    type: ERROR_TYPES.INTERNAL_ERROR,
    title: 'Internal Server Error',
    status: 500,
    detail: process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'An unexpected error occurred. Please try again later.',
    instance,
    code: 'INTERNAL_ERROR',
    timestamp,
    traceId,
  };
}

// =============================================================================
// MAIN ERROR HANDLER
// =============================================================================

export async function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Map error to RFC 7807 Problem Details
  const problemDetails = mapErrorToProblemDetails(error, request);

  // Get tenant ID for error tracking
  const tenantId = (request as any).tenantId || (request as any).user?.tenantId;

  // ERROR AGGREGATION: Track error for monitoring
  if (problemDetails.code) {
    trackError(problemDetails.code, problemDetails.status, tenantId);
  }

  // RETRY GUIDANCE: Add retry information to response
  if (problemDetails.code) {
    const guidance = getRetryGuidance(problemDetails.code);
    problemDetails.retry = {
      retryable: guidance.retryable,
      maxRetries: guidance.maxRetries,
      backoffType: guidance.backoffType,
      guidance: guidance.message,
    };
    
    // Set retryAfter if not already set
    if (guidance.retryable && !problemDetails.retryAfter && guidance.retryAfterSeconds) {
      problemDetails.retryAfter = guidance.retryAfterSeconds;
    }
  }

  // RH3: Stack traces hidden in prod - only include in development
  if (shouldIncludeStack() && error.stack) {
    problemDetails.stack = error.stack;
  }

  // Log the error (RH3: Stack traces hidden in logs for production)
  const logContext: Record<string, unknown> = {
    error: error.message,
    url: request.url,
    method: request.method,
    ip: request.ip,
    tenantId,
    traceId: problemDetails.traceId,
    statusCode: problemDetails.status,
    errorCode: problemDetails.code,
    retryable: problemDetails.retry?.retryable,
  };

  // RH3: Only include stack traces in logs for development
  if (shouldIncludeStack()) {
    logContext.stack = error.stack;
  }

  if (problemDetails.status >= 500) {
    log.error('Server error', logContext);
  } else if (problemDetails.status >= 400) {
    log.warn('Client error', logContext);
  }

  // Add Retry-After header for retryable errors (429, 503, 504)
  if (problemDetails.retryAfter && [429, 503, 504].includes(problemDetails.status)) {
    reply.header('Retry-After', problemDetails.retryAfter.toString());
  }

  // Set RFC 7807 content type
  reply
    .status(problemDetails.status)
    .header('Content-Type', 'application/problem+json')
    .send(problemDetails);
}

// =============================================================================
// NOT FOUND HANDLER (Default 404)
// =============================================================================

export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const traceId = request.headers['x-trace-id'] as string || uuidv4();
  
  const problemDetails: ProblemDetails = {
    type: ERROR_TYPES.NOT_FOUND,
    title: 'Route Not Found',
    status: 404,
    detail: `Route ${request.method} ${request.url} not found`,
    instance: `${request.url}#${traceId}`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
    traceId,
  };

  reply
    .status(404)
    .header('Content-Type', 'application/problem+json')
    .send(problemDetails);
}
