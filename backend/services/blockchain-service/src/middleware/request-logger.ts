/**
 * Request Logger Middleware
 * 
 * Issues Fixed:
 * - #38: Request logging with sensitive data → Body filtering
 * - #14: Log sanitization → Request/response filtering
 * 
 * Features:
 * - Automatic request/response logging
 * - Duration tracking
 * - Body size limits for logging
 * - Sensitive header filtering
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger, sanitize } from '../utils/logger';

// Headers that should never be logged
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-internal-signature',
  'cookie',
  'x-csrf-token',
  'x-forwarded-for'
]);

// Maximum body size to log (in characters)
const MAX_BODY_LOG_SIZE = 2000;

/**
 * Filter sensitive headers from request
 */
function filterHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const filtered: Record<string, string | string[] | undefined> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_HEADERS.has(lowerKey)) {
      filtered[key] = '[REDACTED]';
    } else if (lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('key')) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

/**
 * Truncate and sanitize body for logging
 */
function prepareBodyForLogging(body: any): any {
  if (!body) return undefined;
  
  try {
    const sanitized = sanitize(typeof body === 'object' ? body : { raw: body });
    const stringified = JSON.stringify(sanitized);
    
    if (stringified.length > MAX_BODY_LOG_SIZE) {
      return {
        _truncated: true,
        _originalSize: stringified.length,
        _preview: stringified.substring(0, MAX_BODY_LOG_SIZE)
      };
    }
    
    return sanitized;
  } catch (e) {
    return { _error: 'Body could not be serialized' };
  }
}

/**
 * Request logging hook - called on every request start
 */
export async function requestLoggerOnRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Store start time for duration calculation
  (request as any).startTime = Date.now();
  
  logger.info('Request started', {
    requestId: request.id,
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    contentLength: request.headers['content-length'],
    tenantId: (request as any).tenantId
  });
}

/**
 * Response logging hook - called after response is sent
 */
export async function requestLoggerOnResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = (request as any).startTime || Date.now();
  const duration = Date.now() - startTime;
  const statusCode = reply.statusCode;
  
  // Determine log level based on status code
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  const logData = {
    requestId: request.id,
    method: request.method,
    url: request.url,
    statusCode,
    duration,
    ip: request.ip,
    tenantId: (request as any).tenantId,
    internalService: (request as any).internalService
  };
  
  // Add body info for error responses
  if (statusCode >= 400) {
    (logData as any).requestBody = prepareBodyForLogging(request.body);
    (logData as any).headers = filterHeaders(request.headers as any);
  }
  
  logger[logLevel]('Request completed', logData);
}

/**
 * Combined request logger middleware
 * Use this for detailed request/response logging
 */
export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requestLoggerOnRequest(request, reply);
}

/**
 * Create a scoped logger for the current request
 */
export function createRequestLogger(request: FastifyRequest) {
  return logger.child({
    requestId: request.id,
    method: request.method,
    url: request.url,
    tenantId: (request as any).tenantId
  });
}
