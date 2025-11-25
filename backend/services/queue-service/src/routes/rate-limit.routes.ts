import { FastifyInstance } from 'fastify';
import { RateLimitController } from '../controllers/rate-limit.controller';

const rateLimitController = new RateLimitController();

async function rateLimitRoutes(fastify: FastifyInstance) {
  // Get current rate limit status
  fastify.get(
    '/status/:key',
    rateLimitController.getStatus.bind(rateLimitController)
  );

  // Reset rate limit for a key
  fastify.post(
    '/reset/:key',
    rateLimitController.resetLimit.bind(rateLimitController)
  );

  // Temporarily commented out - methods not implemented yet
  /*
  // Update rate limit settings
  fastify.put(
    '/update/:key',
    rateLimitController.updateLimit.bind(rateLimitController)
  );

  // Disable rate limiting for a key
  fastify.delete(
    '/disable/:key',
    rateLimitController.disableLimit.bind(rateLimitController)
  );
  */
}

export default rateLimitRoutes;
