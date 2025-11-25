import { FastifyInstance } from 'fastify';
import { OFACController } from '../controllers/ofac.controller';
import { requireComplianceOfficer } from '../middleware/auth.middleware';

export async function ofacRoutes(fastify: FastifyInstance) {
  const ofacController = new OFACController();

  // OFAC screening routes
  fastify.post('/ofac/check', {
    onRequest: requireComplianceOfficer
  }, ofacController.checkName);
}
