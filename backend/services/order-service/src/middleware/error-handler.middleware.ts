import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validators';
import { DomainError } from '../errors/domain-errors';

const isProduction = process.env.NODE_ENV === 'production';

export async function errorHandler(
  error: FastifyError | ValidationError | DomainError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // CEC2: Extract error code if available
  const errorCode = (error as DomainError).code || 
                    (error as FastifyError).code ||
                    'UNKNOWN_ERROR';

  // GEH5: Only include stack trace in non-production environments
  logger.error('Unhandled error', {
    error: error.message,
    code: errorCode,
    ...(isProduction ? {} : { stack: error.stack }),
    url: request.url,
    method: request.method,
    requestId: request.id,
  });

  // Validation errors (our custom ValidationError)
  if (error instanceof ValidationError) {
    return reply.status(400).send({
      error: error.message,
      field: error.field,
      requestId: request.id,
    });
  }

  // Fastify validation errors
  if ('validation' in error && error.validation) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: error.validation,
      requestId: request.id,
    });
  }

  // Default error response
  const statusCode = (error as FastifyError).statusCode || 500;
  reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal server error' : error.message,
    requestId: request.id,
  });
}
