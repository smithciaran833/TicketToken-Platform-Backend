/**
 * Request Logging Middleware
 * 
 * Logs incoming requests and outgoing responses with timing information.
 * Integrates with existing request ID middleware for correlation.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// Extend FastifyRequest to include timing information
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: [number, number]; // hrtime tuple
  }
}

/**
 * Paths that should have reduced logging (high frequency endpoints)
 */
const REDUCED_LOG_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/health/startup',
  '/metrics'
];

/**
 * Check if a path should have reduced logging
 */
function isReducedLogPath(url: string): boolean {
  const basePath = url.split('?')[0];
  return REDUCED_LOG_PATHS.some(path => basePath === path || basePath.startsWith(path + '/'));
}

/**
 * Sanitize URL to remove sensitive query parameters
 */
function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url, 'http://localhost');
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'api_key', 'apikey'];
    
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });
    
    return urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

/**
 * Extract safe headers for logging (exclude sensitive ones)
 */
function getSafeHeaders(request: FastifyRequest): Record<string, string | undefined> {
  const sensitiveHeaders = [
    'authorization',
    'x-api-key',
    'x-auth-token',
    'cookie',
    'x-signature'
  ];

  const headers: Record<string, string | undefined> = {};
  
  // Only include specific headers that are useful for debugging
  const includeHeaders = [
    'content-type',
    'content-length',
    'user-agent',
    'x-request-id',
    'x-forwarded-for',
    'x-real-ip'
  ];

  includeHeaders.forEach(header => {
    const value = request.headers[header];
    if (value) {
      headers[header] = Array.isArray(value) ? value[0] : value;
    }
  });

  // Indicate presence of sensitive headers without logging their values
  sensitiveHeaders.forEach(header => {
    if (request.headers[header]) {
      headers[header] = '[PRESENT]';
    }
  });

  return headers;
}

/**
 * Get tenant ID from request if available
 */
function getTenantId(request: FastifyRequest): string | undefined {
  return (request as any).user?.tenant_id;
}

/**
 * Get user ID from request if available
 */
function getUserId(request: FastifyRequest): string | undefined {
  return (request as any).user?.id;
}

/**
 * Calculate request duration in milliseconds
 */
function calculateDuration(startTime: [number, number]): number {
  const diff = process.hrtime(startTime);
  return (diff[0] * 1e3) + (diff[1] / 1e6); // Convert to milliseconds
}

/**
 * Register request logging hooks on a Fastify instance
 */
export function registerRequestLogger(app: FastifyInstance): void {
  // Hook to capture request start time
  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.startTime = process.hrtime();
  });

  // Hook to log incoming request
  app.addHook('preHandler', async (request: FastifyRequest) => {
    // Skip detailed logging for high-frequency health/metrics endpoints
    if (isReducedLogPath(request.url)) {
      return;
    }

    const tenantId = getTenantId(request);
    const userId = getUserId(request);

    logger.info('Incoming request', {
      requestId: request.id,
      method: request.method,
      url: sanitizeUrl(request.url),
      tenantId,
      userId,
      ip: request.ip,
      headers: getSafeHeaders(request),
      // Log body size but not content (may contain sensitive data)
      bodySize: request.body ? JSON.stringify(request.body).length : 0,
      queryParams: Object.keys(request.query as object || {})
    });
  });

  // Hook to log response
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = request.startTime ? calculateDuration(request.startTime) : 0;
    const statusCode = reply.statusCode;
    const tenantId = getTenantId(request);

    // For health endpoints, only log at debug level and only if slow or erroring
    if (isReducedLogPath(request.url)) {
      if (statusCode >= 400 || duration > 1000) {
        logger.warn('Health endpoint slow or erroring', {
          requestId: request.id,
          method: request.method,
          url: request.url,
          statusCode,
          duration: Math.round(duration),
          tenantId
        });
      }
      return;
    }

    // Determine log level based on status code
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    const logData = {
      requestId: request.id,
      method: request.method,
      url: sanitizeUrl(request.url),
      statusCode,
      duration: Math.round(duration), // Round to nearest millisecond
      tenantId,
      userId: getUserId(request),
      contentLength: reply.getHeader('content-length'),
      // Add slow request flag for monitoring
      slow: duration > 5000
    };

    if (logLevel === 'error') {
      logger.error('Request completed with server error', logData);
    } else if (logLevel === 'warn') {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }

    // Log slow requests separately for alerting
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        requestId: request.id,
        method: request.method,
        url: sanitizeUrl(request.url),
        duration: Math.round(duration),
        tenantId,
        threshold: 5000
      });
    }
  });

  // Hook to log errors that occur during request processing
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const duration = request.startTime ? calculateDuration(request.startTime) : 0;

    logger.error('Request error occurred', {
      requestId: request.id,
      method: request.method,
      url: sanitizeUrl(request.url),
      duration: Math.round(duration),
      tenantId: getTenantId(request),
      userId: getUserId(request),
      errorName: error.name,
      errorMessage: error.message,
      // Include error code if available (from our custom errors)
      errorCode: (error as any).code,
      statusCode: (error as any).statusCode || reply.statusCode
    });
  });

  logger.info('Request logger middleware registered');
}

/**
 * Express-style middleware for logging (alternative for use with app.use())
 * Note: Prefer registerRequestLogger() for Fastify hooks
 */
export function requestLoggerMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    request.startTime = process.hrtime();
  };
}

export default registerRequestLogger;
