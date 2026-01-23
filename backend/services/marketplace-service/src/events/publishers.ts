/**
 * Marketplace Event Publishers
 *
 * PHASE 1 FIX: Updated to use real RabbitMQ instead of in-process EventEmitter.
 * Events are now published to RabbitMQ for inter-service communication.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { MarketplaceEvents, MarketplaceEvent } from './event-types';
import { MarketplaceEventPublisher, rabbitmq } from '../config/rabbitmq';

/**
 * EventPublisher that publishes to both in-process (for local handlers)
 * and RabbitMQ (for inter-service communication)
 */
class EventPublisherClass extends EventEmitter {
  /**
   * Publish an event to both local handlers and RabbitMQ
   */
  async publishEvent<T>(
    type: MarketplaceEvents,
    payload: T,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const event: MarketplaceEvent<T> = {
        type,
        timestamp: new Date(),
        payload,
        metadata
      };

      // Emit locally for in-process handlers
      this.emit(type, event);

      // Also publish to RabbitMQ for inter-service communication
      await this.publishToRabbitMQ(type, payload, metadata);

      logger.info(`Event published: ${type}`, {
        hasRabbitMQ: rabbitmq.isConnected()
      });
    } catch (error) {
      logger.error(`Error publishing event ${type}:`, error);
    }
  }

  /**
   * Route event to appropriate RabbitMQ publisher
   */
  private async publishToRabbitMQ<T>(
    type: MarketplaceEvents,
    payload: T,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!rabbitmq.isConnected()) {
      logger.debug('RabbitMQ not connected, skipping remote publish');
      return;
    }

    const rabbitMetadata = {
      userId: metadata?.userId,
      tenantId: metadata?.tenantId
    };

    try {
      switch (type) {
        case MarketplaceEvents.LISTING_CREATED:
          await MarketplaceEventPublisher.listingCreated(payload, rabbitMetadata);
          break;

        case MarketplaceEvents.LISTING_UPDATED:
          await MarketplaceEventPublisher.listingUpdated(
            (payload as any).listing || payload,
            (payload as any).changes || {},
            rabbitMetadata
          );
          break;

        case MarketplaceEvents.LISTING_SOLD:
          await MarketplaceEventPublisher.listingSold(
            (payload as any).listing || payload,
            (payload as any).buyer_id || (payload as any).buyerId || '',
            (payload as any).transaction_id || (payload as any).transactionId || '',
            rabbitMetadata
          );
          break;

        case MarketplaceEvents.LISTING_CANCELLED:
          await MarketplaceEventPublisher.listingCancelled(
            payload,
            (payload as any).reason || 'User cancelled',
            rabbitMetadata
          );
          break;

        case MarketplaceEvents.LISTING_EXPIRED:
          await MarketplaceEventPublisher.listingExpired(payload, rabbitMetadata);
          break;

        case MarketplaceEvents.TRANSFER_INITIATED:
          await MarketplaceEventPublisher.transferInitiated(payload, rabbitMetadata);
          break;

        case MarketplaceEvents.TRANSFER_COMPLETED:
          await MarketplaceEventPublisher.transferComplete(payload, rabbitMetadata);
          break;

        case MarketplaceEvents.TRANSFER_FAILED:
          await MarketplaceEventPublisher.transferFailed(
            payload,
            (payload as any).error || 'Unknown error',
            rabbitMetadata
          );
          break;

        case MarketplaceEvents.DISPUTE_CREATED:
          await MarketplaceEventPublisher.disputeCreated(payload, rabbitMetadata);
          break;

        case MarketplaceEvents.DISPUTE_RESOLVED:
          await MarketplaceEventPublisher.disputeResolved(
            (payload as any).dispute || payload,
            (payload as any).resolution || {},
            rabbitMetadata
          );
          break;

        case MarketplaceEvents.PRICE_CHANGED:
          // Price changes don't need cross-service publishing
          break;

        default:
          logger.debug(`No RabbitMQ handler for event type: ${type}`);
      }
    } catch (error) {
      logger.error(`Failed to publish to RabbitMQ: ${type}`, { error });
      // Don't throw - local event was already emitted
    }
  }

  /**
   * Publish listing.created event
   */
  async publishListingCreated(listing: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_CREATED, listing, metadata);
  }

  /**
   * Publish listing.updated event
   */
  async publishListingUpdated(listing: any, changes: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_UPDATED, { listing, changes }, metadata);
  }

  /**
   * Publish listing.sold event
   */
  async publishListingSold(
    listing: any,
    buyerId: string,
    transactionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.publishEvent(
      MarketplaceEvents.LISTING_SOLD,
      { ...listing, buyer_id: buyerId, transaction_id: transactionId },
      metadata
    );
  }

  /**
   * Publish listing.cancelled event
   */
  async publishListingCancelled(listing: any, reason: string, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_CANCELLED, { ...listing, reason }, metadata);
  }

  /**
   * Publish listing.expired event
   */
  async publishListingExpired(listing: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.LISTING_EXPIRED, listing, metadata);
  }

  /**
   * Publish transfer.initiated event
   */
  async publishTransferInitiated(transfer: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.TRANSFER_INITIATED, transfer, metadata);
  }

  /**
   * Publish transfer.completed event
   */
  async publishTransferCompleted(transfer: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.TRANSFER_COMPLETED, transfer, metadata);
  }

  /**
   * Publish transfer.failed event
   */
  async publishTransferFailed(transfer: any, error: string, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.TRANSFER_FAILED, { ...transfer, error }, metadata);
  }

  /**
   * Publish dispute.created event
   */
  async publishDisputeCreated(dispute: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.DISPUTE_CREATED, dispute, metadata);
  }

  /**
   * Publish dispute.resolved event
   */
  async publishDisputeResolved(dispute: any, resolution: any, metadata?: Record<string, any>): Promise<void> {
    await this.publishEvent(MarketplaceEvents.DISPUTE_RESOLVED, { dispute, resolution }, metadata);
  }

  /**
   * Publish price.changed event (local only)
   */
  async publishPriceChanged(
    listingId: string,
    oldPrice: number,
    newPrice: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.publishEvent(MarketplaceEvents.PRICE_CHANGED, {
      listingId,
      oldPrice,
      newPrice,
      changedAt: new Date()
    }, metadata);
  }
}

export const eventPublisher = new EventPublisherClass();
