import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import { ConsistencyService } from './consistency.service';

export class SyncService {
  private elasticsearch: Client;
  private logger: pino.Logger;
  private consistencyService: ConsistencyService;

  constructor({ elasticsearch, logger, consistencyService }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
    this.consistencyService = consistencyService;
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
    const operation = {
      entityType: 'venue',
      entityId: venue.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload: action !== 'deleted' ? {
        id: venue.id,
        name: venue.name,
        type: venue.type,
        capacity: venue.capacity,
        address: venue.address?.street || '',
        city: venue.address?.city || '',
        state: venue.address?.state || '',
        slug: venue.slug,
        is_active: venue.is_active,
        updated_at: new Date()
      } : {},
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Venue synced with consistency token', {
      venueId: venue.id,
      token: token.token
    });

    return token;
  }

  private async syncEvent(action: string, event: any, clientId?: string) {
    const operation = {
      entityType: 'event',
      entityId: event.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload: action !== 'deleted' ? {
        id: event.id,
        venue_id: event.venue_id,
        name: event.name || event.title,
        description: event.description,
        date: event.date || event.event_date,
        status: event.status,
        updated_at: new Date()
      } : {},
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Event synced with consistency token', {
      eventId: event.id,
      token: token.token
    });

    return token;
  }

  private async syncTicket(_action: string, ticket: any, clientId?: string) {
    // Update event with ticket availability
    if (ticket.event_id) {
      this.logger.info({ ticket }, 'Ticket update - refreshing event');

      // Trigger event re-index with high priority
      const operation = {
        entityType: 'event',
        entityId: ticket.event_id,
        operation: 'UPDATE' as const,
        payload: {
          tickets_available: ticket.available_quantity,
          updated_at: new Date()
        },
        priority: 8
      };

      const token = await this.consistencyService.indexWithConsistency(operation, clientId);
      return token;
    }
    
    // Return undefined if no event_id
    return undefined;
  }
}
