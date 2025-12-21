import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TaxController } from '../controllers/tax.controller';

export default async function taxRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new TaxController();

  // Jurisdiction routes
  fastify.post('/jurisdictions', controller.createJurisdiction);
  fastify.get('/jurisdictions', controller.getJurisdictions);
  fastify.patch('/jurisdictions/:jurisdictionId', controller.updateJurisdiction);

  // Tax rate routes
  fastify.post('/rates', controller.createTaxRate);
  fastify.get('/rates', controller.getTaxRates);

  // Tax category routes
  fastify.post('/categories', controller.createCategory);
  fastify.get('/categories', controller.getCategories);

  // Tax exemption routes
  fastify.post('/exemptions', controller.createExemption);
  fastify.get('/exemptions/customer/:customerId', controller.getCustomerExemptions);
  fastify.post('/exemptions/:exemptionId/verify', controller.verifyExemption);

  // Tax calculation routes
  fastify.post('/calculate', controller.calculateTax);
  fastify.get('/orders/:orderId', controller.getTaxForOrder);

  // Provider configuration routes
  fastify.post('/provider/configure', controller.configureProvider);
  fastify.get('/provider/config', controller.getProviderConfig);

  // Tax reporting routes
  fastify.post('/reports', controller.generateReport);
  fastify.get('/reports', controller.getReports);
  fastify.post('/reports/:reportId/file', controller.fileReport);
}
