import { FastifyInstance } from 'fastify';
import { VenueController } from '../controllers/venue.controller';
import { requireComplianceOfficer } from '../middleware/auth.middleware';

export async function venueRoutes(fastify: FastifyInstance) {
  const venueController = new VenueController();

  fastify.post('/venue/start-verification', {
    onRequest: requireComplianceOfficer
  }, venueController.startVerification);

  fastify.get('/venue/:venueId/status', venueController.getVerificationStatus);

  fastify.get('/venue/verifications', {
    onRequest: requireComplianceOfficer
  }, venueController.getAllVerifications);
}
