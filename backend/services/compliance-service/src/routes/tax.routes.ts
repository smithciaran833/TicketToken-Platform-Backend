import { FastifyInstance } from 'fastify';
import { TaxController } from '../controllers/tax.controller';

export async function taxRoutes(fastify: FastifyInstance) {
  const taxController = new TaxController();

  // Tax routes - authenticated by default from parent
  fastify.post('/tax/calculate', taxController.calculateTax);
  fastify.get('/tax/reports/:year', taxController.generateTaxReport);
}
