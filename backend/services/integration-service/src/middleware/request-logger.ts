/**
 * Request Logger Middleware for Integration Service
 * 
 * AUDIT FIX RL-3: Request logging middleware for auditing
 * 
 * Features:
 * - Structured request/response logging
 * - Sensitive data redaction
 * - Performance timing
 * - Correlation ID tracking
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { getRequestDuration } from './request-id';
import { isProduction } from '../config/index';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Paths to exclude from detailed logging
 */
const EXCLUDED_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/favicon.ico'
]);

/**
 * Headers that should be logged (allowlist)
 */
const LOGGED_HEADERS = [
  'content-type',
  'content-length',
  'user-agent',
  'x-request-id',
  'x-correlation-id',
  'x-tenant-id',
  'accept',
  'accept-encoding',
  'host',
  'origin',
  'referer'
];

/**
 * Headers that should be redacted
 */
const REDACTED_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-stripe-signature',
  'x-square-signature',
  'x-mailchimp-signature',
  'x-webhook-signature'
]);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Sanitize headers for logging
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  for (const key of LOGGED_HEADERS) {
    const value = headers[key];
    if (value !== undefined) {
      if (REDACTED_HEADERS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = String(value);
      }
    }
  }
  
  return sanitized;
}

/**
 * Truncate body for logging
 */
function truncateBody(body: unknown, maxLength = 1000): string {
  if (!body) return '';
  
  try {
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (str.length > maxLength) {
      return str.substring(0, maxLength) + '... [truncated]';
    }
    return str;
  } catch {
    return '[non-serializable body]';
  }
}

/**
 * Get client IP address
 */
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return request.ip;
}

// =============================================================================
// REQUEST LOGGER
// =============================================================================

/**
 * Log incoming request
 */
export async function requestLoggerOnRequest(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip excluded paths
  if (EXCLUDED_PATHS.has(request.url)) {
    return;
  }
  
  const logData = {
    type: 'request',
    requestId: request.id,
    correlationId: request.correlationId,
    method: request.method,
    url: request.url,
    routerPath: request.routerPath,
    ip: getClientIp(request),
    userAgent: request.headers['user-agent'],
    tenantId: request.tenantId,
    userId: request.user?.id,
    headers: sanitizeHeaders(request.headers as Record<string, unknown>),
    queryParams: request.query,
    // Only log body in non-production
    body: !isProduction() && request.body ? truncateBody(request.body, 500) : undefined
  };
  
  logger.info(`${request.method} ${request.url}`, logData);
}

/**
 * Log response
 */
export async function requestLoggerOnResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip excluded paths
  if (EXCLUDED_PATHS.has(request.url)) {
    return;
  }
  
  const duration = getRequestDuration(request);
  
  const logData = {
    type: 'response',
    requestId: request.id,
    correlationId: request.correlationId,
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration,
    tenantId: request.tenantId,
    userId: request.user?.id
  };
  
  // Choose log level based on status code
  const statusCode = reply.statusCode;
  
  if (statusCode >= 500) {
    logger.error(`${request.method} ${request.url} ${statusCode} ${duration}ms`, logData);
  } else if (statusCode >= 400) {
    logger.warn(`${request.method} ${request.url} ${statusCode} ${duration}ms`, logData);
  } else if (duration > 5000) {
    // Log slow requests as warnings
    logger.warn(`${request.method} ${request.url} ${statusCode} ${duration}ms [SLOW]`, logData);
  } else {
    logger.info(`${request.method} ${request.url} ${statusCode} ${duration}ms`, logData);
  }
}

/**
 * Log errors
 */
export async function requestLoggerOnError(
  request: FastifyRequest,
  _reply: FastifyReply,
  error: Error
): Promise<void> {
  const duration = getRequestDuration(request);
  
  const logData = {
    type: 'error',
    requestId: request.id,
    correlationId: request.correlationId,
    method: request.method,
    url: request.url,
    duration,
    tenantId: request.tenantId,
    userId: request.user?.id,
    error: {
      name: error.name,
      message: error.message,
      stack: !isProduction() ? error.stack : undefined
    }
  };
  
  logger.error(`${request.method} ${request.url} ERROR ${duration}ms`, logData);
}

// =============================================================================
// COMBINED MIDDLEWARE
// =============================================================================

/**
 * Register all request logging hooks
 */
export function registerRequestLogger(fastify: any): void {
  // Log incoming request
  fastify.addHook('onRequest', requestLoggerOnRequest);
  
  // Log response
  fastify.addHook('onResponse', requestLoggerOnResponse);
  
  // Log errors
  fastify.addHook('onError', requestLoggerOnError);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  requestLoggerOnRequest,
  requestLoggerOnResponse,
  requestLoggerOnError,
  registerRequestLogger
};
