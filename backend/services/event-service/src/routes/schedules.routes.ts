import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as scheduleController from '../controllers/schedule.controller';

export default async function schedulesRoutes(app: FastifyInstance) {
  // Get all schedules for an event
  app.get('/events/:eventId/schedules', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.getSchedules as any);

  // Create a schedule for an event
  app.post('/events/:eventId/schedules', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.createSchedule as any);

  // Get upcoming schedules for an event
  app.get('/events/:eventId/schedules/upcoming', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.getUpcomingSchedules as any);

  // Get next schedule for an event
  app.get('/events/:eventId/schedules/next', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.getNextSchedule as any);

  // Get a specific schedule
  app.get('/events/:eventId/schedules/:scheduleId', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.getSchedule as any);

  // Update a schedule
  app.put('/events/:eventId/schedules/:scheduleId', {
    preHandler: [authenticateFastify, tenantHook]
  }, scheduleController.updateSchedule as any);
}
