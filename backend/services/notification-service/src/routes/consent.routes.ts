import { FastifyInstance } from 'fastify';
import { consentController } from '../controllers/consent.controller';
import { authMiddleware } from '../middleware/auth.middleware';

export default async function consentRoutes(fastify: FastifyInstance) {
  // Grant consent - REQUIRES AUTH
  fastify.post('/grant', {
    preHandler: [authMiddleware]
  }, consentController.grant.bind(consentController));

  // Revoke consent - REQUIRES AUTH
  fastify.post('/revoke', {
    preHandler: [authMiddleware]
  }, consentController.revoke.bind(consentController));

  // Check consent status - REQUIRES AUTH
  fastify.get('/:customerId', {
    preHandler: [authMiddleware]
  }, consentController.check.bind(consentController));
}
