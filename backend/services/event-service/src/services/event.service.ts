import { Knex } from 'knex';
import { Event, NotFoundError, ValidationError } from '../types';
import { VenueServiceClient } from './venue-service.client';
import { EventSecurityValidator } from '../validations/event-security';
import { EventAuditLogger } from '../utils/audit-logger';
import { pino } from 'pino';
import Redis from 'ioredis';

const logger = pino({ name: 'event-service' });

export class EventService {
  private securityValidator: EventSecurityValidator;
  private auditLogger: EventAuditLogger;

  constructor(
    private db: Knex,
    private venueServiceClient: VenueServiceClient,
    private redis: Redis
  ) {
    this.securityValidator = new EventSecurityValidator();
    this.auditLogger = new EventAuditLogger(db);
  }

  async createEvent(data: Partial<Event>, authToken: string, userId: string, requestInfo?: any): Promise<Event> {
    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(data.venue_id!, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'Invalid venue or no access' }]);
    }

    // Get venue details to validate capacity
    const venueDetails = await this.venueServiceClient.getVenue(data.venue_id!, authToken);
    
    // Security validations
    if (data.capacity && venueDetails) {
      await this.securityValidator.validateVenueCapacity(data.capacity, venueDetails.capacity);
    }
    
    // Validate event date
    if (data.event_date) {
      await this.securityValidator.validateEventDate(new Date(data.event_date));
    }

    // Check for duplicate events
    const duplicateCheck = await this.checkForDuplicateEvent(
      data.venue_id!,
      new Date(data.event_date!),
      data.name!
    );
    
    if (duplicateCheck) {
      throw new ValidationError([{ 
        field: 'name', 
        message: 'An event with this name already exists at this venue on this date' 
      }]);
    }

    // Use transaction for consistency
    const event = await this.db.transaction(async (trx) => {
      const [newEvent] = await trx('events')
        .insert({
          ...data,
          status: data.status || 'draft',
          created_by: userId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // Audit log
      await this.auditLogger.logEventAction('create', newEvent.id, userId, {
        eventData: data,
        ...requestInfo
      });

      return newEvent;
    });

    // Clear venue events cache
    await this.redis.del(`venue:events:${data.venue_id}`);

    logger.info({ eventId: event.id, venueId: event.venue_id }, 'Event created');
    return event;
  }

  async getEvent(eventId: string): Promise<Event> {
    const event = await this.db('events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    return event;
  }

  async updateEvent(eventId: string, data: Partial<Event>, authToken: string, userId: string, requestInfo?: any): Promise<Event> {
    const event = await this.getEvent(eventId);

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Check if event has already started
    if (new Date(event.event_date) < new Date()) {
      throw new ValidationError([{ field: 'event_date', message: 'Cannot modify past events' }]);
    }

    // Security validations
    await this.securityValidator.validateEventModification(eventId, data);

    if (data.capacity) {
      const venueDetails = await this.venueServiceClient.getVenue(event.venue_id, authToken);
      if (venueDetails) {
        await this.securityValidator.validateVenueCapacity(data.capacity, venueDetails.capacity);
      }
    }

    if (data.name || data.event_date) {
      const duplicateCheck = await this.checkForDuplicateEvent(
        event.venue_id,
        new Date(data.event_date || event.event_date),
        data.name || event.name,
        eventId
      );
      
      if (duplicateCheck) {
        throw new ValidationError([{ 
          field: 'name', 
          message: 'An event with this name already exists at this venue on this date' 
        }]);
      }
    }

    const updated = await this.db.transaction(async (trx) => {
      const [updatedEvent] = await trx('events')
        .where({ id: eventId })
        .update({
          ...data,
          updated_at: new Date(),
          updated_by: userId
        })
        .returning('*');

      // Audit log - using the correct method signature
      await this.auditLogger.logEventUpdate(userId, eventId, data, {
        previousData: event,
        ...requestInfo
      });

      return updatedEvent;
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event updated');
    return updated;
  }

  async deleteEvent(eventId: string, authToken: string, userId: string, requestInfo?: any): Promise<void> {
    const event = await this.getEvent(eventId);

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    // Validate deletion is allowed
    await this.securityValidator.validateEventDeletion(eventId);
    
    // Check if there are any tickets sold
    const ticketCount = await this.db('tickets')
      .where({ event_id: eventId })
      .count('id as count')
      .first();
    
    if (ticketCount && parseInt(ticketCount.count as string) > 0) {
      throw new ValidationError([{ 
        field: 'event', 
        message: 'Cannot delete event with sold tickets' 
      }]);
    }

    await this.db.transaction(async (trx) => {
      await trx('events')
        .where({ id: eventId })
        .update({
          deleted_at: new Date(),
          deleted_by: userId,
          status: 'cancelled'
        });

      // Audit log
      await this.auditLogger.logEventDeletion(userId, eventId, {
        event,
        ...requestInfo
      });
    });

    // Clear caches
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);

    logger.info({ eventId }, 'Event deleted');
  }

  async getVenueEvents(venueId: string, authToken: string): Promise<Event[]> {
    // Check cache first
    const cached = await this.redis.get(`venue:events:${venueId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Validate venue access
    const hasAccess = await this.venueServiceClient.validateVenueAccess(venueId, authToken);
    if (!hasAccess) {
      throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
    }

    const events = await this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('event_date', 'asc');

    // Cache for 5 minutes
    await this.redis.setex(`venue:events:${venueId}`, 300, JSON.stringify(events));

    return events;
  }

  // Helper method to check for duplicate events
  private async checkForDuplicateEvent(
    venueId: string, 
    eventDate: Date, 
    eventName: string, 
    excludeEventId?: string
  ): Promise<boolean> {
    const query = this.db('events')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .where('name', 'ilike', eventName)
      .whereRaw('DATE(event_date) = DATE(?)', [eventDate.toISOString()]);
    
    if (excludeEventId) {
      query.whereNot('id', excludeEventId);
    }
    
    const existing = await query.first();
    return !!existing;
  }
}
