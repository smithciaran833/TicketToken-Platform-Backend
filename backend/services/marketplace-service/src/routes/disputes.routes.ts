import { FastifyInstance } from 'fastify';
import { disputeController } from '../controllers/dispute.controller';
import { authMiddleware } from '../middleware/auth.middleware';

export default async function disputesRoutes(fastify: FastifyInstance) {
  // All dispute routes require authentication
  const securePreHandler = [authMiddleware];

  // Create dispute
  fastify.post('/', {
    preHandler: securePreHandler
  }, disputeController.create.bind(disputeController));

  // Get user's disputes
  fastify.get('/my-disputes', {
    preHandler: securePreHandler
  }, disputeController.getMyDisputes.bind(disputeController));

  // Get specific dispute
  fastify.get('/:disputeId', {
    preHandler: securePreHandler
  }, disputeController.getById.bind(disputeController));

  // Add evidence to dispute
  fastify.post('/:disputeId/evidence', {
    preHandler: securePreHandler
  }, disputeController.addEvidence.bind(disputeController));
}
