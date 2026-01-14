/**
 * Request Logger Middleware
 * 
 * AUDIT FIX LOG-M1: Structured request/response logging with correlation IDs
 * AUDIT FIX LOG-M2: PII redaction in logs
 * AUDIT FIX LOG-M3: Performance timing
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'secret',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'address',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
];

/**
 * Headers that should be redacted
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'x-auth-token',
];

/**
 * Recursively redact sensitive fields from an object
 */
function redactSensitiveData(obj: any, depth: number = 0): any {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, depth + 1));
  }

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Redact sensitive headers
 */
function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Get client IP address accounting for proxies
 */
function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    const ips = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',');
    return ips[0].trim();
  }
  return request.ip;
}

/**
 * Request logging hook - called at start of request
 */
export async function requestLoggerOnRequest(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Store start time for duration calculation
  (request as any).startTime = process.hrtime.bigint();
  
  // Get or generate request ID
  const requestId = request.id || request.headers['x-request-id'] || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store for correlation
  (request as any).correlationId = requestId;
  
  // Log request start
  logger.info({
    event: 'request_start',
    requestId,
    method: request.method,
    url: request.url,
    path: request.routerPath || request.url.split('?')[0],
    query: redactSensitiveData(request.query),
    headers: redactHeaders(request.headers as Record<string, any>),
    clientIp: getClientIp(request),
    userAgent: request.headers['user-agent'],
    contentLength: request.headers['content-length'],
    tenantId: (request as any).tenantId,
    userId: (request as any).userId,
  });
}

/**
 * Response logging hook - called after response is sent
 */
export async function requestLoggerOnResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = (request as any).startTime as bigint;
  const requestId = (request as any).correlationId;
  
  // Calculate duration in milliseconds
  const duration = startTime 
    ? Number(process.hrtime.bigint() - startTime) / 1_000_000 
    : 0;
  
  // Determine log level based on status code
  const statusCode = reply.statusCode;
  const logLevel = statusCode >= 500 ? 'error' : 
                   statusCode >= 400 ? 'warn' : 'info';
  
  // Log response
  logger[logLevel]({
    event: 'request_complete',
    requestId,
    method: request.method,
    url: request.url,
    path: request.routerPath || request.url.split('?')[0],
    statusCode,
    duration: Math.round(duration * 100) / 100, // 2 decimal places
    durationMs: Math.round(duration),
    contentLength: reply.getHeader('content-length'),
    tenantId: (request as any).tenantId,
    userId: (request as any).userId,
    // Performance classification
    performance: duration < 100 ? 'fast' : 
                 duration < 500 ? 'normal' : 
                 duration < 1000 ? 'slow' : 'very_slow',
  });
  
  // Log slow requests separately for monitoring
  if (duration > 1000) {
    logger.warn({
      event: 'slow_request',
      requestId,
      method: request.method,
      url: request.url,
      duration,
      threshold: 1000,
    });
  }
}

/**
 * Error logging hook
 */
export async function requestLoggerOnError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: Error
): Promise<void> {
  const requestId = (request as any).correlationId;
  
  logger.error({
    event: 'request_error',
    requestId,
    method: request.method,
    url: request.url,
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
    statusCode: reply.statusCode,
    tenantId: (request as any).tenantId,
    userId: (request as any).userId,
  });
}

/**
 * Middleware to add correlation ID to response headers
 */
export async function addCorrelationIdHeader(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const correlationId = (request as any).correlationId;
  if (correlationId) {
    reply.header('x-correlation-id', correlationId);
    reply.header('x-request-id', correlationId);
  }
}

/**
 * Export utility for manual logging with redaction
 */
export { redactSensitiveData, redactHeaders };
