import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import { ConsistencyService } from './consistency.service';
import { EventEnrichmentService } from './event-enrichment.service';
import { VenueEnrichmentService } from './venue-enrichment.service';
import { TicketEnrichmentService } from './ticket-enrichment.service';
import { MarketplaceEnrichmentService } from './marketplace-enrichment.service';

export class SyncService {
  private elasticsearch: Client;
  private logger: pino.Logger;
  private consistencyService: ConsistencyService;
  private eventEnrichmentService: EventEnrichmentService;
  private venueEnrichmentService: VenueEnrichmentService;
  private ticketEnrichmentService: TicketEnrichmentService;
  private marketplaceEnrichmentService: MarketplaceEnrichmentService;

  constructor({ 
    elasticsearch, 
    logger, 
    consistencyService,
    eventEnrichmentService,
    venueEnrichmentService,
    ticketEnrichmentService,
    marketplaceEnrichmentService
  }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
    this.consistencyService = consistencyService;
    this.eventEnrichmentService = eventEnrichmentService;
    this.venueEnrichmentService = venueEnrichmentService;
    this.ticketEnrichmentService = ticketEnrichmentService;
    this.marketplaceEnrichmentService = marketplaceEnrichmentService;
  }

  async processMessage(routingKey: string, content: any, clientId?: string) {
    this.logger.info({ routingKey, content }, 'Processing sync message');

    const [entity, action] = routingKey.split('.');

    try {
      let consistencyToken;

      switch (entity) {
        case 'venue':
          consistencyToken = await this.syncVenue(action, content, clientId);
          break;
        case 'event':
          consistencyToken = await this.syncEvent(action, content, clientId);
          break;
        case 'ticket':
          consistencyToken = await this.syncTicket(action, content, clientId);
          break;
      }

      return consistencyToken;
    } catch (error) {
      this.logger.error({ error, routingKey, content }, 'Sync failed');
      throw error;
    }
  }

  private async syncVenue(action: string, venue: any, clientId?: string) {
    let payload = {};

    // For non-delete actions, enrich the venue with full data
    if (action !== 'deleted') {
      try {
        this.logger.info({ venueId: venue.id }, 'Enriching venue before indexing');
        const enrichedVenue = await this.venueEnrichmentService.enrich(venue.id);
        payload = enrichedVenue;
      } catch (error) {
        this.logger.error({ error, venueId: venue.id }, 'Failed to enrich venue, using basic data');
        // Fallback to basic data if enrichment fails
        payload = {
          venueId: venue.id,
          name: venue.name,
          type: venue.type,
          capacity: venue.capacity,
          address: {
            street: venue.address?.street || '',
            city: venue.address?.city || '',
            state: venue.address?.state || '',
            country: venue.address?.country || 'USA'
          },
          metadata: {
            createdAt: venue.created_at,
            updatedAt: new Date()
          },
          status: venue.is_active ? 'active' : 'inactive'
        };
      }
    }

    const operation = {
      entityType: 'venue',
      entityId: venue.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload,
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Venue synced with consistency token', {
      venueId: venue.id,
      token: token.token,
      enriched: action !== 'deleted'
    });

    return token;
  }

  private async syncEvent(action: string, event: any, clientId?: string) {
    let payload = {};

    // For non-delete actions, enrich the event with full data
    if (action !== 'deleted') {
      try {
        this.logger.info({ eventId: event.id }, 'Enriching event before indexing');
        const enrichedEvent = await this.eventEnrichmentService.enrich(event.id);
        payload = enrichedEvent;
      } catch (error) {
        this.logger.error({ error, eventId: event.id }, 'Failed to enrich event, using basic data');
        // Fallback to basic data if enrichment fails
        payload = {
          eventId: event.id,
          title: event.name || event.title,
          description: event.description,
          category: event.category || 'other',
          eventDate: event.date || event.event_date,
          status: event.status || 'active',
          venue: {
            venueId: event.venue_id,
            name: '',
            city: '',
            state: '',
            country: 'USA'
          },
          metadata: {
            createdAt: event.created_at,
            updatedAt: new Date()
          }
        };
      }
    }

    const operation = {
      entityType: 'event',
      entityId: event.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload,
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Event synced with consistency token', {
      eventId: event.id,
      token: token.token,
      enriched: action !== 'deleted'
    });

    return token;
  }

  private async syncTicket(action: string, ticket: any, clientId?: string) {
    let payload = {};

    // For non-delete actions, enrich the ticket with full data
    if (action !== 'deleted') {
      try {
        this.logger.info({ ticketId: ticket.id }, 'Enriching ticket before indexing');
        const enrichedTicket = await this.ticketEnrichmentService.enrich(ticket.id);
        payload = enrichedTicket;
      } catch (error) {
        this.logger.error({ error, ticketId: ticket.id }, 'Failed to enrich ticket, using basic data');
        // Fallback to basic data if enrichment fails
        payload = {
          ticketId: ticket.id,
          eventId: ticket.event_id,
          venueId: ticket.venue_id,
          userId: ticket.user_id || ticket.owner_id,
          ticketNumber: ticket.ticket_number || ticket.id,
          ticketType: ticket.ticket_type || 'standard',
          section: ticket.section,
          row: ticket.row,
          seat: ticket.seat,
          pricing: {
            originalPrice: ticket.price,
            purchasePrice: ticket.price,
            currentValue: ticket.price,
            currency: ticket.currency || 'USD'
          },
          status: ticket.status || 'active',
          isTransferable: ticket.is_transferable ?? true,
          isResellable: ticket.is_resellable ?? true,
          isRefundable: ticket.is_refundable ?? false,
          purchaseDate: ticket.purchase_date || ticket.created_at,
          createdAt: ticket.created_at,
          updatedAt: new Date()
        };
      }
    }

    const operation = {
      entityType: 'ticket',
      entityId: ticket.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload,
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Ticket synced with consistency token', {
      ticketId: ticket.id,
      token: token.token,
      enriched: action !== 'deleted'
    });

    // Also trigger event re-index when tickets change to update availability
    if (ticket.event_id && action !== 'deleted') {
      try {
        this.logger.info({ eventId: ticket.event_id }, 'Ticket update - refreshing event');
        const enrichedEvent = await this.eventEnrichmentService.enrich(ticket.event_id);
        
        const eventOperation = {
          entityType: 'event',
          entityId: ticket.event_id,
          operation: 'UPDATE' as const,
          payload: enrichedEvent,
          priority: 8
        };

        await this.consistencyService.indexWithConsistency(eventOperation, clientId);
      } catch (error) {
        this.logger.warn({ error, eventId: ticket.event_id }, 'Failed to refresh event after ticket update');
      }
    }

    return token;
  }
}
