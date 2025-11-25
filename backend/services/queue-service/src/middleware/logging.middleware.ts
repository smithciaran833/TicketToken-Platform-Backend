import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export async function loggingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const start = Date.now();

  // Log request
  logger.info(`${request.method} ${request.url}`, {
    query: request.query,
    ip: request.ip
  });

  // Log response on completion
  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${request.method} ${request.url} - ${reply.statusCode}`, {
      duration: `${duration}ms`
    });
  });
}
