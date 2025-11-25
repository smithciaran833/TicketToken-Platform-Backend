import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export async function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  
  logger.error('Error handled', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    ip: request.ip
  });

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code
    });
  }

  // Handle specific errors
  if (error.name === 'ValidationError') {
    return reply.status(400).send({
      error: 'Validation error',
      details: error.message
    });
  }

  if (error.name === 'UnauthorizedError') {
    return reply.status(401).send({
      error: 'Unauthorized'
    });
  }

  // Default error
  return reply.status(500).send({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
}
