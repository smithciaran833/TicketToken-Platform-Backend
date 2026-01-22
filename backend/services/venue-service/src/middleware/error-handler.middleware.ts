import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { isAppError, AppError, mapDatabaseError, CircuitBreakerOpenError, ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';

// SECURITY FIX: Explicit whitelist of safe error messages
// Never expose raw error messages to clients - use these safe messages instead
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  // Database errors
  'QueryFailedError': 'Database operation failed',
  'ConnectionError': 'Database connection error',
  'TimeoutError': 'Operation timed out',
  
  // Validation errors
  'ValidationError': 'Validation failed',
  'CastError': 'Invalid data format',
  
  // Circuit breaker / Service errors
  'CircuitBreakerOpenError': 'Service temporarily unavailable',
  'CIRCUIT_BREAKER_OPEN': 'Service temporarily unavailable',
  'ServiceUnavailableError': 'Service temporarily unavailable',
  
  // Authentication errors
  'UnauthorizedError': 'Authentication required',
  'TokenExpiredError': 'Authentication token expired',
  'JsonWebTokenError': 'Invalid authentication token',
  
  // Generic fallback
  'default': 'An error occurred while processing your request'
};

// SECURITY FIX: Get safe error message based on error type/name
function getSafeErrorMessage(error: any): string {
  // Check error name first
  if (error.name && SAFE_ERROR_MESSAGES[error.name]) {
    return SAFE_ERROR_MESSAGES[error.name];
  }
  
  // Check error code
  if (error.code && SAFE_ERROR_MESSAGES[error.code]) {
    return SAFE_ERROR_MESSAGES[error.code];
  }
  
  // Return default safe message
  return SAFE_ERROR_MESSAGES['default'];
}

export async function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle null/undefined errors first
  if (!error) {
    logger.error({
      requestId: request.id,
      method: request.method,
      url: request.url,
      userId: (request as any).user?.id
    }, 'Null or undefined error received');
    
    return ErrorResponseBuilder.internal(reply, 'An unexpected error occurred');
  }

  // Log the error
  logger.error({
    err: error,
    requestId: request.id,
    method: request.method,
    url: request.url,
    userId: (request as any).user?.id
  }, 'Request error');

  // Handle our custom AppError instances
  if (isAppError(error)) {
    return ErrorResponseBuilder.send(
      reply,
      error.statusCode,
      error.message,
      error.code || 'UNKNOWN_ERROR',
      error.details
    );
  }

  // Handle Fastify validation errors
  if ((error as FastifyError).validation) {
    return ErrorResponseBuilder.validation(reply, (error as FastifyError).validation);
  }

  // SECURITY FIX: Use error type instead of string matching for circuit breaker
  if (error instanceof CircuitBreakerOpenError || 
      error instanceof ServiceUnavailableError ||
      (error as any).code === 'CIRCUIT_BREAKER_OPEN' ||
      error.name === 'CircuitBreakerOpenError') {
    return ErrorResponseBuilder.send(
      reply,
      503,
      'Service temporarily unavailable',
      'SERVICE_UNAVAILABLE',
      { retryAfter: 30 }
    );
  }

  // Handle database errors
  if (error.name === 'QueryFailedError' || error.message?.includes('database')) {
    const dbError = mapDatabaseError(error);
    return ErrorResponseBuilder.send(
      reply,
      dbError.statusCode,
      dbError.message,
      dbError.code || 'DATABASE_ERROR',
      dbError.details
    );
  }

  // SECURITY FIX: Always use safe error messages regardless of environment
  // Never expose raw error.message to client
  return ErrorResponseBuilder.internal(reply, getSafeErrorMessage(error));
}
