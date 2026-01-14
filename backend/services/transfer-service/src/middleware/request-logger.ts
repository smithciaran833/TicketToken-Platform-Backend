/**
 * Request Logger Middleware for Transfer Service
 *
 * AUDIT FIXES:
 * - LOG-M1: No request logging middleware → Comprehensive request logging
 * - LOG-M2: Missing response time logging → Added duration tracking
 * - LOG-M3: No correlation ID propagation → Request ID tracking
 *
 * Features:
 * - Request/response logging with timing
 * - Sensitive data redaction
 * - Correlation ID propagation
 * - Configurable log levels by route
 */

import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REQUEST_LOGGER_CONFIG = {
  // Routes to skip logging (health checks, etc.)
  skipRoutes: [
    '/health',
    '/health/live',
    '/health/ready',
    '/metrics',
    '/favicon.ico'
  ],

  // Routes with minimal logging (high volume)
  minimalLogRoutes: [
    '/api/v1/transfers/status'
  ],

  // Headers to exclude from logging
  excludeHeaders: [
    'authorization',
    'cookie',
    'x-access-token',
    'x-api-key',
    'x-internal-secret'
  ],

  // Body fields to redact
  redactBodyFields: [
    'password',
    'secret',
    'token',
    'accessToken',
    'refreshToken',
    'acceptanceCode',
    'privateKey',
    'apiKey'
  ],

  // Query params to redact
  redactQueryParams: [
    'token',
    'code',
    'secret'
  ],

  // Log slow requests (ms)
  slowRequestThreshold: 3000
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if route should skip logging
 */
function shouldSkipLogging(url: string): boolean {
  return REQUEST_LOGGER_CONFIG.skipRoutes.some(route =>
    url.startsWith(route) || url === route
  );
}

/**
 * Check if route should use minimal logging
 */
function useMinimalLogging(url: string): boolean {
  return REQUEST_LOGGER_CONFIG.minimalLogRoutes.some(route =>
    url.startsWith(route) || url === route
  );
}

/**
 * Filter headers for safe logging
 */
function filterHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (REQUEST_LOGGER_CONFIG.excludeHeaders.includes(key.toLowerCase())) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Redact sensitive fields from body
 */
function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map(item => redactBody(item));
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (REQUEST_LOGGER_CONFIG.redactBodyFields.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactBody(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Redact sensitive query parameters
 */
function redactQuery(query: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    if (REQUEST_LOGGER_CONFIG.redactQueryParams.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Get log level based on status code
 */
function getLogLevel(statusCode: number): 'info' | 'warn' | 'error' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

const requestLoggerPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Add request start time
  fastify.addHook('onRequest', async (request) => {
    (request as any).startTime = process.hrtime.bigint();
  });

  // Log request
  fastify.addHook('preHandler', async (request) => {
    const url = request.url;

    if (shouldSkipLogging(url)) {
      return;
    }

    const requestId = request.id as string;
    const tenantId = (request as any).tenantId || 'unknown';
    const userId = (request as any).user?.id || 'anonymous';

    if (useMinimalLogging(url)) {
      logger.debug({
        requestId,
        method: request.method,
        url
      }, 'Request received');
      return;
    }

    logger.info({
      requestId,
      tenantId,
      userId,
      method: request.method,
      url: request.url,
      path: request.routeOptions?.url || request.url,
      params: request.params,
      query: redactQuery(request.query as Record<string, unknown>),
      headers: filterHeaders(request.headers as Record<string, unknown>),
      body: request.body ? redactBody(request.body) : undefined,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Request received');
  });

  // Log response
  fastify.addHook('onResponse', async (request, reply) => {
    const url = request.url;

    if (shouldSkipLogging(url)) {
      return;
    }

    const startTime = (request as any).startTime as bigint;
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1_000_000;

    const requestId = request.id as string;
    const tenantId = (request as any).tenantId || 'unknown';
    const userId = (request as any).user?.id || 'anonymous';
    const statusCode = reply.statusCode;

    const logLevel = getLogLevel(statusCode);
    const isSlowRequest = durationMs > REQUEST_LOGGER_CONFIG.slowRequestThreshold;

    const logData = {
      requestId,
      tenantId,
      userId,
      method: request.method,
      url: request.url,
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      contentLength: reply.getHeader('content-length'),
      ...(isSlowRequest && { slowRequest: true })
    };

    if (useMinimalLogging(url)) {
      logger.debug(logData, 'Request completed');
      return;
    }

    const message = isSlowRequest
      ? `Slow request completed: ${durationMs.toFixed(2)}ms`
      : 'Request completed';

    logger[logLevel](logData, message);
  });

  // Log errors
  fastify.addHook('onError', async (request, _reply, error) => {
    const requestId = request.id as string;
    const tenantId = (request as any).tenantId || 'unknown';
    const userId = (request as any).user?.id || 'anonymous';

    logger.error({
      requestId,
      tenantId,
      userId,
      method: request.method,
      url: request.url,
      error: {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      }
    }, 'Request error');
  });

  done();
};

export const requestLogger = fp(requestLoggerPlugin, {
  name: 'request-logger',
  fastify: '4.x'
});

// =============================================================================
// STANDALONE MIDDLEWARE (for manual use)
// =============================================================================

/**
 * Create a request logging middleware for specific route
 */
export function createRequestLogger(options?: {
  logBody?: boolean;
  logHeaders?: boolean;
  skipPaths?: string[];
}) {
  const config = {
    logBody: true,
    logHeaders: false,
    skipPaths: [],
    ...options
  };

  return async function requestLoggerMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply
  ) {
    const url = request.url;

    if (config.skipPaths.some(path => url.startsWith(path))) {
      return;
    }

    const requestId = request.id as string;

    logger.info({
      requestId,
      method: request.method,
      url,
      ...(config.logBody && { body: redactBody(request.body) }),
      ...(config.logHeaders && {
        headers: filterHeaders(request.headers as Record<string, unknown>)
      })
    }, 'Route accessed');
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default requestLogger;
export {
  filterHeaders,
  redactBody,
  redactQuery,
  REQUEST_LOGGER_CONFIG
};
