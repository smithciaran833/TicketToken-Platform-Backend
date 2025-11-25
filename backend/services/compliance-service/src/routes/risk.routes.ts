import { FastifyInstance } from 'fastify';
import { RiskController } from '../controllers/risk.controller';
import { requireComplianceOfficer } from '../middleware/auth.middleware';

export async function riskRoutes(fastify: FastifyInstance) {
  const riskController = new RiskController();

  // Risk assessment routes
  fastify.post('/risk/assess', {
    onRequest: requireComplianceOfficer
  }, riskController.calculateRiskScore);

  fastify.get('/risk/:entityId/score', riskController.calculateRiskScore);

  fastify.put('/risk/:entityId/override', {
    onRequest: requireComplianceOfficer
  }, riskController.flagVenue);

  fastify.post('/risk/flag', riskController.flagVenue);
  fastify.post('/risk/resolve', riskController.resolveFlag);
}
