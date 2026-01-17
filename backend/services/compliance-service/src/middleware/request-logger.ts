/**
 * Request Logger Middleware for Compliance Service
 * 
 * AUDIT FIXES:
 * - LOG-H2: Rate limit events logged
 * - LOG-H3: Auth failures logged and metered
 * - RL-H4: Rate limit logging with details
 * - ERR-H3: No stack traces in production
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { incrementMetric } from '../utils/metrics';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface RequestLoggerConfig {
  // Skip logging for these paths (health checks, metrics)
  skipPaths: string[];
  
  // Log request body for these methods (POST, PUT, PATCH)
  logBodyMethods: string[];
  
  // Maximum body size to log (prevent huge payloads in logs)
  maxBodyLogSize: number;
  
  // Enable slow request logging
  slowRequestThresholdMs: number;
  
  // Enable detailed error logging
  logErrors: boolean;
  
  // Redact sensitive fields from body
  redactFields: string[];
}

const DEFAULT_CONFIG: RequestLoggerConfig = {
  skipPaths: ['/health', '/health/live', '/health/ready', '/ready', '/metrics'],
  logBodyMethods: ['POST', 'PUT', 'PATCH'],
  maxBodyLogSize: 1024,
  slowRequestThresholdMs: 3000,
  logErrors: true,
  redactFields: ['password', 'token', 'secret', 'authorization', 'apiKey', 'ein', 'ssn', 'accountNumber', 'routingNumber']
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Redact sensitive fields from an object
 */
function redactSensitive(obj: any, fields: string[]): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const redacted = { ...obj };
  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    if (fields.some(f => lowerKey.includes(f.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSensitive(redacted[key], fields);
    }
  }
  return redacted;
}

/**
 * Get client IP address
 */
function getClientIp(request: FastifyRequest): string {
  return (
    (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (request.headers['x-real-ip'] as string) ||
    request.ip ||
    'unknown'
  );
}

/**
 * Truncate body for logging
 */
function truncateBody(body: any, maxSize: number): any {
  if (!body) return undefined;
  
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (str.length <= maxSize) {
    return typeof body === 'string' ? body : JSON.parse(str);
  }
  
  return { _truncated: true, _size: str.length, _preview: str.substring(0, maxSize) + '...' };
}

// =============================================================================
// METRICS
// =============================================================================

// Rate limit tracking
let rateLimitEvents = {
  blocked: 0,
  warnings: 0
};

// Auth failure tracking  
let authFailures = {
  invalid_token: 0,
  expired_token: 0,
  missing_token: 0,
  insufficient_permissions: 0
};

/**
 * LOG-H2: Log rate limit event
 */
export function logRateLimitEvent(
  request: FastifyRequest,
  details: {
    limited: boolean;
    remaining: number;
    limit: number;
    resetTime?: number;
    key?: string;
  }
) {
  if (details.limited) {
    rateLimitEvents.blocked++;
    incrementMetric('rate_limit_blocked_total');
    
    logger.warn({
      requestId: request.requestId,
      path: request.url,
      method: request.method,
      ip: getClientIp(request),
      userId: (request.user as any)?.id,
      tenantId: (request as any).tenantId,
      limit: details.limit,
      remaining: details.remaining,
      resetTime: details.resetTime,
      rateKey: details.key
    }, 'Rate limit exceeded');
  } else if (details.remaining <= 5) {
    // Warning when approaching limit
    rateLimitEvents.warnings++;
    
    logger.info({
      requestId: request.requestId,
      path: request.url,
      remaining: details.remaining,
      limit: details.limit
    }, 'Rate limit approaching');
  }
}

/**
 * LOG-H3: Log auth failure
 */
export function logAuthFailure(
  request: FastifyRequest,
  reason: 'invalid_token' | 'expired_token' | 'missing_token' | 'insufficient_permissions',
  details?: Record<string, any>
) {
  authFailures[reason]++;
  incrementMetric('auth_failure_total', { reason });
  
  logger.warn({
    requestId: request.requestId,
    path: request.url,
    method: request.method,
    ip: getClientIp(request),
    reason,
    userAgent: request.headers['user-agent'],
    ...details
  }, 'Authentication failure');
}

/**
 * Get rate limit and auth metrics
 */
export function getSecurityMetrics() {
  return {
    rateLimit: { ...rateLimitEvents },
    authFailures: { ...authFailures }
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetSecurityMetrics() {
  rateLimitEvents = { blocked: 0, warnings: 0 };
  authFailures = { invalid_token: 0, expired_token: 0, missing_token: 0, insufficient_permissions: 0 };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Create request logger middleware
 */
export function createRequestLogger(customConfig?: Partial<RequestLoggerConfig>) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  return async function requestLoggerMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Skip configured paths
    const path = request.url.split('?')[0];
    if (config.skipPaths.some(p => path.startsWith(p))) {
      return;
    }
    
    const startTime = Date.now();
    const requestId = request.requestId || request.id;
    
    // Log incoming request
    const requestLog: Record<string, any> = {
      requestId,
      method: request.method,
      path: request.url,
      ip: getClientIp(request),
      userAgent: request.headers['user-agent'],
      contentLength: request.headers['content-length'],
      tenantId: (request as any).tenantId,
      userId: (request.user as any)?.id
    };
    
    // Log body for mutation methods
    if (config.logBodyMethods.includes(request.method) && request.body) {
      const redactedBody = redactSensitive(request.body, config.redactFields);
      requestLog.body = truncateBody(redactedBody, config.maxBodyLogSize);
    }
    
    logger.info(requestLog, 'Incoming request');
    
    // Add response logging hook
    reply.raw.on('finish', () => {
      const duration = Date.now() - startTime;
      
      const responseLog: Record<string, any> = {
        requestId,
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        duration,
        contentLength: reply.getHeader('content-length')
      };
      
      // Log slow requests
      if (duration >= config.slowRequestThresholdMs) {
        logger.warn({
          ...responseLog,
          threshold: config.slowRequestThresholdMs
        }, 'Slow request detected');
      } else if (reply.statusCode >= 500) {
        logger.error(responseLog, 'Request completed with server error');
      } else if (reply.statusCode >= 400) {
        logger.warn(responseLog, 'Request completed with client error');
      } else {
        logger.info(responseLog, 'Request completed');
      }
      
      // Track metrics
      incrementMetric('http_requests_total', {
        method: request.method,
        status: String(reply.statusCode),
        path: path.split('/').slice(0, 3).join('/') // Normalize path for metrics
      });
      
      incrementMetric('http_request_duration_ms', { method: request.method }, duration);
    });
  };
}

/**
 * Setup request logging for Fastify
 */
export function setupRequestLogger(
  fastify: FastifyInstance,
  customConfig?: Partial<RequestLoggerConfig>
) {
  const middleware = createRequestLogger(customConfig);
  
  // Register as onRequest hook (runs before routing)
  fastify.addHook('onRequest', middleware);
  
  // Register error handler for detailed error logging
  fastify.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = error.statusCode || 500;
    
    // ERR-H3: Don't expose stack traces in production
    const errorLog: Record<string, any> = {
      requestId: request.requestId,
      path: request.url,
      method: request.method,
      errorCode: error.code,
      errorMessage: error.message,
      statusCode
    };
    
    if (!isProduction) {
      errorLog.stack = error.stack;
    }
    
    logger.error(errorLog, 'Request error');
    
    // Send RFC 7807 error response
    reply.code(statusCode).send({
      type: `urn:error:compliance-service:${statusCode === 500 ? 'internal' : 'error'}`,
      title: error.name || 'Error',
      status: statusCode,
      detail: isProduction && statusCode >= 500 ? 'An internal error occurred' : error.message,
      instance: request.requestId
    });
  });
  
  // Register 404 handler (ERR-H2)
  fastify.setNotFoundHandler((request, reply) => {
    logger.info({
      requestId: request.requestId,
      path: request.url,
      method: request.method,
      ip: getClientIp(request)
    }, 'Route not found');
    
    reply.code(404).send({
      type: 'urn:error:compliance-service:not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      instance: request.requestId
    });
  });
  
  logger.info('Request logger middleware initialized');
}

export default setupRequestLogger;
