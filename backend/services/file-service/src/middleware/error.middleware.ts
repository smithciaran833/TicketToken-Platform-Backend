import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({ err: error, url: request.url, method: request.method }, 'Request error');
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  reply.status(statusCode).send({
    error: message,
    statusCode,
    timestamp: new Date().toISOString()
  });
}
