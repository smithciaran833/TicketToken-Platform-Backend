import { Knex } from 'knex';
import { NotFoundError, ValidationError, ForbiddenError } from '../types';
import { VenueServiceClient } from './venue-service.client';
import { EventSecurityValidator, EventValidationOptions } from '../validations/event-security';
import { isAdmin } from '../middleware/auth';
import { EventAuditLogger } from '../utils/audit-logger';
import { publishSearchSync } from '@tickettoken/shared';
import { pino } from 'pino';
import Redis from 'ioredis';
import { validateTimezoneOrThrow } from '../utils/timezone-validator';
import { EventBlockchainService, EventBlockchainData } from './blockchain.service';
import { validateTransition, EventState, EventTransition } from './event-state-machine';
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

/**
 * CRITICAL FIX SL6: Conflict error for optimistic locking failures
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Custom error for event state conflicts
 */
export class EventStateError extends Error {
  constructor(message: string, public currentState: string, public targetState?: string) {
    super(message);
    this.name = 'EventStateError';
  }
}

export class EventService {
  private eventModel: EventModel;
  private scheduleModel: EventScheduleModel;
  private capacityModel: EventCapacityModel;
  private metadataModel: EventMetadataModel;
  private securityValidator: EventSecurityValidator;
  private auditLogger: EventAuditLogger;
  private blockchainService: EventBlockchainService;

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
    this.blockchainService = new EventBlockchainService();
  }

  /**
   * Generate a numeric event ID for blockchain from UUID
   * Uses first 8 chars of UUID converted to number
   */
  private generateBlockchainEventId(uuid: string): number {
    const hex = uuid.replace(/-/g, '').substring(0, 8);
    return parseInt(hex, 16);
  }

  async createEvent(data: any, authToken: string, userId: string, tenantId: string, requestInfo?: any): Promise<any> {
    const hasAccess = await this.venueServiceClient.validateVenueAccess(data.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'Invalid venue or no access' }]);
    }

    const venueDetails = await this.venueServiceClient.getVenue(data.venue_id, authToken);

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
      created_by: userId,
      artist_wallet: data.artist_wallet,
      artist_percentage: data.artist_percentage || 0,
      venue_percentage: data.venue_percentage || 0,
      blockchain_status: 'pending'
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

    // Blockchain integration
    if (result.schedule?.starts_at && data.artist_wallet) {
      try {
        const blockchainEventId = this.generateBlockchainEventId(result.event.id!);

        const blockchainData: EventBlockchainData = {
          eventId: blockchainEventId,
          venueId: data.venue_id,
          name: data.name,
          ticketPrice: 0,
          totalTickets: capacityData?.total_capacity || 0,
          startTime: new Date(result.schedule.starts_at),
          endTime: new Date(result.schedule.ends_at || result.schedule.starts_at),
          refundWindow: data.cancellation_deadline_hours || 24,
          metadataUri: data.banner_image_url || data.image_url || '',
          description: data.short_description || data.description || '',
          transferable: true,
          resaleable: data.resaleable !== false,
          merkleTree: process.env.DEFAULT_MERKLE_TREE || '',
          artistWallet: data.artist_wallet,
          artistPercentage: data.artist_percentage || 0,
          venuePercentage: data.venue_percentage || 0,
        };

        const blockchainResult = await this.blockchainService.createEventOnChain(blockchainData);

        await this.db('events')
          .where({ id: result.event.id, tenant_id: tenantId })
          .update({
            event_pda: blockchainResult.eventPda,
            blockchain_status: 'synced',
            updated_at: new Date()
          });

        result.event.event_pda = blockchainResult.eventPda;
        result.event.blockchain_status = 'synced';

        logger.info({
          msg: `Event ${result.event.id} synced to blockchain`,
          eventId: result.event.id,
          blockchainEventId,
          eventPda: blockchainResult.eventPda,
          signature: blockchainResult.signature,
        });
      } catch (blockchainError) {
        logger.error({
          msg: `Failed to sync event ${result.event.id} to blockchain`,
          eventId: result.event.id,
          error: blockchainError instanceof Error ? blockchainError.message : String(blockchainError),
        });

        await this.db('events')
          .where({ id: result.event.id, tenant_id: tenantId })
          .update({
            blockchain_status: 'failed',
            updated_at: new Date()
          });

        result.event.blockchain_status = 'failed';
      }
    }

    if (this.redis) {
      try {
        await this.redis.del(`venue:events:${data.venue_id}`);
        const { cacheInvalidationTotal } = await import('../utils/metrics');
        cacheInvalidationTotal.inc({ status: 'success', cache_key: 'venue_events' });
      } catch (err) {
        logger.error({ error: err }, 'Redis cache clear failed for venue events');
      }
    }

    logger.info({
      eventId: result.event.id,
      venueId: result.event.venue_id,
      tenantId
    }, 'Event created');

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

  async updateEvent(
    eventId: string, 
    data: any, 
    authToken: string, 
    userId: string, 
    tenantId: string, 
    requestInfo?: any,
    user?: any  // User object with role for admin check
  ): Promise<any> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    // CRITICAL FIX: Admin bypass for ownership check
    const userIsAdmin = isAdmin(user);
    if (event.created_by !== userId && !userIsAdmin) {
      throw new ForbiddenError('You do not have permission to update this event');
    }

    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Get sold ticket count for validation
    const soldTicketCount = await this.getSoldTicketCount(eventId, tenantId);

    // Get schedule for validation context
    const schedule = await this.db('event_schedules')
      .where({ event_id: eventId, tenant_id: tenantId })
      .first();

    // CRITICAL FIX: Pass sold ticket count and admin status to validator
    const validationOptions: EventValidationOptions = {
      event: {
        id: eventId,
        status: event.status,
        starts_at: schedule?.starts_at
      },
      soldTicketCount,
      isAdmin: userIsAdmin,
      forceAdminOverride: data.forceAdminOverride === true && userIsAdmin
    };

    await this.securityValidator.validateEventModification(eventId, data, validationOptions);

    // CRITICAL FIX: State validation for status changes
    if (data.status && data.status !== event.status) {
      await this.validateStateTransition(event.status, data.status, eventId, tenantId);
    }

    // CRITICAL FIX SL6: Optimistic locking - check version if provided
    const expectedVersion = data.version ?? data.expectedVersion;

    const result = await this.db.transaction(async (trx) => {
      const updateData: any = {
        ...data,
        updated_by: userId,
        updated_at: new Date()
      };

      // CRITICAL FIX SL6: Increment version for optimistic locking
      updateData.version = trx.raw('COALESCE(version, 0) + 1');

      if (data.image_url) updateData.banner_image_url = data.image_url;
      if (data.category) updateData.primary_category_id = data.category;

      // Remove version from updateData to prevent overwriting the raw expression
      delete updateData.expectedVersion;

      // CRITICAL FIX SL6: Optimistic locking - include version in WHERE clause
      let updateQuery = trx('events')
        .where({ id: eventId, tenant_id: tenantId });

      // If client provided expected version, check it
      if (expectedVersion !== undefined && expectedVersion !== null) {
        updateQuery = updateQuery.where('version', expectedVersion);
      }

      const updatedRows = await updateQuery
        .update(updateData)
        .returning('*');

      // CRITICAL FIX SL6: Check if update succeeded (version matched)
      if (updatedRows.length === 0) {
        // Version mismatch - concurrent modification detected
        throw new ConflictError(
          `Event ${eventId} was modified by another process. ` +
          `Expected version ${expectedVersion}, but current version has changed. ` +
          `Please refresh and try again.`
        );
      }

      await this.auditLogger.logEventUpdate(userId, eventId, data, {
        previousData: event,
        ...requestInfo
      });

      return updatedRows[0];
    });

    if (this.redis) {
      try {
        await this.redis.del(`venue:events:${event.venue_id}`);
        await this.redis.del(`event:${eventId}`);
      } catch (err) {
        logger.error({ error: err }, 'Redis cache clear failed for event update');
      }
    }

    logger.info({ eventId, tenantId }, 'Event updated');

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

  async deleteEvent(
    eventId: string, 
    authToken: string, 
    userId: string, 
    tenantId: string, 
    requestInfo?: any,
    user?: any,  // User object with role for admin check
    forceDelete?: boolean  // Admin override flag
  ): Promise<void> {
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    // CRITICAL FIX: Admin bypass for ownership check
    const userIsAdmin = isAdmin(user);
    if (event.created_by !== userId && !userIsAdmin) {
      throw new ForbiddenError('You do not have permission to delete this event');
    }

    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Get sold ticket count for validation
    const soldTicketCount = await this.getSoldTicketCount(eventId, tenantId);

    // Get schedule for validation context
    const schedule = await this.db('event_schedules')
      .where({ event_id: eventId, tenant_id: tenantId })
      .first();

    // CRITICAL FIX: Pass sold ticket count and admin status to validator
    const validationOptions: EventValidationOptions = {
      event: {
        id: eventId,
        status: event.status,
        starts_at: schedule?.starts_at
      },
      soldTicketCount,
      isAdmin: userIsAdmin,
      forceAdminOverride: forceDelete === true && userIsAdmin
    };

    await this.securityValidator.validateEventDeletion(eventId, validationOptions);

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
        logger.error({ error: err }, 'Redis cache clear failed for event deletion');
      }
    }

    logger.info({ eventId, tenantId }, 'Event deleted');

    await publishSearchSync('event.deleted', { id: eventId });
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

  /**
   * Get the total count of sold tickets for an event
   * CRITICAL: Used to validate event modification/deletion rules
   */
  private async getSoldTicketCount(eventId: string, tenantId: string): Promise<number> {
    try {
      // Get sold count from event_capacity table
      const capacities = await this.db('event_capacity')
        .where({ event_id: eventId, tenant_id: tenantId })
        .select('sold_count');

      const totalSold = capacities.reduce((sum: number, c: any) => sum + (c.sold_count || 0), 0);

      // Also check tickets table if it exists (in case sold_count isn't updated)
      try {
        const ticketCount = await this.db('tickets')
          .where({ event_id: eventId, tenant_id: tenantId })
          .whereIn('status', ['SOLD', 'USED', 'TRANSFERRED'])
          .count('* as count')
          .first();

        const ticketsSold = parseInt(ticketCount?.count as string) || 0;
        
        // Return the higher of the two counts to be safe
        return Math.max(totalSold, ticketsSold);
      } catch {
        // Tickets table might not exist in this service
        return totalSold;
      }
    } catch (error) {
      logger.warn({ eventId, tenantId, error }, 'Failed to get sold ticket count, defaulting to 0');
      return 0;
    }
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

  /**
   * CRITICAL FIX: Validate state transition using event-state-machine
   * 
   * Ensures only valid state transitions are allowed.
   * 
   * @param currentStatus - Current event status
   * @param targetStatus - Target event status
   * @param eventId - Event ID for logging
   * @param tenantId - Tenant ID
   * @throws EventStateError if transition is invalid
   */
  private async validateStateTransition(
    currentStatus: string,
    targetStatus: string,
    eventId: string,
    tenantId: string
  ): Promise<void> {
    // Map status changes to transitions
    // Using string type for flexibility - validated by state machine
    const transitionMap: Record<string, Record<string, string>> = {
      'DRAFT': {
        'REVIEW': 'SUBMIT_FOR_REVIEW',
        'PUBLISHED': 'PUBLISH',
      },
      'REVIEW': {
        'APPROVED': 'APPROVE',
        'DRAFT': 'REJECT',
      },
      'APPROVED': {
        'PUBLISHED': 'PUBLISH',
      },
      'PUBLISHED': {
        'ON_SALE': 'START_SALES',
        'CANCELLED': 'CANCEL',
        'POSTPONED': 'POSTPONE',
      },
      'ON_SALE': {
        'SOLD_OUT': 'SELL_OUT',
        'SALES_PAUSED': 'PAUSE_SALES',
        'IN_PROGRESS': 'START_EVENT',
        'CANCELLED': 'CANCEL',
        'POSTPONED': 'POSTPONE',
      },
      'SALES_PAUSED': {
        'ON_SALE': 'RESUME_SALES',
        'CANCELLED': 'CANCEL',
      },
      'SOLD_OUT': {
        'IN_PROGRESS': 'START_EVENT',
        'CANCELLED': 'CANCEL',
      },
      'IN_PROGRESS': {
        'COMPLETED': 'END_EVENT',
        'CANCELLED': 'CANCEL',
      },
      'POSTPONED': {
        'PUBLISHED': 'RESCHEDULE',
        'CANCELLED': 'CANCEL',
      },
    };

    // Check if transition is defined
    const allowedTransitions = transitionMap[currentStatus];
    if (!allowedTransitions) {
      throw new EventStateError(
        `Cannot transition from '${currentStatus}' - status is terminal or unknown`,
        currentStatus,
        targetStatus
      );
    }

    const transition = allowedTransitions[targetStatus];
    if (!transition) {
      const allowedTargets = Object.keys(allowedTransitions);
      throw new EventStateError(
        `Invalid status transition from '${currentStatus}' to '${targetStatus}'. ` +
        `Allowed transitions from '${currentStatus}': ${allowedTargets.join(', ')}`,
        currentStatus,
        targetStatus
      );
    }

    // Validate using the state machine
    const validation = validateTransition(currentStatus as EventState, transition as EventTransition);
    if (!validation.valid) {
      throw new EventStateError(
        validation.error || `Invalid transition: ${transition}`,
        currentStatus,
        targetStatus
      );
    }

    logger.info({
      eventId,
      tenantId,
      currentStatus,
      targetStatus,
      transition,
    }, 'Event state transition validated');
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
