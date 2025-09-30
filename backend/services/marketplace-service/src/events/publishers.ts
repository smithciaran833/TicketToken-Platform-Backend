import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { MarketplaceEvents, MarketplaceEvent } from './event-types';

class EventPublisher extends EventEmitter {
  async publishEvent<T>(type: MarketplaceEvents, payload: T, metadata?: Record<string, any>): Promise<void> {
    try {
      const event: MarketplaceEvent<T> = {
        type,
        timestamp: new Date(),
        payload,
        metadata
      };
      
      this.emit(type, event);
      logger.info(`Event published: ${type}`);
    } catch (error) {
      logger.error(`Error publishing event ${type}:`, error);
    }
  }
  
  async publishListingCreated(listing: any): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_CREATED, listing);
  }
  
  async publishListingSold(listing: any, buyerId: string): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_SOLD, { ...listing, buyer_id: buyerId });
  }
}

export const eventPublisher = new EventPublisher();
