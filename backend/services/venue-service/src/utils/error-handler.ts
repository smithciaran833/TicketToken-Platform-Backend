import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { AppError } from './errors';
import { logger } from './logger';

const log = logger.child({ component: 'ErrorHandler' });

/**
 * SECURITY FIX (RH3, RH5, RH6): RFC 7807 Problem Details error response format
 * https://tools.ietf.org/html/rfc7807
 */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlation_id?: string;
  timestamp?: string;
  // Extension members
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Create RFC 7807 Problem Details response
 */
function createProblemDetails(
  status: number,
  title: string,
  options: {
    type?: string;
    detail?: string;
    instance?: string;
    correlationId?: string;
    code?: string;
    errors?: Array<{ field: string; message: string }>;
  } = {}
): ProblemDetails {
  return {
    type: options.type || `https://api.tickettoken.com/problems/${status}`,
    title,
    status,
    detail: options.detail,
    instance: options.instance,
    correlation_id: options.correlationId,
    timestamp: new Date().toISOString(),
    code: options.code,
    errors: options.errors,
  };
}

/**
 * Map HTTP status codes to RFC 7807 titles
 */
const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * SECURITY FIX (RH3): Not Found handler with RFC 7807 format
 */
export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const correlationId = request.id || request.headers['x-request-id'] as string;
  
  log.warn({
    method: request.method,
    url: request.url,
    correlationId,
  }, 'Route not found');

  const problem = createProblemDetails(404, 'Not Found', {
    type: 'https://api.tickettoken.com/problems/not-found',
    detail: `The requested resource ${request.method} ${request.url} was not found`,
    instance: request.url,
    correlationId,
  });

  reply
    .code(404)
    .header('Content-Type', 'application/problem+json')
    .send(problem);
}

/**
 * SECURITY FIX (RH5, RH6): Error handler with RFC 7807 format and correlation ID
 */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const correlationId = request.id || request.headers['x-request-id'] as string;
  
  // Determine status code
  let statusCode = 500;
  let title = 'Internal Server Error';
  let detail: string | undefined;
  let code: string | undefined;
  let errors: Array<{ field: string; message: string }> | undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    title = STATUS_TITLES[statusCode] || error.name;
    detail = error.message;
    code = error.code;
    if (error.details?.invalidFields) {
      errors = error.details.invalidFields.map((field: string) => ({
        field,
        message: `Invalid value for ${field}`,
      }));
    }
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
    title = STATUS_TITLES[statusCode] || 'Error';
    detail = error.message;
    code = (error as any).code;
  } else if ('validation' in error) {
    // Fastify validation error
    statusCode = 400;
    title = 'Validation Error';
    detail = error.message;
    code = 'VALIDATION_ERROR';
    if (Array.isArray((error as any).validation)) {
      errors = (error as any).validation.map((v: any) => ({
        field: v.params?.missingProperty || v.instancePath?.slice(1) || 'unknown',
        message: v.message || 'Invalid value',
      }));
    }
  } else {
    detail = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message;
  }

  // Log error with correlation ID
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  log[logLevel]({
    err: error,
    statusCode,
    correlationId,
    method: request.method,
    url: request.url,
    userId: (request as any).user?.id,
  }, `Request error: ${error.message}`);

  const problem = createProblemDetails(statusCode, title, {
    type: `https://api.tickettoken.com/problems/${code?.toLowerCase() || statusCode}`,
    detail,
    instance: request.url,
    correlationId,
    code,
    errors,
  });

  reply
    .code(statusCode)
    .header('Content-Type', 'application/problem+json')
    // SECURITY FIX (RH6): Include correlation ID in response header
    .header('X-Correlation-ID', correlationId)
    .send(problem);
}

/**
 * Register error handlers with Fastify instance
 */
export function registerErrorHandlers(fastify: FastifyInstance): void {
  // Set not found handler
  fastify.setNotFoundHandler(notFoundHandler);
  
  // Set error handler
  fastify.setErrorHandler(errorHandler);

  log.info('RFC 7807 error handlers registered');
}

/**
 * SECURITY FIX (SEC-R13, SEC-R14): Security headers middleware
 */
export function securityHeaders(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request, reply) => {
    // HSTS header (SEC-R14)
    if (process.env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Additional security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // HTTPS redirect in production (SEC-R13)
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true') {
    fastify.addHook('onRequest', async (request, reply) => {
      const proto = request.headers['x-forwarded-proto'] as string;
      if (proto === 'http') {
        const host = request.headers.host || '';
        const url = `https://${host}${request.url}`;
        reply.redirect(301, url);
      }
    });
  }

  log.info('Security headers middleware registered');
}

/**
 * SECURITY FIX (FC8, RH1-RH3): Rate limit response handler
 */
export function rateLimitHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  options: { max: number; timeWindow: string | number; remaining?: number; resetTime?: Date }
): void {
  const correlationId = request.id || request.headers['x-request-id'] as string;
  const remaining = options.remaining ?? 0;
  const resetTime = options.resetTime ?? new Date(Date.now() + 60000);
  const resetTimestamp = Math.floor(resetTime.getTime() / 1000);

  // SECURITY FIX (FC8): Log rate limit exceeded
  log.warn({
    correlationId,
    method: request.method,
    url: request.url,
    userId: (request as any).user?.id,
    ip: request.ip,
    limit: options.max,
    remaining,
  }, 'Rate limit exceeded');

  // SECURITY FIX (RH1-RH3): Add rate limit headers
  reply.header('RateLimit-Limit', String(options.max));
  reply.header('RateLimit-Remaining', String(remaining));
  reply.header('RateLimit-Reset', String(resetTimestamp));
  reply.header('Retry-After', String(Math.ceil((resetTime.getTime() - Date.now()) / 1000)));

  const problem = createProblemDetails(429, 'Too Many Requests', {
    type: 'https://api.tickettoken.com/problems/rate-limit-exceeded',
    detail: `Rate limit exceeded. Try again after ${resetTime.toISOString()}`,
    instance: request.url,
    correlationId,
    code: 'RATE_LIMIT_EXCEEDED',
  });

  reply
    .code(429)
    .header('Content-Type', 'application/problem+json')
    .header('X-Correlation-ID', correlationId)
    .send(problem);
}

export { createProblemDetails, ProblemDetails };
