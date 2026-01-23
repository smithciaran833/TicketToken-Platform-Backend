/**
 * RabbitMQ Configuration and Connection for Marketplace Service
 *
 * PHASE 1 FIX: Replaced stub implementation with real amqplib connection
 * This enables actual inter-service event publishing.
 *
 * Events Published:
 * - listing.created - When a new listing is created
 * - listing.sold - When a listing is purchased
 * - transfer.complete - When an NFT transfer completes
 * - dispute.created - When a dispute is opened
 */

import * as amqplib from 'amqplib';
import type { Connection, Channel, ConsumeMessage } from 'amqplib';
import { logger } from '../utils/logger';

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

interface RabbitMQConfig {
  url: string;
  exchanges: {
    marketplace: string;
    events: string;
  };
  queues: {
    listings: string;
    transfers: string;
    disputes: string;
    notifications: string;
  };
  routingKeys: {
    listingCreated: string;
    listingUpdated: string;
    listingSold: string;
    listingCancelled: string;
    listingExpired: string;
    transferInitiated: string;
    transferComplete: string;
    transferFailed: string;
    disputeCreated: string;
    disputeResolved: string;
  };
}

export const rabbitmqConfig: RabbitMQConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672',
  exchanges: {
    marketplace: 'marketplace-events',
    events: 'tickettoken_events'  // Main platform event exchange
  },
  queues: {
    listings: 'marketplace.listings.queue',
    transfers: 'marketplace.transfers.queue',
    disputes: 'marketplace.disputes.queue',
    notifications: 'marketplace.notifications.queue'
  },
  routingKeys: {
    listingCreated: 'listing.created',
    listingUpdated: 'listing.updated',
    listingSold: 'listing.sold',
    listingCancelled: 'listing.cancelled',
    listingExpired: 'listing.expired',
    transferInitiated: 'transfer.initiated',
    transferComplete: 'transfer.complete',
    transferFailed: 'transfer.failed',
    disputeCreated: 'dispute.created',
    disputeResolved: 'dispute.resolved'
  }
};

// =============================================================================
// RECONNECTION CONFIGURATION
// =============================================================================

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: 10
};

// =============================================================================
// RABBITMQ CONNECTION CLASS
// =============================================================================

/**
 * Real RabbitMQ connection class using amqplib
 * PHASE 1 FIX: Replaces stubbed implementation
 */
class RabbitMQConnection {
  private connection: any = null;
  private channel: any = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  /**
   * Connect to RabbitMQ and set up exchanges
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      logger.debug('RabbitMQ connection already in progress');
      return;
    }

    if (this.connected && this.channel) {
      logger.debug('RabbitMQ already connected');
      return;
    }

    this.connecting = true;

    try {
      logger.info('Connecting to RabbitMQ...', { url: rabbitmqConfig.url.replace(/:[^:@]+@/, ':***@') });

      this.connection = await amqplib.connect(rabbitmqConfig.url);
      this.channel = await this.connection.createChannel();

      // Assert exchanges (topic type for flexible routing)
      await this.channel.assertExchange(rabbitmqConfig.exchanges.marketplace, 'topic', {
        durable: true
      });
      await this.channel.assertExchange(rabbitmqConfig.exchanges.events, 'topic', {
        durable: true
      });

      // Set up connection event handlers
      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error', { error: err.message });
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      // Set up channel event handlers
      this.channel.on('error', (err: Error) => {
        logger.error('RabbitMQ channel error', { error: err.message });
      });

      this.channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
        this.channel = null;
      });

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;

      logger.info('RabbitMQ connected successfully', {
        exchanges: Object.values(rabbitmqConfig.exchanges)
      });

    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      logger.error('Failed to connect to RabbitMQ', { error: error.message });
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Handle disconnection and trigger reconnect
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.connection = null;
    this.channel = null;
    this.connecting = false;
    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      logger.error('Max RabbitMQ reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, this.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelayMs
    );

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const actualDelay = Math.round(delay + jitter);

    logger.info('Scheduling RabbitMQ reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: actualDelay
    });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
        logger.info('RabbitMQ reconnected successfully', {
          attempts: this.reconnectAttempts
        });
      } catch (error: any) {
        logger.error('RabbitMQ reconnection failed', {
          attempt: this.reconnectAttempts,
          error: error.message
        });
        // scheduleReconnect will be called again via connect() failure path
      }
    }, actualDelay);
  }

  /**
   * Publish a message to an exchange
   */
  async publish(exchange: string, routingKey: string, message: any): Promise<boolean> {
    if (!this.connected || !this.channel) {
      logger.warn('RabbitMQ not connected, cannot publish message', {
        exchange,
        routingKey
      });
      return false;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify({
        ...message,
        _meta: {
          ...message._meta,
          publishedAt: new Date().toISOString(),
          source: 'marketplace-service'
        }
      }));

      const published = this.channel.publish(
        exchange,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          timestamp: Date.now(),
          contentType: 'application/json'
        }
      );

      if (published) {
        logger.debug('Message published to RabbitMQ', {
          exchange,
          routingKey,
          messageSize: messageBuffer.length
        });
      } else {
        logger.warn('Message not published (buffer full)', {
          exchange,
          routingKey
        });
      }

      return published;

    } catch (error: any) {
      logger.error('Failed to publish message to RabbitMQ', {
        exchange,
        routingKey,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Subscribe to a queue
   */
  async subscribe(
    queue: string,
    handler: (msg: ConsumeMessage | null) => Promise<void>,
    options?: { prefetch?: number }
  ): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    try {
      // Assert queue exists
      await this.channel.assertQueue(queue, { durable: true });

      // Set prefetch for fair distribution
      if (options?.prefetch) {
        await this.channel.prefetch(options.prefetch);
      }

      // Start consuming
      await this.channel.consume(queue, async (msg: ConsumeMessage | null) => {
        if (msg) {
          try {
            await handler(msg);
            this.channel?.ack(msg);
          } catch (error: any) {
            logger.error('Error processing message', {
              queue,
              error: error.message
            });
            // Negative acknowledge, requeue the message
            this.channel?.nack(msg, false, true);
          }
        }
      });

      logger.info('Subscribed to queue', { queue });

    } catch (error: any) {
      logger.error('Failed to subscribe to queue', {
        queue,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Bind a queue to an exchange with a routing key
   */
  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('RabbitMQ not connected');
    }

    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, exchange, routingKey);

    logger.debug('Queue bound to exchange', {
      queue,
      exchange,
      routingKey
    });
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error: any) {
      logger.error('Error closing RabbitMQ connection', {
        error: error.message
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.channel !== null;
  }

  /**
   * Get the channel for advanced operations
   */
  getChannel(): amqplib.Channel | null {
    return this.channel;
  }
}

// =============================================================================
// SINGLETON INSTANCE AND INITIALIZATION
// =============================================================================

export const rabbitmq = new RabbitMQConnection();

/**
 * Initialize RabbitMQ connection
 * Call this during service startup
 */
export const initializeRabbitMQ = async (): Promise<void> => {
  try {
    await rabbitmq.connect();
    logger.info('RabbitMQ initialized successfully');
  } catch (error: any) {
    logger.error('Failed to initialize RabbitMQ', { error: error.message });
    // Don't throw - allow service to run with degraded functionality
    // Reconnection will be attempted automatically
  }
};

// =============================================================================
// CONVENIENCE PUBLISHING FUNCTIONS
// =============================================================================

/**
 * Publish a listing event
 */
export async function publishListingEvent(
  eventType: string,
  listingId: string,
  payload: any,
  metadata?: { userId?: string; tenantId?: string }
): Promise<boolean> {
  const message = {
    eventType,
    aggregateId: listingId,
    aggregateType: 'listing',
    payload,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  };

  // Publish to both marketplace-specific and platform-wide exchanges
  const marketplaceResult = await rabbitmq.publish(
    rabbitmqConfig.exchanges.marketplace,
    eventType,
    message
  );

  const platformResult = await rabbitmq.publish(
    rabbitmqConfig.exchanges.events,
    `listing.${eventType.split('.').pop()}`,
    message
  );

  return marketplaceResult && platformResult;
}

/**
 * Publish a transfer event
 */
export async function publishTransferEvent(
  eventType: string,
  transferId: string,
  payload: any,
  metadata?: { userId?: string; tenantId?: string }
): Promise<boolean> {
  const message = {
    eventType,
    aggregateId: transferId,
    aggregateType: 'transfer',
    payload,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  };

  return rabbitmq.publish(
    rabbitmqConfig.exchanges.events,
    eventType,
    message
  );
}

/**
 * Publish a dispute event
 */
export async function publishDisputeEvent(
  eventType: string,
  disputeId: string,
  payload: any,
  metadata?: { userId?: string; tenantId?: string }
): Promise<boolean> {
  const message = {
    eventType,
    aggregateId: disputeId,
    aggregateType: 'dispute',
    payload,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  };

  return rabbitmq.publish(
    rabbitmqConfig.exchanges.events,
    eventType,
    message
  );
}

// =============================================================================
// TYPED EVENT PUBLISHERS
// =============================================================================

export const MarketplaceEventPublisher = {
  /**
   * Publish listing.created event
   */
  async listingCreated(listing: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishListingEvent(
      rabbitmqConfig.routingKeys.listingCreated,
      listing.id,
      listing,
      metadata
    );
  },

  /**
   * Publish listing.updated event
   */
  async listingUpdated(listing: any, changes: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishListingEvent(
      rabbitmqConfig.routingKeys.listingUpdated,
      listing.id,
      { listing, changes },
      metadata
    );
  },

  /**
   * Publish listing.sold event
   */
  async listingSold(listing: any, buyerId: string, transactionId: string, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishListingEvent(
      rabbitmqConfig.routingKeys.listingSold,
      listing.id,
      { listing, buyerId, transactionId },
      metadata
    );
  },

  /**
   * Publish listing.cancelled event
   */
  async listingCancelled(listing: any, reason: string, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishListingEvent(
      rabbitmqConfig.routingKeys.listingCancelled,
      listing.id,
      { listing, reason },
      metadata
    );
  },

  /**
   * Publish listing.expired event
   */
  async listingExpired(listing: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishListingEvent(
      rabbitmqConfig.routingKeys.listingExpired,
      listing.id,
      listing,
      metadata
    );
  },

  /**
   * Publish transfer.initiated event
   */
  async transferInitiated(transfer: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishTransferEvent(
      rabbitmqConfig.routingKeys.transferInitiated,
      transfer.id,
      transfer,
      metadata
    );
  },

  /**
   * Publish transfer.complete event
   */
  async transferComplete(transfer: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishTransferEvent(
      rabbitmqConfig.routingKeys.transferComplete,
      transfer.id,
      transfer,
      metadata
    );
  },

  /**
   * Publish transfer.failed event
   */
  async transferFailed(transfer: any, error: string, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishTransferEvent(
      rabbitmqConfig.routingKeys.transferFailed,
      transfer.id,
      { transfer, error },
      metadata
    );
  },

  /**
   * Publish dispute.created event
   */
  async disputeCreated(dispute: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishDisputeEvent(
      rabbitmqConfig.routingKeys.disputeCreated,
      dispute.id,
      dispute,
      metadata
    );
  },

  /**
   * Publish dispute.resolved event
   */
  async disputeResolved(dispute: any, resolution: any, metadata?: { userId?: string; tenantId?: string }): Promise<boolean> {
    return publishDisputeEvent(
      rabbitmqConfig.routingKeys.disputeResolved,
      dispute.id,
      { dispute, resolution },
      metadata
    );
  }
};
