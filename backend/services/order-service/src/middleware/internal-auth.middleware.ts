import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;

export async function authenticateInternal(request: FastifyRequest, reply: FastifyReply) {
  try {
    const secret = request.headers['x-service-secret'];

    if (!secret || secret !== INTERNAL_SERVICE_SECRET) {
      logger.warn('Unauthorized internal service call', {
        ip: request.ip,
        url: request.url,
      });
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  } catch (error) {
    logger.error('Internal authentication failed', { error });
    return reply.status(401).send({ error: 'Authentication failed' });
  }
}
