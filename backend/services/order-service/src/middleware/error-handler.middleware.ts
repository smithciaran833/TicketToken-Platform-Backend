import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validators';

export async function errorHandler(
  error: FastifyError | ValidationError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
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
