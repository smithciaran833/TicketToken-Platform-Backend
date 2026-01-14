/**
 * Request Logger Middleware
 * 
 * AUDIT FIX: LOG-9 - Child loggers for request context
 * AUDIT FIX: LOG-12 - Request/response logging hooks
 * AUDIT FIX: LOG-13 - Rate limit exceeded logging (via error handler)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// Paths to exclude from detailed logging (health checks, metrics)
const EXCLUDED_PATHS = ['/health', '/live', '/ready', '/startup', '/metrics', '/info'];

// Headers to redact from logs
const REDACTED_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-jwt-token'];

/**
 * Create a child logger with request context
 * AUDIT FIX: LOG-9 - Child loggers
 */
function createRequestLogger(request: FastifyRequest): typeof logger {
  return logger.child({
    requestId: request.id,
    correlationId: (request as any).correlationId || request.id,
    method: request.method,
    path: request.url.split('?')[0], // Remove query params
    tenant_id: (request as any).tenantId || (request as any).user?.tenant_id
  });
}

/**
 * Redact sensitive headers from log output
 */
function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (REDACTED_HEADERS.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Check if path should be excluded from logging
 */
function shouldLog(path: string): boolean {
  return !EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
}

/**
 * Register request logging hooks
 * AUDIT FIX: LOG-12 - Request/response logging
 */
export async function registerRequestLogger(app: FastifyInstance): Promise<void> {
  // Log incoming requests
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!shouldLog(request.url)) {
      return;
    }

    const reqLogger = createRequestLogger(request);
    
    // Attach logger to request for use in handlers
    (request as any).log = reqLogger;
    
    reqLogger.info({
      event: 'request_start',
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      headers: redactHeaders(request.headers),
      query: request.query
    }, 'Incoming request');
  });

  // Log request completion
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!shouldLog(request.url)) {
      return;
    }

    const reqLogger = (request as any).log || createRequestLogger(request);
    const responseTime = reply.getResponseTime();
    const statusCode = reply.statusCode;

    // Log level based on status code
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    reqLogger[logLevel]({
      event: 'request_complete',
      statusCode,
      responseTime: Math.round(responseTime * 100) / 100, // 2 decimal places
      contentLength: reply.getHeader('content-length'),
      userId: (request as any).user?.userId,
      tenant_id: (request as any).user?.tenant_id
    }, `Request completed: ${statusCode} in ${responseTime.toFixed(2)}ms`);
  });

  // Log errors
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const reqLogger = (request as any).log || createRequestLogger(request);
    
    // AUDIT FIX: LOG-13 - Rate limit exceeded logging
    const isRateLimitError = (error as any).statusCode === 429 || 
                             error.message.toLowerCase().includes('rate limit');

    reqLogger.error({
      event: isRateLimitError ? 'rate_limit_exceeded' : 'request_error',
      error: {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        statusCode: (error as any).statusCode
      },
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      userId: (request as any).user?.userId,
      tenant_id: (request as any).user?.tenant_id,
      ip: request.ip
    }, isRateLimitError ? 'Rate limit exceeded' : `Request error: ${error.message}`);
  });
}

/**
 * Utility to get child logger from request
 */
export function getRequestLogger(request: FastifyRequest): typeof logger {
  return (request as any).log || createRequestLogger(request);
}
