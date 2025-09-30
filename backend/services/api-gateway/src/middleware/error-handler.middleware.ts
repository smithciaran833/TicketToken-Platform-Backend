import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { createRequestLogger, logError } from '../utils/logger';
import { ApiError } from '../types';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: any;
  requestId: string;
  timestamp: string;
}

export async function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler(async (error: FastifyError | ApiError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const logger = createRequestLogger(request.id, request.headers['x-venue-id'] as string);

    // Default error response
    let response: ErrorResponse = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    // Handle different error types
    if (error instanceof ApiError) {
      // Custom API errors
      response = {
        statusCode: (error as any).statusCode,
        error: error.name,
        message: (error as any).message,
        code: error.code,
        details: process.env.NODE_ENV !== 'production' ? error.details : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

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
      response = {
        statusCode: 422,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: process.env.NODE_ENV !== 'production' ? formatValidationErrors((error as any).validation) : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
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
      // Fastify errors
      response = {
        statusCode: (error as any).statusCode,
        error: (error as any).code || 'Error',
        message: (error as any).message,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      // Log based on status code
      if ((error as any).statusCode >= 500) {
        logger.error({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
            stack: error.stack,
          },
        }, 'Server error occurred');
      } else {
        logger.warn({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
          },
        }, 'Client error occurred');
      }
    } else {
      // Unknown errors
      logError(error as Error, 'Unhandled error', {
        requestId: request.id,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      });

      // Don't leak internal error details in production
      if (process.env.NODE_ENV === 'production') {
        response.message = 'An unexpected error occurred';
      } else {
        response.message = (error as Error).message;
        response.details = {
          stack: (error as Error).stack,
        };
      }
    }

    // Set appropriate headers
    reply.header('X-Request-ID', request.id);

    // Add retry headers for rate limit errors
    if (response.statusCode === 429 && response.details?.retryAfter) {
      reply.header('Retry-After', response.details.retryAfter.toString());
    }

    // Add cache headers to prevent caching errors
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // Send error response
    return reply.code(response.statusCode).send(response);
  });
}

// Helper to format validation errors
function formatValidationErrors(validation: any[]): any[] {
  return validation.map(error => ({
    field: error.dataPath || error.instancePath,
    message: error.message,
    params: error.params,
  }));
}

// Error recovery middleware for process-level errors
export function errorRecoveryMiddleware(server: FastifyInstance) {
  const logger = createRequestLogger('error-recovery');

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason,
      promise,
    }, 'Unhandled promise rejection');

    // In production, we might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      // Give time for current requests to finish
      setTimeout(() => {
        process.exit(1);
      }, 30000);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({
      error: {
        message: error.message,
        stack: error.stack,
      },
    }, 'Uncaught exception');

    // Attempt graceful shutdown
    server.close(() => {
      process.exit(1);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      process.abort();
    }, 30000);
  });

  // Log warning for deprecations
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
