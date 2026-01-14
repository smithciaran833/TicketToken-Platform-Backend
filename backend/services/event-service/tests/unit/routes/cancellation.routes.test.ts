/**
 * Unit tests for cancellation.routes.ts
 * Tests route registration, middleware chain, and handler binding
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import cancellationRoutes from '../../../src/routes/cancellation.routes';

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

jest.mock('../../../src/controllers/cancellation.controller', () => ({
  cancelEvent: jest.fn((req: any, reply: any) => reply.send({ success: true, eventId: req.params.eventId }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as cancellationController from '../../../src/controllers/cancellation.controller';

describe('Cancellation Routes', () => {
  let app: FastifyInstance;
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    app = Fastify();
    await app.register(cancellationRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register POST /events/:eventId/cancel route', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/cancel');
    });
  });

  describe('POST /events/:eventId/cancel', () => {
    it('should call cancelEvent controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/cancel`
      });

      expect(response.statusCode).toBe(200);
      expect(cancellationController.cancelEvent).toHaveBeenCalled();
    });

    it('should apply authentication middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/cancel`
      });

      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/cancel`
      });

      expect(tenantHook).toHaveBeenCalled();
    });

    it('should accept cancellation reason in body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${validUuid}/cancel`,
        payload: { reason: 'Weather conditions' }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept any eventId (no schema validation)', async () => {
      // No schema validation means any string is accepted
      const response = await app.inject({
        method: 'POST',
        url: '/events/any-string/cancel'
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
