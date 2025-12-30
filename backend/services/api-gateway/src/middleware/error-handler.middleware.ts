import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { createRequestLogger, logError } from '../utils/logger';
import { ApiError } from '../types';

/**
 * RFC 7807 Problem Details format
 * https://datatracker.ietf.org/doc/html/rfc7807
 */
interface ProblemDetails {
  type: string;           // URI reference identifying the problem type
  title: string;          // Short human-readable summary
  status: number;         // HTTP status code
  detail?: string;        // Human-readable explanation
  instance?: string;      // URI reference to the specific occurrence
  // Extensions
  correlationId: string;  // Request tracking ID
  timestamp: string;      // ISO 8601 timestamp
  code?: string;          // Machine-readable error code
  errors?: any[];         // Validation errors array
}

const ERROR_TYPE_BASE = 'https://api.tickettoken.com/errors';

export async function setupErrorHandler(server: FastifyInstance) {
  // ==========================================================================
  // 404 Not Found Handler
  // ==========================================================================
  server.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const logger = createRequestLogger(request.id);
    
    logger.warn({
      method: request.method,
      url: request.url,
      ip: request.ip
    }, 'Route not found');

    const problem: ProblemDetails = {
      type: `${ERROR_TYPE_BASE}/not-found`,
      title: 'Not Found',
      status: 404,
      detail: `The requested resource '${request.url}' was not found`,
      instance: request.url,
      correlationId: request.id,
      timestamp: new Date().toISOString()
    };

    return reply
      .code(404)
      .header('Content-Type', 'application/problem+json')
      .header('X-Correlation-ID', request.id)
      .send(problem);
  });

  // ==========================================================================
  // Global Error Handler
  // ==========================================================================
  server.setErrorHandler(async (error: FastifyError | ApiError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const venueId = (request as any).venueContext?.venueId || (request.user as any)?.venueId;
    const logger = createRequestLogger(request.id, venueId);

    let problem: ProblemDetails = {
      type: `${ERROR_TYPE_BASE}/internal-error`,
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred',
      instance: request.url,
      correlationId: request.id,
      timestamp: new Date().toISOString()
    };

    // Handle different error types
    if (error instanceof ApiError) {
      problem = {
        type: `${ERROR_TYPE_BASE}/${error.code?.toLowerCase() || 'api-error'}`,
        title: error.name,
        status: (error as any).statusCode || 500,
        detail: (error as any).message,
        instance: request.url,
        correlationId: request.id,
        timestamp: new Date().toISOString(),
        code: error.code
      };

      // Add details in non-production
      if (process.env.NODE_ENV !== 'production' && error.details) {
        (problem as any).details = error.details;
      }

      logger.warn({
        error: {
          name: error.name,
          message: (error as any).message,
          code: error.code,
          statusCode: (error as any).statusCode,
          stack: error.stack,
        },
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query,
        },
      }, 'API error occurred');

    } else if ((error as any).validation) {
      // Fastify validation errors
      problem = {
        type: `${ERROR_TYPE_BASE}/validation-error`,
        title: 'Validation Error',
        status: 422,
        detail: 'Request validation failed',
        instance: request.url,
        correlationId: request.id,
        timestamp: new Date().toISOString(),
        code: 'VALIDATION_ERROR',
        errors: formatValidationErrors((error as any).validation)
      };

      logger.warn({
        error: {
          validation: (error as any).validation,
        },
        request: {
          method: request.method,
          url: request.url,
          body: request.body,
        },
      }, 'Validation error occurred');

    } else if ((error as any).statusCode) {
      // Fastify HTTP errors
      const statusCode = (error as any).statusCode;
      problem = {
        type: `${ERROR_TYPE_BASE}/${getErrorTypeFromStatus(statusCode)}`,
        title: getErrorTitleFromStatus(statusCode),
        status: statusCode,
        detail: (error as any).message,
        instance: request.url,
        correlationId: request.id,
        timestamp: new Date().toISOString(),
        code: (error as any).code
      };

      if (statusCode >= 500) {
        logger.error({
          error: {
            message: (error as any).message,
            statusCode: statusCode,
            stack: error.stack,
          },
        }, 'Server error occurred');
      } else {
        logger.warn({
          error: {
            message: (error as any).message,
            statusCode: statusCode,
          },
        }, 'Client error occurred');
      }
    } else {
      // Unknown errors
      logError(error as Error, 'Unhandled error', {
        correlationId: request.id,
        method: request.method,
        url: request.url,
      });

      // Don't leak internal error details in production
      if (process.env.NODE_ENV !== 'production') {
        problem.detail = (error as Error).message;
        (problem as any).stack = (error as Error).stack;
      }
    }

    // Set headers
    reply.header('Content-Type', 'application/problem+json');
    reply.header('X-Correlation-ID', request.id);
    reply.header('X-Request-ID', request.id); // Legacy support
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // Add Retry-After for rate limit errors
    if (problem.status === 429) {
      const retryAfter = (error as any).retryAfter || 60;
      reply.header('Retry-After', retryAfter.toString());
    }

    return reply.code(problem.status).send(problem);
  });
}

// Helper to format validation errors
function formatValidationErrors(validation: any[]): any[] {
  return validation.map(error => ({
    field: error.dataPath || error.instancePath || error.path,
    message: error.message,
    value: error.value,
    constraint: error.params
  }));
}

// Map status codes to error types
function getErrorTypeFromStatus(status: number): string {
  const typeMap: Record<number, string> = {
    400: 'bad-request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not-found',
    405: 'method-not-allowed',
    409: 'conflict',
    422: 'validation-error',
    429: 'rate-limit-exceeded',
    500: 'internal-error',
    502: 'bad-gateway',
    503: 'service-unavailable',
    504: 'gateway-timeout'
  };
  return typeMap[status] || 'error';
}

// Map status codes to titles
function getErrorTitleFromStatus(status: number): string {
  const titleMap: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return titleMap[status] || 'Error';
}

// Error recovery middleware for process-level errors
export function errorRecoveryMiddleware(server: FastifyInstance) {
  const logger = createRequestLogger('error-recovery');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason,
      promise,
    }, 'Unhandled promise rejection');

    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => {
        process.exit(1);
      }, 30000);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({
      error: {
        message: error.message,
        stack: error.stack,
      },
    }, 'Uncaught exception');

    server.close(() => {
      process.exit(1);
    });

    setTimeout(() => {
      process.abort();
    }, 30000);
  });

  process.on('warning', (warning) => {
    logger.warn({
      warning: {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      },
    }, 'Node.js warning');
  });
}
