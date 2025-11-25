import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

interface SanitizedError {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  timestamp: string;
}

/**
 * Production-safe error handler
 * Sanitizes error responses to prevent information leakage
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request.id || Math.random().toString(36).substring(7)) as string;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log the full error details (with sensitive info) for debugging
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
      },
      request: {
        id: requestId,
        method: request.method,
        url: request.url,
        headers: isProduction ? undefined : request.headers, // Don't log headers in production
        body: isProduction ? undefined : request.body,
      },
    },
    'Request error occurred'
  );

  // Determine status code
  const statusCode = error.statusCode || (error as any).status || 500;

  // Build sanitized error response
  const sanitizedError: SanitizedError = {
    statusCode,
    error: getErrorName(statusCode),
    message: getSafeErrorMessage(error, statusCode, isProduction),
    requestId,
    timestamp: new Date().toISOString(),
  };

  // Send sanitized response
  reply.status(statusCode).send(sanitizedError);
}

/**
 * Get safe error message based on environment and error type
 */
function getSafeErrorMessage(
  error: FastifyError,
  statusCode: number,
  isProduction: boolean
): string {
  // In development, return actual error message (helpful for debugging)
  if (!isProduction) {
    return error.message || 'An error occurred';
  }

  // In production, return generic messages to prevent information leakage
  switch (statusCode) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Authentication required. Please log in and try again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'The request conflicts with the current state. Please try again.';
    case 422:
      return 'The request data is invalid. Please check your input.';
    case 429:
      return 'Too many requests. Please slow down and try again later.';
    case 500:
      return 'An internal server error occurred. Please try again later.';
    case 502:
      return 'Bad gateway. The service is temporarily unavailable.';
    case 503:
      return 'Service temporarily unavailable. Please try again later.';
    case 504:
      return 'Gateway timeout. The request took too long to process.';
    default:
      return 'An error occurred processing your request.';
  }
}

/**
 * Get standard error name for status code
 */
function getErrorName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return 'Error';
  }
}

/**
 * Set default error handler for Fastify
 */
export function registerErrorHandler(app: any) {
  app.setErrorHandler(errorHandler);
}
