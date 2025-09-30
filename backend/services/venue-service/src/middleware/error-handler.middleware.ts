import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { isAppError, AppError, mapDatabaseError } from '../utils/errors';
import { logger } from '../utils/logger';

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

  // Handle circuit breaker errors BEFORE database errors
  if (error.message?.includes('Circuit breaker is open')) {
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

  // Default to internal server error
  return ErrorResponseBuilder.internal(reply,
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message
  );
}
