import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as customerAnalytics from '../controllers/customer-analytics.controller';

const customerIdParamSchema = {
  type: 'object',
  required: ['customerId'],
  properties: {
    customerId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

export default async function customersRoutes(app: FastifyInstance) {
  app.get('/customers/:customerId/profile', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: customerIdParamSchema
    }
  }, customerAnalytics.getCustomerProfile as any);
}
