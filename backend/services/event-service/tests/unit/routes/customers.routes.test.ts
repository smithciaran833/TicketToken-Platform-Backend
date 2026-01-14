/**
 * Unit tests for customers.routes.ts
 * Tests route registration, middleware chain, and handler binding
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import customersRoutes from '../../../src/routes/customers.routes';

jest.mock('../../../src/middleware/auth', () => ({
  authenticateFastify: jest.fn((req: any, reply: any, done: any) => {
    req.user = { id: 'user-123', tenant_id: 'tenant-123' };
    done();
  })
}));

jest.mock('../../../src/middleware/tenant', () => ({
  tenantHook: jest.fn((req: any, reply: any, done: any) => {
    req.tenant_id = 'tenant-123';
    done();
  })
}));

jest.mock('../../../src/controllers/customer-analytics.controller', () => ({
  getCustomerProfile: jest.fn((req: any, reply: any) => reply.send({ id: req.params.customerId, events: [] }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as customerController from '../../../src/controllers/customer-analytics.controller';

describe('Customers Routes', () => {
  let app: FastifyInstance;
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    app = Fastify();
    await app.register(customersRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /customers/:customerId/profile route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/customers/:customerId/profile');
    });
  });

  describe('GET /customers/:customerId/profile', () => {
    it('should call getCustomerProfile controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/customers/${validUuid}/profile`
      });

      expect(response.statusCode).toBe(200);
      expect(customerController.getCustomerProfile).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/customers/${validUuid}/profile`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'GET',
        url: `/customers/${validUuid}/profile`
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept any customerId (no schema validation)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/customers/any-string/profile'
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
