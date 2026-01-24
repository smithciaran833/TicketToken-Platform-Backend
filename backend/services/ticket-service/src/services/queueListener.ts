/**
 * RabbitMQ Queue Listener for Ticket Service
 *
 * PHASE 1 FIX: Implements real RabbitMQ consumption
 * Previously this was a stub that only exposed webhook endpoints.
 *
 * Events Consumed:
 * - payment.completed - Triggered when payment is successful
 * - payment.failed - Triggered when payment fails
 * - order.created - Triggered when a new order is created
 * - order.cancelled - Triggered when an order is cancelled
 *
 * This listener works alongside the existing queueService.ts (publisher)
 * to enable full bi-directional RabbitMQ communication.
 */

import * as amqplib from 'amqplib';
import type { Connection, Channel, ConsumeMessage } from 'amqplib';
import { PaymentEventHandler } from './paymentEventHandler';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Counter, Gauge } from 'prom-client';

const log = logger.child({ component: 'QueueListener' });

// =============================================================================
// METRICS
// =============================================================================

const messagesReceived = new Counter({
  name: 'ticket_service_messages_received_total',
  help: 'Total messages received from RabbitMQ',
  labelNames: ['event_type', 'status']
});

const connectionStatus = new Gauge({
  name: 'ticket_service_rabbitmq_consumer_connected',
  help: 'RabbitMQ consumer connection status (1=connected, 0=disconnected)',
  labelNames: []
});

const eventProcessingDuration = new Counter({
  name: 'ticket_service_event_processing_duration_ms',
  help: 'Event processing duration in milliseconds',
  labelNames: ['event_type']
});

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONSUMER_CONFIG = {
  // Events to consume
  routingKeys: [
    'payment.completed',
    'payment.failed',
    'payment.succeeded',  // Alternative routing key
    'order.created',
    'order.cancelled',
    'order.paid'
  ],
  // Exchange to bind to
  exchange: 'tickettoken_events',
  // Queue name for this service
  queueName: 'ticket-service.events',
  // Prefetch count for fair distribution
  prefetch: 10,
  // DLQ configuration
  dlq: {
    enabled: true,
    suffix: '.dlq',
    messageTtl: 24 * 60 * 60 * 1000  // 24 hours
  }
};

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: -1  // Infinite retries
};

// =============================================================================
// QUEUE LISTENER CLASS
// =============================================================================

class QueueListenerClass {
  private connection: any = null;
  private channel: any = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private consumerTag: string | null = null;

  /**
   * Start the queue listener
   * Connects to RabbitMQ and begins consuming events
   */
  async start(): Promise<void> {
    log.info('Starting queue listener...');

    try {
      await this.connect();
      log.info('Queue listener started successfully');
    } catch (error: any) {
      log.warn('Queue listener failed to start, will retry in background', {
        error: error.message
      });
      // Don't throw - let the service start and retry in background
    }
  }

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
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
      const rabbitmqUrl = config.rabbitmq.url;

      if (!rabbitmqUrl) {
        throw new Error('RABBITMQ_URL not configured');
      }

      log.info('Connecting to RabbitMQ...', {
        url: rabbitmqUrl.replace(/:[^:@]+@/, ':***@')
      });

      this.connection = await amqplib.connect(rabbitmqUrl);
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

      // Set up queues and start consuming
      await this.setupQueues();
      await this.startConsuming();

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      connectionStatus.set(1);

      log.info('RabbitMQ consumer connected successfully', {
        queue: CONSUMER_CONFIG.queueName,
        exchange: CONSUMER_CONFIG.exchange,
        routingKeys: CONSUMER_CONFIG.routingKeys
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
   * Set up queues, exchanges, and bindings
   */
  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert exchange
    await this.channel.assertExchange(CONSUMER_CONFIG.exchange, 'topic', {
      durable: true
    });

    // Set up DLQ if enabled
    if (CONSUMER_CONFIG.dlq.enabled) {
      const dlqName = `${CONSUMER_CONFIG.queueName}${CONSUMER_CONFIG.dlq.suffix}`;
      await this.channel.assertQueue(dlqName, {
        durable: true,
        arguments: {
          'x-message-ttl': CONSUMER_CONFIG.dlq.messageTtl
        }
      });
      log.debug('DLQ asserted', { dlq: dlqName });
    }

    // Assert main queue with DLQ binding
    const queueArgs: any = {};
    if (CONSUMER_CONFIG.dlq.enabled) {
      queueArgs['x-dead-letter-exchange'] = '';
      queueArgs['x-dead-letter-routing-key'] = `${CONSUMER_CONFIG.queueName}${CONSUMER_CONFIG.dlq.suffix}`;
    }

    await this.channel.assertQueue(CONSUMER_CONFIG.queueName, {
      durable: true,
      arguments: queueArgs
    });

    // Bind queue to exchange with routing keys
    for (const routingKey of CONSUMER_CONFIG.routingKeys) {
      await this.channel.bindQueue(
        CONSUMER_CONFIG.queueName,
        CONSUMER_CONFIG.exchange,
        routingKey
      );
      log.debug('Queue bound', {
        queue: CONSUMER_CONFIG.queueName,
        exchange: CONSUMER_CONFIG.exchange,
        routingKey
      });
    }

    // Set prefetch
    await this.channel.prefetch(CONSUMER_CONFIG.prefetch);

    log.info('Queues and bindings configured');
  }

  /**
   * Start consuming messages
   */
  private async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const consumer = await this.channel.consume(
      CONSUMER_CONFIG.queueName,
      (msg: ConsumeMessage | null) => this.handleMessage(msg)
    );

    this.consumerTag = consumer.consumerTag;
    log.info('Started consuming', {
      queue: CONSUMER_CONFIG.queueName,
      consumerTag: this.consumerTag
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    const startTime = Date.now();
    const routingKey = msg.fields.routingKey;

    messagesReceived.inc({ event_type: routingKey, status: 'received' });

    try {
      const content = JSON.parse(msg.content.toString());

      log.debug('Received message', {
        routingKey,
        exchange: msg.fields.exchange,
        contentSize: msg.content.length
      });

      // Route to appropriate handler
      await this.routeMessage(routingKey, content);

      // Acknowledge successful processing
      this.channel?.ack(msg);
      messagesReceived.inc({ event_type: routingKey, status: 'processed' });

      const duration = Date.now() - startTime;
      eventProcessingDuration.inc({ event_type: routingKey }, duration);

      log.info('Message processed successfully', {
        routingKey,
        durationMs: duration
      });

    } catch (error: any) {
      log.error('Error processing message', {
        routingKey,
        error: error.message
      });

      messagesReceived.inc({ event_type: routingKey, status: 'error' });

      // Nack without requeue - let it go to DLQ
      this.channel?.nack(msg, false, false);
    }
  }

  /**
   * Route message to appropriate handler based on routing key
   */
  private async routeMessage(routingKey: string, content: any): Promise<void> {
    switch (routingKey) {
      case 'payment.completed':
      case 'payment.succeeded':
      case 'order.paid':
        await this.handlePaymentCompleted(content);
        break;

      case 'payment.failed':
        await this.handlePaymentFailed(content);
        break;

      case 'order.created':
        await this.handleOrderCreated(content);
        break;

      case 'order.cancelled':
        await this.handleOrderCancelled(content);
        break;

      default:
        log.warn('Unhandled routing key', { routingKey });
    }
  }

  /**
   * Handle payment.completed event
   */
  private async handlePaymentCompleted(content: any): Promise<void> {
    const orderId = content.orderId || content.order_id || content.payload?.orderId;
    const paymentId = content.paymentId || content.payment_id || content.payload?.paymentId || content.id;

    if (!orderId) {
      throw new Error('Missing orderId in payment.completed event');
    }

    log.info('Processing payment.completed', { orderId, paymentId });
    await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);
  }

  /**
   * Handle payment.failed event
   */
  private async handlePaymentFailed(content: any): Promise<void> {
    const orderId = content.orderId || content.order_id || content.payload?.orderId;
    const reason = content.reason || content.error || content.payload?.reason || 'Unknown';

    if (!orderId) {
      throw new Error('Missing orderId in payment.failed event');
    }

    log.info('Processing payment.failed', { orderId, reason });
    await PaymentEventHandler.handlePaymentFailed(orderId, reason);
  }

  /**
   * Handle order.created event
   */
  private async handleOrderCreated(content: any): Promise<void> {
    const orderId = content.orderId || content.order_id || content.id;

    log.info('Received order.created event', {
      orderId,
      eventId: content.eventId || content.event_id,
      userId: content.userId || content.user_id
    });

    // Order created events are informational - tickets are already reserved
    // during order creation via synchronous call
    // No action needed unless we want to update internal state
  }

  /**
   * Handle order.cancelled event
   */
  private async handleOrderCancelled(content: any): Promise<void> {
    const orderId = content.orderId || content.order_id || content.id;

    log.info('Received order.cancelled event', { orderId });

    // Order cancellation typically releases reservations
    // This might be handled by a separate reservation cleanup process
    // Log for now - can add ticket release logic if needed
  }

  // ===========================================================================
  // WEBHOOK MODE (BACKWARDS COMPATIBILITY)
  // ===========================================================================

  /**
   * Process payment success via webhook/REST (backwards compatible)
   * Use RabbitMQ when available, but this allows direct calls as fallback
   */
  async processPaymentSuccess(orderId: string, paymentId: string): Promise<void> {
    log.info('Processing payment success (webhook mode)', { orderId, paymentId });
    await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);
  }

  /**
   * Process payment failure via webhook/REST (backwards compatible)
   */
  async processPaymentFailure(orderId: string, reason: string): Promise<void> {
    log.info('Processing payment failure (webhook mode)', { orderId, reason });
    await PaymentEventHandler.handlePaymentFailed(orderId, reason);
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.connection = null;
    this.channel = null;
    this.connecting = false;
    this.consumerTag = null;
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
   * Stop the queue listener
   */
  async stop(): Promise<void> {
    log.info('Stopping queue listener...');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel && this.consumerTag) {
        await this.channel.cancel(this.consumerTag);
      }
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connected = false;
      this.consumerTag = null;
      connectionStatus.set(0);
      log.info('Queue listener stopped');
    } catch (error: any) {
      log.error('Error stopping queue listener', { error: error.message });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

export const QueueListener = new QueueListenerClass();
