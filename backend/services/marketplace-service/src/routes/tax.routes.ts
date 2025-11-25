import { FastifyInstance } from 'fastify';
import { taxController } from '../controllers/tax.controller';
import { authMiddleware } from '../middleware/auth.middleware';

export default async function taxRoutes(fastify: FastifyInstance) {
  // All tax routes require authentication
  const securePreHandler = [authMiddleware];

  // Get reportable transactions
  fastify.get('/transactions', {
    preHandler: securePreHandler
  }, taxController.getTransactions.bind(taxController));

  // Get yearly report
  fastify.get('/report/:year', {
    preHandler: securePreHandler
  }, taxController.getYearlyReport.bind(taxController));

  // Generate 1099-K
  fastify.get('/1099k/:year', {
    preHandler: securePreHandler
  }, taxController.generate1099K.bind(taxController));
}
