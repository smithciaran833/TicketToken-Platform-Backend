const amqplib = require('amqplib');
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { publishSearchSync } from '@tickettoken/shared';
import { getConfig } from '../config/index';
import { Redis } from 'ioredis';

/**
 * SECURITY FIX (TENANT2): Event messages with tenant context
 */
export interface EventMessage {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: any;
  metadata?: {
    userId?: string;
    tenantId?: string; // SECURITY FIX: Add tenant context to events
    timestamp?: Date;
    correlationId?: string;
    version?: number;
  };
}

export class EventPublisher {
  private connection: any = null;
  private channel: any = null;
  private publishWithBreaker: (message: EventMessage) => Promise<void>;
  private readonly exchangeName = 'venue-events';
  private readonly rabbitUrl: string;
  private connected: boolean = false;
  private redis: Redis | null = null;
  private readonly FAILED_EVENTS_QUEUE = 'failed-venue-events';

  constructor(redis?: Redis) {
    const config = getConfig();
    this.rabbitUrl = config.rabbitmq.url;
    this.redis = redis || null;


    const breaker = createCircuitBreaker(
      this.publishInternal.bind(this),
      {
        name: 'rabbitmq-publish',
        timeout: 2000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );

    this.publishWithBreaker = async (message: EventMessage): Promise<void> => {
      await breaker.fire(message);
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });

      this.connected = true;
      logger.info('Connected to RabbitMQ');

      this.connection.on('error', (err: any) => {
        logger.error({ error: err }, 'RabbitMQ connection error');
        this.connected = false;
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.connected = false;
        this.reconnect();
      });
    } catch (error) {
      logger.warn({ error }, 'Could not connect to RabbitMQ - running without event publishing');
      this.connected = false;
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private async reconnect(): Promise<void> {
    this.connection = null;
    this.channel = null;
    await this.connect();
  }

  private async publishInternal(message: EventMessage): Promise<void> {
    if (!this.connected || !this.channel) {
      logger.debug('RabbitMQ not connected, skipping event publish');
      return;
    }

    const routingKey = `${message.aggregateType}.${message.eventType}`;
    const messageBuffer = Buffer.from(JSON.stringify({
      ...message,
      metadata: {
        ...message.metadata,
        timestamp: message.metadata?.timestamp || new Date(),
      }
    }));

    this.channel.publish(
      this.exchangeName,
      routingKey,
      messageBuffer,
      { persistent: true }
    );

    logger.debug({ routingKey, message }, 'Event published to RabbitMQ');
  }

  async publish(message: EventMessage): Promise<void> {
    try {
      await this.publishWithBreaker(message);
    } catch (error) {
      logger.error({ error, message }, 'Failed to publish event');
    }
  }

  /**
   * PHASE 2 FIX: Queue failed events for retry
   */
  private async queueFailedEvent(
    eventType: string,
    venueId: string,
    payload: any,
    userId?: string,
    tenantId?: string
  ): Promise<void> {
    if (!this.redis) {
      logger.warn('Redis not available, cannot queue failed event');
      return;
    }

    try {
      const failedEvent = {
        eventType,
        venueId,
        payload,
        userId,
        tenantId,
        failedAt: new Date().toISOString(),
        retryCount: 0,
      };

      await this.redis.rpush(
        this.FAILED_EVENTS_QUEUE,
        JSON.stringify(failedEvent)
      );

      logger.info(
        { eventType, venueId, tenantId },
        'Failed event queued for retry'
      );
    } catch (queueError) {
      logger.error(
        { error: queueError, eventType, venueId },
        'Failed to queue failed event'
      );
    }
  }

  // SECURITY FIX (TENANT2): Venue-specific event methods with tenant context
  // PHASE 2 FIX: Added error handling with failed event queue
  async publishVenueCreated(venueId: string, venueData: any, userId?: string, tenantId?: string): Promise<void> {
    try {
      await this.publish({
        eventType: 'created',
        aggregateId: venueId,
        aggregateType: 'venue',
        payload: venueData,
        metadata: {
          userId,
          tenantId, // SECURITY FIX: Include tenant context
          version: 1
        }
      });

      // SEARCH SYNC: Publish to search.sync exchange
      await publishSearchSync('venue.created', {
        id: venueId,
        tenant_id: tenantId, // SECURITY FIX: Include tenant context
        name: venueData.name,
        type: venueData.type || venueData.venue_type,
        capacity: venueData.capacity || venueData.max_capacity,
        city: venueData.city || venueData.address?.city,
        state: venueData.state_province || venueData.address?.state,
        country: venueData.country_code || venueData.address?.country,
        status: venueData.status || 'ACTIVE',
      });
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to publish venue created event');
      await this.queueFailedEvent('created', venueId, venueData, userId, tenantId);
      throw error;
    }
  }

  async publishVenueUpdated(venueId: string, changes: any, userId?: string, tenantId?: string): Promise<void> {
    try {
      await this.publish({
        eventType: 'updated',
        aggregateId: venueId,
        aggregateType: 'venue',
        payload: { changes },
        metadata: {
          userId,
          tenantId // SECURITY FIX: Include tenant context
        }
      });

      // SEARCH SYNC: Publish update to search
      await publishSearchSync('venue.updated', {
        id: venueId,
        tenant_id: tenantId, // SECURITY FIX: Include tenant context
        changes: {
          name: changes.name,
          type: changes.type || changes.venue_type,
          capacity: changes.capacity || changes.max_capacity,
          city: changes.city || changes.address?.city,
          state: changes.state_province || changes.address?.state,
          status: changes.status,
        }
      });
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to publish venue updated event');
      await this.queueFailedEvent('updated', venueId, { changes }, userId, tenantId);
      throw error;
    }
  }

  async publishVenueDeleted(venueId: string, userId?: string, tenantId?: string): Promise<void> {
    try {
      await this.publish({
        eventType: 'deleted',
        aggregateId: venueId,
        aggregateType: 'venue',
        payload: { deletedAt: new Date() },
        metadata: {
          userId,
          tenantId // SECURITY FIX: Include tenant context
        }
      });

      // SEARCH SYNC: Remove from search index
      await publishSearchSync('venue.deleted', {
        id: venueId,
        tenant_id: tenantId, // SECURITY FIX: Include tenant context
      });
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to publish venue deleted event');
      await this.queueFailedEvent('deleted', venueId, { deletedAt: new Date() }, userId, tenantId);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
