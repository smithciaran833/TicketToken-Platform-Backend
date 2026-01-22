import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import { idempotencyPreHandler } from '../middleware/idempotency.middleware';
import * as scheduleController from '../controllers/schedule.controller';

const eventIdParamSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const scheduleIdParamSchema = {
  type: 'object',
  required: ['eventId', 'scheduleId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    scheduleId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const createScheduleBodySchema = {
  type: 'object',
  required: ['startsAt', 'endsAt'],
  properties: {
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    doorsOpen: { type: 'string', format: 'date-time' },
    timezone: { type: 'string', maxLength: 50 },
    capacity: { type: 'integer', minimum: 0 },
    status: { 
      type: 'string',
      enum: ['scheduled', 'cancelled', 'completed']
    }
  },
  additionalProperties: false
};

const updateScheduleBodySchema = {
  type: 'object',
  properties: {
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    doorsOpen: { type: 'string', format: 'date-time' },
    timezone: { type: 'string', maxLength: 50 },
    capacity: { type: 'integer', minimum: 0 },
    status: { 
      type: 'string',
      enum: ['scheduled', 'cancelled', 'completed']
    }
  },
  additionalProperties: false
};

export default async function schedulesRoutes(app: FastifyInstance) {
  // Get all schedules for an event
  app.get('/events/:eventId/schedules', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, scheduleController.getSchedules as any);

  // Create a schedule for an event
  app.post('/events/:eventId/schedules', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      params: eventIdParamSchema,
      body: createScheduleBodySchema
    }
  }, scheduleController.createSchedule as any);

  // Get upcoming schedules for an event
  app.get('/events/:eventId/schedules/upcoming', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, scheduleController.getUpcomingSchedules as any);

  // Get next schedule for an event
  app.get('/events/:eventId/schedules/next', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, scheduleController.getNextSchedule as any);

  // Get a specific schedule
  app.get('/events/:eventId/schedules/:scheduleId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: scheduleIdParamSchema
    }
  }, scheduleController.getSchedule as any);

  // Update a schedule
  app.put('/events/:eventId/schedules/:scheduleId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: scheduleIdParamSchema,
      body: updateScheduleBodySchema
    }
  }, scheduleController.updateSchedule as any);
}
