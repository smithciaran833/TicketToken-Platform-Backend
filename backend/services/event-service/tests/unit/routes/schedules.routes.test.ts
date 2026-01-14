/**
 * Unit tests for schedules.routes.ts
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import schedulesRoutes from '../../../src/routes/schedules.routes';

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

jest.mock('../../../src/controllers/schedule.controller', () => ({
  getSchedules: jest.fn((req: any, reply: any) => reply.send({ schedules: [] })),
  createSchedule: jest.fn((req: any, reply: any) => reply.status(201).send({ id: 'sched-1' })),
  getUpcomingSchedules: jest.fn((req: any, reply: any) => reply.send({ schedules: [] })),
  getNextSchedule: jest.fn((req: any, reply: any) => reply.send({ schedule: null })),
  getSchedule: jest.fn((req: any, reply: any) => reply.send({ id: req.params.scheduleId })),
  updateSchedule: jest.fn((req: any, reply: any) => reply.send({ id: req.params.scheduleId }))
}));

import { authenticateFastify } from '../../../src/middleware/auth';
import { tenantHook } from '../../../src/middleware/tenant';
import * as scheduleController from '../../../src/controllers/schedule.controller';

describe('Schedules Routes', () => {
  let app: FastifyInstance;
  const eventId = '123e4567-e89b-12d3-a456-426614174000';
  const scheduleId = '123e4567-e89b-12d3-a456-426614174001';

  beforeEach(async () => {
    app = Fastify();
    await app.register(schedulesRoutes);
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Route Registration', () => {
    it('should register GET /events/:eventId/schedules', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules');
    });

    it('should register POST /events/:eventId/schedules', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules');
    });

    it('should register GET /events/:eventId/schedules/upcoming', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules/upcoming');
    });

    it('should register GET /events/:eventId/schedules/next', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules/next');
    });

    it('should register GET /events/:eventId/schedules/:scheduleId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules/:scheduleId');
    });

    it('should register PUT /events/:eventId/schedules/:scheduleId', () => {
      const routes = app.printRoutes();
      expect(routes).toContain('/events/:eventId/schedules/:scheduleId');
    });
  });

  describe('GET /events/:eventId/schedules', () => {
    it('should call getSchedules controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/schedules`
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleController.getSchedules).toHaveBeenCalled();
    });

    it('should apply auth middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/schedules` });
      expect(authenticateFastify).toHaveBeenCalled();
    });

    it('should apply tenant middleware', async () => {
      await app.inject({ method: 'GET', url: `/events/${eventId}/schedules` });
      expect(tenantHook).toHaveBeenCalled();
    });
  });

  describe('POST /events/:eventId/schedules', () => {
    it('should call createSchedule controller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/events/${eventId}/schedules`,
        payload: { start_time: '2026-06-15T19:00:00Z' }
      });

      expect(response.statusCode).toBe(201);
      expect(scheduleController.createSchedule).toHaveBeenCalled();
    });
  });

  describe('GET /events/:eventId/schedules/upcoming', () => {
    it('should call getUpcomingSchedules controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/schedules/upcoming`
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleController.getUpcomingSchedules).toHaveBeenCalled();
    });
  });

  describe('GET /events/:eventId/schedules/next', () => {
    it('should call getNextSchedule controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/schedules/next`
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleController.getNextSchedule).toHaveBeenCalled();
    });
  });

  describe('GET /events/:eventId/schedules/:scheduleId', () => {
    it('should call getSchedule controller', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/events/${eventId}/schedules/${scheduleId}`
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleController.getSchedule).toHaveBeenCalled();
    });
  });

  describe('PUT /events/:eventId/schedules/:scheduleId', () => {
    it('should call updateSchedule controller', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/events/${eventId}/schedules/${scheduleId}`,
        payload: { status: 'CANCELLED' }
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleController.updateSchedule).toHaveBeenCalled();
    });
  });
});
