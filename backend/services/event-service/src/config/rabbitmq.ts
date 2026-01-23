/**
 * RabbitMQ Publisher for Event Service
 *
 * PHASE 1 FIX (Issue 5): Implements real RabbitMQ event publishing
 *
 * Events Published:
 * - event.created - When a new event is created
 * - event.updated - When an event is updated
 * - event.cancelled - When an event is cancelled
 * - event.published - When an event is published
 * - event.reminder - Event reminder notifications
 * - event.soldout - When an event sells out
 * - event.rescheduled - When an event is rescheduled
 *
 * These events enable other services to react:
 * - notification-service: Send notifications to users
 * - ticket-service: Update ticket states
 * - order-service: Handle refunds
 * - analytics-service: Track event lifecycle
 * - search-service: Update search index
 */

import * as amqplib from 'amqplib';
import type { Connection, Channel } from 'amqplib';
import { logger } from '../utils/logger';
import { Counter, Gauge } from 'prom-client';

const log = logger.child({ component: 'RabbitMQ' });

// =============================================================================
// METRICS
// =============================================================================

const eventsPublished = new Counter({
  name: 'event_service_events_published_total',
  help: 'Total events published to RabbitMQ',
  labelNames: ['event_type', 'status']
});

const connectionStatus = new Gauge({
  name: 'event_service_rabbitmq_publisher_connected',
  help: 'RabbitMQ publisher connection status (1=connected, 0=disconnected)',
  labelNames: []
});

// =============================================================================
// CONFIGURATION
// =============================================================================

export const rabbitmqConfig = {
  url: process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672',
  exchanges: {
    // Main platform events exchange
    events: 'tickettoken_events',
    // Event-specific exchange for detailed event lifecycle
    eventLifecycle: 'event-lifecycle'
  },
  routingKeys: {
    eventCreated: 'event.created',
    eventUpdated: 'event.updated',
    eventCancelled: 'event.cancelled',
    eventPublished: 'event.published',
    eventReminder: 'event.reminder',
    eventSoldout: 'event.soldout',
    eventRescheduled: 'event.rescheduled',
    eventDeleted: 'event.deleted',
    // Capacity-related events
    capacityWarning: 'event.capacity.warning',
    capacityCritical: 'event.capacity.critical'
  }
};

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: -1  // Infinite retries
};

// =============================================================================
// RABBITMQ PUBLISHER CLASS
// =============================================================================

class RabbitMQPublisher {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      log.debug('Connection already in progress');
      return;
    }

    if (this.connected) {
      log.debug('Already connected');
      return;
    }

    this.connecting = true;

    try {
      log.info('Connecting to RabbitMQ...', {
        url: rabbitmqConfig.url.replace(/:[^:@]+@/, ':***@')
      });

      this.connection = await amqplib.connect(rabbitmqConfig.url);
      this.channel = await this.connection.createChannel();

      // Set up event handlers
      this.connection.on('error', (err: Error) => {
        log.error('RabbitMQ connection error', { error: err.message });
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        log.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      this.channel.on('error', (err: Error) => {
        log.error('RabbitMQ channel error', { error: err.message });
      });

      // Set up exchanges
      await this.setupExchanges();

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      connectionStatus.set(1);

      log.info('RabbitMQ publisher connected successfully', {
        exchanges: Object.values(rabbitmqConfig.exchanges)
      });

    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      connectionStatus.set(0);
      log.error('Failed to connect to RabbitMQ', { error: error.message });
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Set up exchanges
   */
  private async setupExchanges(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert main events exchange
    await this.channel.assertExchange(rabbitmqConfig.exchanges.events, 'topic', {
      durable: true
    });

    // Assert event lifecycle exchange
    await this.channel.assertExchange(rabbitmqConfig.exchanges.eventLifecycle, 'topic', {
      durable: true
    });

    log.info('RabbitMQ exchanges configured');
  }

  /**
   * Publish an event to RabbitMQ
   */
  async publish(
    exchange: string,
    routingKey: string,
    payload: Record<string, any>,
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    if (!this.connected || !this.channel) {
      log.warn('Cannot publish - not connected to RabbitMQ', { routingKey });
      eventsPublished.inc({ event_type: routingKey, status: 'not_connected' });
      return false;
    }

    try {
      const message = {
        ...payload,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'event-service'
        },
        _meta: {
          source: 'event-service',
          publishedAt: new Date().toISOString(),
          routingKey
        }
      };

      const success = this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now()
        }
      );

      if (success) {
        eventsPublished.inc({ event_type: routingKey, status: 'success' });
        log.debug('Event published successfully', {
          exchange,
          routingKey,
          eventId: payload.eventId || payload.id
        });
      } else {
        eventsPublished.inc({ event_type: routingKey, status: 'buffer_full' });
        log.warn('Event publish returned false (buffer full)', {
          exchange,
          routingKey
        });
      }

      return success;
    } catch (error: any) {
      eventsPublished.inc({ event_type: routingKey, status: 'error' });
      log.error('Failed to publish event', {
        exchange,
        routingKey,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.connection = null;
    this.channel = null;
    this.connecting = false;
    connectionStatus.set(0);
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectAttempts++;

    if (RECONNECT_CONFIG.maxAttempts > 0 &&
        this.reconnectAttempts > RECONNECT_CONFIG.maxAttempts) {
      log.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, this.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelayMs
    );

    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    const actualDelay = Math.round(delay + jitter);

    log.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: actualDelay
    });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error: any) {
        log.error('Reconnection failed', {
          attempt: this.reconnectAttempts,
          error: error.message
        });
      }
    }, actualDelay);
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
      connectionStatus.set(0);
      log.info('RabbitMQ publisher disconnected');
    } catch (error: any) {
      log.error('Error closing RabbitMQ connection', { error: error.message });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const rabbitmq = new RabbitMQPublisher();

// =============================================================================
// INITIALIZATION FUNCTIONS
// =============================================================================

/**
 * Initialize RabbitMQ publisher
 */
export async function initializeRabbitMQ(): Promise<void> {
  try {
    await rabbitmq.connect();
    log.info('RabbitMQ publisher initialized');
  } catch (error: any) {
    log.warn('Failed to initialize RabbitMQ publisher - events will not be published', {
      error: error.message
    });
    // Don't throw - allow service to run without RabbitMQ
  }
}

/**
 * Shutdown RabbitMQ publisher
 */
export async function shutdownRabbitMQ(): Promise<void> {
  await rabbitmq.disconnect();
}

// =============================================================================
// EVENT PUBLISHER
// =============================================================================

export const EventLifecyclePublisher = {
  /**
   * Publish event.created
   */
  async eventCreated(
    event: {
      id: string;
      name: string;
      organizerId?: string;
      venueId?: string;
      startDate?: Date | string;
      endDate?: Date | string;
      status?: string;
    },
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventCreated,
      {
        eventId: event.id,
        name: event.name,
        organizerId: event.organizerId,
        venueId: event.venueId,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status,
        createdAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.updated
   */
  async eventUpdated(
    eventId: string,
    changes: Record<string, any>,
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventUpdated,
      {
        eventId,
        changes,
        updatedAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.cancelled
   */
  async eventCancelled(
    eventId: string,
    cancellationData: {
      reason?: string;
      cancelledBy?: string;
      affectedTickets?: number;
      refundPolicy?: string;
    },
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventCancelled,
      {
        eventId,
        ...cancellationData,
        cancelledAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.published
   */
  async eventPublished(
    eventId: string,
    eventData: {
      name?: string;
      startDate?: Date | string;
      venueId?: string;
    },
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventPublished,
      {
        eventId,
        ...eventData,
        publishedAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.reminder
   * Used for scheduled reminders (24h before, 1h before, etc.)
   */
  async eventReminder(
    eventId: string,
    reminderData: {
      type: 'upcoming' | 'starting_soon' | 'custom';
      hoursUntilEvent?: number;
      message?: string;
      recipientUserIds?: string[];
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventReminder,
      {
        eventId,
        ...reminderData,
        sentAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.soldout
   */
  async eventSoldout(
    eventId: string,
    soldoutData: {
      totalCapacity?: number;
      ticketsSold?: number;
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventSoldout,
      {
        eventId,
        ...soldoutData,
        soldoutAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.rescheduled
   */
  async eventRescheduled(
    eventId: string,
    rescheduleData: {
      oldStartDate: Date | string;
      newStartDate: Date | string;
      oldEndDate?: Date | string;
      newEndDate?: Date | string;
      reason?: string;
    },
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventRescheduled,
      {
        eventId,
        ...rescheduleData,
        rescheduledAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish event.deleted
   */
  async eventDeleted(
    eventId: string,
    metadata?: { userId?: string; tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.eventDeleted,
      {
        eventId,
        deletedAt: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish capacity warning (e.g., 80% sold)
   */
  async capacityWarning(
    eventId: string,
    capacityData: {
      percentSold: number;
      remaining: number;
      totalCapacity: number;
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.capacityWarning,
      {
        eventId,
        ...capacityData,
        timestamp: new Date().toISOString()
      },
      metadata
    );
  },

  /**
   * Publish capacity critical (e.g., 95% sold)
   */
  async capacityCritical(
    eventId: string,
    capacityData: {
      percentSold: number;
      remaining: number;
      totalCapacity: number;
    },
    metadata?: { tenantId?: string }
  ): Promise<boolean> {
    return rabbitmq.publish(
      rabbitmqConfig.exchanges.events,
      rabbitmqConfig.routingKeys.capacityCritical,
      {
        eventId,
        ...capacityData,
        timestamp: new Date().toISOString()
      },
      metadata
    );
  }
};
