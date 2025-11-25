import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as customerAnalytics from '../controllers/customer-analytics.controller';

export default async function customersRoutes(app: FastifyInstance) {
  app.get('/customers/:customerId/profile', {
    preHandler: [authenticateFastify, tenantHook]
  }, customerAnalytics.getCustomerProfile as any);
}
