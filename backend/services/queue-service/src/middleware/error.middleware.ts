import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export function errorMiddleware(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error('Error handling request:', {
    error: error.message,
    stack: error.stack,
    path: request.url,
    method: request.method
  });

  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.statusCode
    });
    return;
  }

  // Default error
  reply.code(500).send({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
