const amqplib = require('amqplib');
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';

export interface EventMessage {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: any;
  metadata?: {
    userId?: string;
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

  constructor() {
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    
    // Wrap publish with circuit breaker
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
      
      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
      
      this.connected = true;
      logger.info('Connected to RabbitMQ');
      
      // Handle connection events
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
      // Don't throw - allow service to run without RabbitMQ
      // Retry connection after delay
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
      // Don't throw - event publishing failure shouldn't break main flow
    }
  }

  // Venue-specific event methods
  async publishVenueCreated(venueId: string, venueData: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'created',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: venueData,
      metadata: {
        userId,
        version: 1
      }
    });
  }

  async publishVenueUpdated(venueId: string, changes: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'updated',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { changes },
      metadata: {
        userId
      }
    });
  }

  async publishVenueDeleted(venueId: string, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'deleted',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { deletedAt: new Date() },
      metadata: {
        userId
      }
    });
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
  
  // Public method to check connection status
  public isConnected(): boolean {
    return this.connected;
  }
}
