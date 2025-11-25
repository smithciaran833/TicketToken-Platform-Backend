import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    path: request.url,
    method: request.method
  });

  if (error.name === 'ValidationError') {
    return reply.code(400).send({
      success: false,
      error: 'Validation failed',
      details: (error as any).details
    });
  }

  if (error.name === 'UnauthorizedError') {
    return reply.code(401).send({
      success: false,
      error: 'Unauthorized'
    });
  }

  return reply.code(error.statusCode || 500).send({
    success: false,
    error: error.message || 'Internal server error'
  });
}
