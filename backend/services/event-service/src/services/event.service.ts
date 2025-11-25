import { Knex } from 'knex';
import { NotFoundError, ValidationError, ForbiddenError } from '../types';
import { VenueServiceClient } from './venue-service.client';
import { EventSecurityValidator } from '../validations/event-security';
import { EventAuditLogger } from '../utils/audit-logger';
import { publishSearchSync } from '@tickettoken/shared';
import { pino } from 'pino';
import Redis from 'ioredis';
import { validateTimezoneOrThrow } from '../utils/timezone-validator';
import {
  EventModel,
  IEvent,
  EventScheduleModel,
  IEventSchedule,
  EventCapacityModel,
  IEventCapacity,
  EventMetadataModel,
  IEventMetadata
} from '../models';

const logger = pino({ name: 'event-service' });

export class EventService {
  private eventModel: EventModel;
  private scheduleModel: EventScheduleModel;
  private capacityModel: EventCapacityModel;
  private metadataModel: EventMetadataModel;
  private securityValidator: EventSecurityValidator;
  private auditLogger: EventAuditLogger;

  constructor(
    private db: Knex,
    private venueServiceClient: VenueServiceClient,
    private redis?: Redis
  ) {
    this.eventModel = new EventModel(db);
    this.scheduleModel = new EventScheduleModel(db);
    this.capacityModel = new EventCapacityModel(db);
    this.metadataModel = new EventMetadataModel(db);
    this.securityValidator = new EventSecurityValidator();
    this.auditLogger = new EventAuditLogger(db);
  }

  async createEvent(data: any, authToken: string, userId: string, tenantId: string, requestInfo?: any): Promise<any> {
    const hasAccess = await this.venueServiceClient.validateVenueAccess(data.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'Invalid venue or no access' }]);
    }

    const venueDetails = await this.venueServiceClient.getVenue(data.venue_id, authToken);

    // Determine and validate timezone
    const timezone = data.timezone || venueDetails?.timezone || 'UTC';
    try {
      validateTimezoneOrThrow(timezone);
    } catch (error) {
      throw new ValidationError([{
        field: 'timezone',
        message: error instanceof Error ? error.message : 'Invalid timezone'
      }]);
    }

    const scheduleData: Partial<IEventSchedule> = {
      starts_at: data.event_date || data.starts_at,
      ends_at: data.ends_at || data.event_date,
      doors_open_at: data.doors_open,
      timezone,
      status: 'SCHEDULED'
    };

    if (scheduleData.starts_at) {
      await this.securityValidator.validateEventDate(new Date(scheduleData.starts_at));
    }

    const capacityData: Partial<IEventCapacity> | null = data.capacity ? {
      section_name: 'General Admission',
      total_capacity: data.capacity,
      available_capacity: data.capacity,
      sold_count: 0,
      pending_count: 0,
      is_active: true,
      is_visible: true
    } : null;

    if (capacityData && venueDetails) {
      await this.securityValidator.validateVenueCapacity(
        capacityData.total_capacity!,
        venueDetails.max_capacity
      );
    }

    if (data.status) {
      const validStatuses = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'
      ];
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError([{
          field: 'status',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        }]);
      }
    }

    const eventData: Partial<IEvent> = {
      tenant_id: tenantId,
      venue_id: data.venue_id,
      name: data.name,
      description: data.description,
      short_description: data.short_description,
      status: data.status || 'DRAFT',
      event_type: data.event_type || 'single',
      primary_category_id: data.category || data.primary_category_id,
      banner_image_url: data.image_url || data.banner_image_url,
      thumbnail_image_url: data.thumbnail_image_url,
      video_url: data.video_url,
      tags: data.tags,
      visibility: data.visibility,
      is_featured: data.is_featured,
      age_restriction: data.age_restriction,
      is_virtual: data.is_virtual,
      is_hybrid: data.is_hybrid,
      dress_code: data.dress_code,
      cancellation_policy: data.cancellation_policy,
      refund_policy: data.refund_policy,
      cancellation_deadline_hours: data.cancellation_deadline_hours,
      special_requirements: data.special_requirements,
      accessibility_info: data.accessibility_info,
      streaming_platform: data.streaming_platform,
      streaming_config: data.streaming_config,
      virtual_event_url: data.virtual_event_url,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
      external_id: data.external_id,
      metadata: data.metadata,
      created_by: userId
    };

    if (scheduleData.starts_at) {
      const duplicateCheck = await this.checkForDuplicateEvent(
        data.venue_id,
        new Date(scheduleData.starts_at),
        data.name,
        tenantId
      );

      if (duplicateCheck) {
        throw new ValidationError([{
          field: 'name',
          message: 'An event with this name already exists at this venue on this date'
        }]);
      }
    }

    const result = await this.db.transaction(async (trx) => {
      const eventModelTrx = new EventModel(trx);
      const scheduleModelTrx = new EventScheduleModel(trx);
      const capacityModelTrx = new EventCapacityModel(trx);
      const metadataModelTrx = new EventMetadataModel(trx);

      const newEvent = await eventModelTrx.createWithDefaults(eventData);

      const metadata = await metadataModelTrx.create({
        event_id: newEvent.id!,
        performers: data.performers || [],
        headliner: data.headliner,
        supporting_acts: data.supporting_acts || [],
        custom_fields: data.custom_metadata || {}
      });

      let schedule = null;
      if (scheduleData.starts_at) {
        schedule = await scheduleModelTrx.create({
          tenant_id: tenantId,
          event_id: newEvent.id!,
          ...scheduleData
        });
      }

      let capacity = null;
      if (capacityData) {
        capacity = await capacityModelTrx.create({
          tenant_id: tenantId,
          event_id: newEvent.id!,
          schedule_id: schedule?.id,
          ...capacityData
        });
      }

      await this.auditLogger.logEventAction('create', newEvent.id!, userId, {
        eventData: data,
        ...requestInfo
      });

      return { event: newEvent, schedule, capacity, metadata };
    });

    if (this.redis) {
      try {
        await this.redis.del(`venue:events:${data.venue_id}`);
      } catch (err) {
        logger.warn('Redis cache clear failed, continuing...');
      }
    }

    logger.info({
      eventId: result.event.id,
      venueId: result.event.venue_id,
      tenantId
    }, 'Event created');

    // SEARCH SYNC: Publish event creation
    await publishSearchSync('event.created', {
      id: result.event.id,
      name: result.event.name,
      description: result.event.short_description || result.event.description,
      venueId: result.event.venue_id,
      status: result.event.status,
      eventType: result.event.event_type,
      startsAt: result.schedule?.starts_at,
      capacity: result.capacity?.total_capacity,
      tags: result.event.tags,
      isFeatured: result.event.is_featured,
    });

    return this.enrichEventWithRelations(result.event, result.schedule, result.capacity);
  }

  async getEvent(eventId: string, tenantId: string): Promise<any> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    const schedules = await this.db('event_schedules')
      .where({ event_id: eventId, tenant_id: tenantId })
      .select('*');

    const capacities = await this.db('event_capacity')
      .where({ event_id: eventId, tenant_id: tenantId })
      .select('*');

    const totalCapacity = capacities.reduce((sum: number, c: any) => sum + (c.total_capacity || 0), 0);
    const availableCapacity = capacities.reduce((sum: number, c: any) => sum + (c.available_capacity || 0), 0);

    return this.enrichEventWithRelations(
      event,
      schedules[0],
      { total_capacity: totalCapacity, available_capacity: availableCapacity }
    );
  }

  async listEvents(tenantId: string, options: any = {}): Promise<any> {
    const { status, limit = 20, offset = 0 } = options;

    let query = this.db('events')
      .where({ tenant_id: tenantId })
      .whereNull('deleted_at');

    if (status) {
      query = query.where({ status });
    }

    const events = await query
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'desc')
      .select('*');

    const total = await this.db('events')
      .where({ tenant_id: tenantId })
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return {
      events,
      pagination: {
        limit,
        offset,
        total: parseInt(total?.count as string) || 0
      }
    };
  }

  async updateEvent(eventId: string, data: any, authToken: string, userId: string, tenantId: string, requestInfo?: any): Promise<any> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    if (event.created_by !== userId) {
      throw new ForbiddenError('You do not have permission to update this event');
    }

    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    await this.securityValidator.validateEventModification(eventId, data);

    const result = await this.db.transaction(async (trx) => {
      const updateData: any = {
        ...data,
        updated_by: userId,
        updated_at: new Date()
      };

      if (data.image_url) updateData.banner_image_url = data.image_url;
      if (data.category) updateData.primary_category_id = data.category;

      const [updatedEvent] = await trx('events')
        .where({ id: eventId, tenant_id: tenantId })
        .update(updateData)
        .returning('*');

      await this.auditLogger.logEventUpdate(userId, eventId, data, {
        previousData: event,
        ...requestInfo
      });

      return updatedEvent;
    });

    if (this.redis) {
      try {
        await this.redis.del(`venue:events:${event.venue_id}`);
        await this.redis.del(`event:${eventId}`);
      } catch (err) {
        logger.warn('Redis cache clear failed, continuing...');
      }
    }

    logger.info({ eventId, tenantId }, 'Event updated');

    // SEARCH SYNC: Publish event update
    await publishSearchSync('event.updated', {
      id: eventId,
      changes: {
        name: data.name,
        description: data.short_description || data.description,
        status: data.status,
        tags: data.tags,
        isFeatured: data.is_featured,
      }
    });

    return this.getEvent(eventId, tenantId);
  }

  async deleteEvent(eventId: string, authToken: string, userId: string, tenantId: string, requestInfo?: any): Promise<void> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    if (event.created_by !== userId) {
      throw new ForbiddenError('You do not have permission to delete this event');
    }

    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    await this.securityValidator.validateEventDeletion(eventId);

    await this.db.transaction(async (trx) => {
      await trx('events')
        .where({ id: eventId, tenant_id: tenantId })
        .update({
          deleted_at: new Date(),
          status: 'CANCELLED'
        });

      await this.auditLogger.logEventDeletion(userId, eventId, {
        event,
        ...requestInfo
      });
    });

    if (this.redis) {
      try {
        await this.redis.del(`venue:events:${event.venue_id}`);
        await this.redis.del(`event:${eventId}`);
      } catch (err) {
        logger.warn('Redis cache clear failed, continuing...');
      }
    }

    logger.info({ eventId, tenantId }, 'Event deleted');

    // SEARCH SYNC: Publish event deletion
    await publishSearchSync('event.deleted', {
      id: eventId,
    });
  }

  async publishEvent(eventId: string, userId: string, tenantId: string): Promise<any> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .update({
        status: 'PUBLISHED',
        updated_by: userId,
        updated_at: new Date()
      });

    logger.info({ eventId, tenantId }, 'Event published');

    // SEARCH SYNC: Update status to published
    await publishSearchSync('event.updated', {
      id: eventId,
      changes: { status: 'PUBLISHED' }
    });

    return this.getEvent(eventId, tenantId);
  }

  async getVenueEvents(venueId: string, tenantId: string): Promise<any[]> {
    const events = await this.db('events')
      .where({ venue_id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .select('*');

    return events;
  }

  private enrichEventWithRelations(event: IEvent, schedule?: IEventSchedule | null, capacity?: any): any {
    return {
      ...event,
      event_date: schedule?.starts_at,
      doors_open: schedule?.doors_open_at,
      capacity: capacity?.total_capacity,
      available_capacity: capacity?.available_capacity,
      schedule,
      capacity_info: capacity
    };
  }

  private async checkForDuplicateEvent(
    venueId: string,
    eventDate: Date,
    eventName: string,
    tenantId: string,
    excludeEventId?: string
  ): Promise<boolean> {
    let query = this.db('events')
      .where({ venue_id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .where('name', 'ilike', eventName);

    if (excludeEventId) {
      query = query.whereNot('id', excludeEventId);
    }

    const events = await query;

    for (const event of events) {
      const schedules = await this.db('event_schedules')
        .where({ event_id: event.id, tenant_id: tenantId })
        .select('*');

      const hasMatchingDate = schedules.some((s: any) => {
        const scheduleDate = new Date(s.starts_at);
        return scheduleDate.toDateString() === eventDate.toDateString();
      });

      if (hasMatchingDate) {
        return true;
      }
    }

    return false;
  }
}
