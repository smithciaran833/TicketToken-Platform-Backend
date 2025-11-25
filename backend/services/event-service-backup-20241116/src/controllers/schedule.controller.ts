import { AuthenticatedHandler } from '../types';
import { EventScheduleModel, IEventSchedule } from '../models';
import Joi from 'joi';

const createScheduleSchema = Joi.object({
  starts_at: Joi.date().required(),
  ends_at: Joi.date().required(),
  doors_open_at: Joi.date().optional(),
  timezone: Joi.string().required(),
  is_recurring: Joi.boolean().default(false),
  recurrence_rule: Joi.string().optional(),
  recurrence_end_date: Joi.date().optional(),
  occurrence_number: Joi.number().integer().optional(),
  status: Joi.string().valid('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED').optional(),
  capacity_override: Joi.number().integer().min(0).optional(),
  check_in_opens_at: Joi.date().optional(),
  check_in_closes_at: Joi.date().optional(),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional()
});

export const getSchedules: AuthenticatedHandler = async (request, reply) => {
  const { eventId } = request.params as { eventId: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService } = request.container.cradle;

  try {
    // Verify event exists and user has access
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedules = await scheduleModel.findByEventId(eventId, tenantId);

    return reply.send({
      success: true,
      data: {
        event_id: eventId,
        schedules
      }
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting schedules:', error);
    throw error;
  }
};

export const createSchedule: AuthenticatedHandler = async (request, reply) => {
  const { eventId } = request.params as { eventId: string };
  const tenantId = (request as any).tenantId;
  const { error, value } = createScheduleSchema.validate(request.body);

  if (error) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details
    });
  }

  const { db, eventService } = request.container.cradle;

  try {
    // Verify event exists and user has access
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedule = await scheduleModel.create({
      tenant_id: tenantId,
      event_id: eventId,
      ...value
    });

    return reply.status(201).send({
      success: true,
      data: schedule
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error creating schedule:', error);
    throw error;
  }
};

export const getSchedule: AuthenticatedHandler = async (request, reply) => {
  const { eventId, scheduleId } = request.params as { eventId: string; scheduleId: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService } = request.container.cradle;

  try {
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedule = await scheduleModel.findById(scheduleId);

    if (!schedule || schedule.event_id !== eventId || schedule.tenant_id !== tenantId) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found'
      });
    }

    return reply.send({
      success: true,
      data: schedule
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting schedule:', error);
    throw error;
  }
};

export const updateSchedule: AuthenticatedHandler = async (request, reply) => {
  const { eventId, scheduleId } = request.params as { eventId: string; scheduleId: string };
  const tenantId = (request as any).tenantId;
  const updates = request.body as Partial<IEventSchedule>;

  const { db, eventService } = request.container.cradle;

  try {
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedule = await scheduleModel.findById(scheduleId);

    if (!schedule || schedule.event_id !== eventId || schedule.tenant_id !== tenantId) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found'
      });
    }

    const updated = await scheduleModel.updateWithTenant(scheduleId, tenantId, updates);

    return reply.send({
      success: true,
      data: updated
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error updating schedule:', error);
    throw error;
  }
};

export const getUpcomingSchedules: AuthenticatedHandler = async (request, reply) => {
  const { eventId } = request.params as { eventId: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService } = request.container.cradle;

  try {
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedules = await scheduleModel.findUpcomingSchedules(eventId, tenantId);

    return reply.send({
      success: true,
      data: {
        event_id: eventId,
        schedules
      }
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting upcoming schedules:', error);
    throw error;
  }
};

export const getNextSchedule: AuthenticatedHandler = async (request, reply) => {
  const { eventId } = request.params as { eventId: string };
  const tenantId = (request as any).tenantId;
  const { db, eventService } = request.container.cradle;

  try {
    await eventService.getEvent(eventId, tenantId);

    const scheduleModel = new EventScheduleModel(db);
    const schedule = await scheduleModel.getNextSchedule(eventId, tenantId);

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'No upcoming schedules found'
      });
    }

    return reply.send({
      success: true,
      data: schedule
    });
  } catch (error: any) {
    if (error.message === 'Event not found') {
      return reply.status(404).send({
        success: false,
        error: 'Event not found'
      });
    }
    request.log.error('Error getting next schedule:', error);
    throw error;
  }
};
