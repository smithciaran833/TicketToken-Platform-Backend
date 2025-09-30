import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method
  });
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  reply.status(statusCode).send({
    error: message,
    statusCode,
    timestamp: new Date().toISOString()
  });
}
