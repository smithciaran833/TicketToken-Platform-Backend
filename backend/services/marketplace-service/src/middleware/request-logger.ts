/**
 * Request Logger Middleware for Marketplace Service
 * 
 * Issues Fixed:
 * - LOG-H1: Inconsistent log format → Structured JSON logging
 * - LOG-H2: Missing request context → Full request/response logging
 * - LOG-H3: No performance tracking → Duration metrics
 * - LOG-H4: PII in logs → Field sanitization
 * 
 * Features:
 * - Structured JSON logs
 * - Request/response correlation
 * - Performance timing
 * - PII sanitization
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { logger } from '../utils/logger';
import { getCurrentRequestId } from './request-id';
import { registry } from '../utils/metrics';

const log = logger.child({ component: 'RequestLogger' });

// Fields to redact from logs
const REDACTED_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-internal-secret'
]);

const REDACTED_BODY_FIELDS = new Set([
  'password',
  'passwordConfirm',
  'currentPassword',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
  'apiKey',
  'secret',
  'cardNumber',
  'cvv',
  'ssn'
]);

// Paths to skip logging
const SKIP_PATHS = new Set([
  '/health',
  '/health/ready',
  '/health/live',
  '/metrics'
]);

interface RequestLogData {
  requestId: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, any>;
  body?: any;
  userId?: string;
  tenantId?: string;
  ip: string;
  userAgent?: string;
}

interface ResponseLogData extends RequestLogData {
  statusCode: number;
  duration: number;
  contentLength?: number;
  error?: string;
}

/**
 * AUDIT FIX LOG-H4: Redact sensitive headers
 */
function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * AUDIT FIX LOG-H4: Redact sensitive body fields
 */
function redactBody(body: any, depth: number = 0): any {
  if (depth > 5) return '[MAX_DEPTH]';
  if (body === null || body === undefined) return body;
  if (typeof body !== 'object') return body;
  
  if (Array.isArray(body)) {
    return body.map(item => redactBody(item, depth + 1));
  }
  
  const redacted: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(body)) {
    if (REDACTED_BODY_FIELDS.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactBody(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Get client IP from request
 */
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return request.ip || 'unknown';
}

/**
 * AUDIT FIX LOG-H1/H2: Request start hook
 */
export function requestStartHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const path = request.url.split('?')[0];
  
  // Skip logging for certain paths
  if (SKIP_PATHS.has(path)) {
    done();
    return;
  }
  
  // Record start time
  (request as any).startTime = process.hrtime.bigint();
  
  const requestId = getCurrentRequestId() || request.id;
  const userId = (request as any).user?.id;
  const tenantId = (request as any).tenantId || request.headers['x-tenant-id'];
  
  const logData: RequestLogData = {
    requestId,
    method: request.method,
    path,
    query: request.query as Record<string, any>,
    headers: redactHeaders(request.headers as Record<string, any>),
    userId,
    tenantId: typeof tenantId === 'string' ? tenantId : undefined,
    ip: getClientIp(request),
    userAgent: request.headers['user-agent']
  };
  
  // Only log body for non-GET requests
  if (request.method !== 'GET' && request.body) {
    logData.body = redactBody(request.body);
  }
  
  log.info('Request started', logData);
  
  done();
}

/**
 * AUDIT FIX LOG-H1/H2/H3: Response complete hook
 */
export function responseCompleteHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const path = request.url.split('?')[0];
  
  // Skip logging for certain paths
  if (SKIP_PATHS.has(path)) {
    done();
    return;
  }
  
  // Calculate duration
  const startTime = (request as any).startTime;
  let duration = 0;
  
  if (startTime) {
    const endTime = process.hrtime.bigint();
    duration = Number(endTime - startTime) / 1_000_000; // Convert to ms
  }
  
  const requestId = getCurrentRequestId() || request.id;
  const userId = (request as any).user?.id;
  const tenantId = (request as any).tenantId || request.headers['x-tenant-id'];
  
  const logData: ResponseLogData = {
    requestId,
    method: request.method,
    path,
    query: request.query as Record<string, any>,
    headers: redactHeaders(request.headers as Record<string, any>),
    userId,
    tenantId: typeof tenantId === 'string' ? tenantId : undefined,
    ip: getClientIp(request),
    userAgent: request.headers['user-agent'],
    statusCode: reply.statusCode,
    duration,
    contentLength: parseInt(reply.getHeader('content-length') as string) || undefined
  };
  
  // Update metrics
  registry.observeHistogram('marketplace_http_request_duration_seconds', duration / 1000, {
    method: request.method,
    path: path,
    status_code: reply.statusCode.toString()
  });
  
  // Log at appropriate level based on status code
  if (reply.statusCode >= 500) {
    log.error('Request completed with server error', logData);
  } else if (reply.statusCode >= 400) {
    log.warn('Request completed with client error', logData);
  } else if (duration > 5000) {
    log.warn('Request completed (slow)', logData);
  } else {
    log.info('Request completed', logData);
  }
  
  done();
}

/**
 * AUDIT FIX LOG-H2: Error logging hook
 */
export function errorLoggingHook(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const path = request.url.split('?')[0];
  const requestId = getCurrentRequestId() || request.id;
  const startTime = (request as any).startTime;
  
  let duration = 0;
  if (startTime) {
    const endTime = process.hrtime.bigint();
    duration = Number(endTime - startTime) / 1_000_000;
  }
  
  log.error('Request error', {
    requestId,
    method: request.method,
    path,
    userId: (request as any).user?.id,
    tenantId: (request as any).tenantId,
    ip: getClientIp(request),
    duration,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5)
    },
    statusCode: (error as any).statusCode || 500
  });
  
  // Update error metrics
  registry.incrementCounter('marketplace_http_errors_total', {
    method: request.method,
    path: path,
    error_type: error.name
  });
}

/**
 * Fastify plugin for request logging
 */
export async function requestLoggerPlugin(fastify: any, options: any = {}): Promise<void> {
  fastify.addHook('onRequest', requestStartHook);
  fastify.addHook('onResponse', responseCompleteHook);
  fastify.addHook('onError', errorLoggingHook);
}

// Export for testing
export const loggerConfig = {
  REDACTED_HEADERS,
  REDACTED_BODY_FIELDS,
  SKIP_PATHS
};
