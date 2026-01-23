/**
 * RabbitMQ Consumer Bridge for Minting Service
 *
 * PHASE 1 FIX: Bridges RabbitMQ messages to Bull queue
 *
 * Problem:
 * - blockchain-service publishes to RabbitMQ queue: ticket.mint
 * - minting-service was listening on Bull queue: ticket-minting
 * - Messages never arrived (queue technology mismatch)
 *
 * Solution:
 * - This consumer listens to RabbitMQ 'ticket.mint' queue
 * - Forwards messages to the existing Bull queue via addMintJob()
 * - Existing Bull worker continues to process jobs unchanged
 *
 * Flow:
 * blockchain-service --RabbitMQ--> [THIS CONSUMER] --Bull--> mintingWorker
 */

import * as amqplib from 'amqplib';
import type { Connection, Channel, ConsumeMessage } from 'amqplib';
import logger from '../utils/logger';
import { addMintJob } from '../queues/mintQueue';
import { Counter, Gauge } from 'prom-client';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672',
  // Queue that blockchain-service publishes to
  queue: 'ticket.mint',
  // Alternative queue names to also listen to (for compatibility)
  alternativeQueues: ['blockchain.mint', 'ticket-mint'],
  // Exchange for mint events
  exchange: 'events',
  // Routing keys to bind
  routingKeys: ['ticket.mint', 'mint.request', 'ticket.mint.*'],
  // Queue for mint.success events (observability consumer)
  mintSuccessQueue: 'minting.mint-success',
  // Routing keys for mint.success
  mintSuccessRoutingKeys: ['mint.success', 'mint.completed']
};

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: -1  // Infinite retries for this critical consumer
};

// =============================================================================
// METRICS
// =============================================================================

const rabbitmqMessagesReceived = new Counter({
  name: 'minting_rabbitmq_messages_received_total',
  help: 'Total messages received from RabbitMQ',
  labelNames: ['queue', 'status']
});

const rabbitmqConnectionStatus = new Gauge({
  name: 'minting_rabbitmq_connected',
  help: 'RabbitMQ connection status (1=connected, 0=disconnected)',
  labelNames: []
});

const rabbitmqToBullBridged = new Counter({
  name: 'minting_rabbitmq_to_bull_bridged_total',
  help: 'Total messages successfully bridged from RabbitMQ to Bull',
  labelNames: ['status']
});

const mintSuccessEventsReceived = new Counter({
  name: 'minting_mint_success_events_total',
  help: 'Total mint.success events received for observability',
  labelNames: ['status']
});

// =============================================================================
// RABBITMQ CONSUMER CLASS
// =============================================================================

class RabbitMQConsumer {
  private connection: any = null;
  private channel: any = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private consumerTags: string[] = [];

  /**
   * Connect to RabbitMQ and start consuming
   */
  async connect(): Promise<void> {
    if (this.connecting) {
      logger.debug('RabbitMQ connection already in progress');
      return;
    }

    if (this.connected) {
      logger.debug('RabbitMQ already connected');
      return;
    }

    this.connecting = true;

    try {
      logger.info('Connecting to RabbitMQ...', {
        url: RABBITMQ_CONFIG.url.replace(/:[^:@]+@/, ':***@')
      });

      this.connection = await amqplib.connect(RABBITMQ_CONFIG.url);
      this.channel = await this.connection.createChannel();

      // Set up event handlers
      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error', { error: err.message });
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      this.channel.on('error', (err: Error) => {
        logger.error('RabbitMQ channel error', { error: err.message });
      });

      // Set up queues and start consuming
      await this.setupQueues();
      await this.startConsuming();

      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      rabbitmqConnectionStatus.set(1);

      logger.info('RabbitMQ consumer connected successfully', {
        queue: RABBITMQ_CONFIG.queue,
        alternativeQueues: RABBITMQ_CONFIG.alternativeQueues
      });

    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      rabbitmqConnectionStatus.set(0);
      logger.error('Failed to connect to RabbitMQ', { error: error.message });
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Set up queues and exchanges
   */
  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert the main exchange
    await this.channel.assertExchange(RABBITMQ_CONFIG.exchange, 'topic', {
      durable: true
    });

    // Assert and bind main queue
    await this.channel.assertQueue(RABBITMQ_CONFIG.queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': `${RABBITMQ_CONFIG.queue}.dlq`
      }
    });

    // Bind queue to exchange with routing keys
    for (const routingKey of RABBITMQ_CONFIG.routingKeys) {
      await this.channel.bindQueue(
        RABBITMQ_CONFIG.queue,
        RABBITMQ_CONFIG.exchange,
        routingKey
      );
      logger.debug('Queue bound to exchange', {
        queue: RABBITMQ_CONFIG.queue,
        exchange: RABBITMQ_CONFIG.exchange,
        routingKey
      });
    }

    // Assert and bind alternative queues for compatibility
    for (const queue of RABBITMQ_CONFIG.alternativeQueues) {
      await this.channel.assertQueue(queue, { durable: true });
      logger.debug('Alternative queue asserted', { queue });
    }

    // Assert and bind mint.success queue for observability
    await this.channel.assertQueue(RABBITMQ_CONFIG.mintSuccessQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': `${RABBITMQ_CONFIG.mintSuccessQueue}.dlq`
      }
    });

    // Bind mint.success queue to events exchange
    for (const routingKey of RABBITMQ_CONFIG.mintSuccessRoutingKeys) {
      await this.channel.bindQueue(
        RABBITMQ_CONFIG.mintSuccessQueue,
        RABBITMQ_CONFIG.exchange,
        routingKey
      );
      logger.debug('Mint success queue bound to exchange', {
        queue: RABBITMQ_CONFIG.mintSuccessQueue,
        exchange: RABBITMQ_CONFIG.exchange,
        routingKey
      });
    }

    // Set prefetch for fair distribution
    await this.channel.prefetch(5);

    logger.info('RabbitMQ queues and exchanges configured');
  }

  /**
   * Start consuming messages from all queues
   */
  private async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Consume from main queue
    const mainConsumer = await this.channel.consume(
      RABBITMQ_CONFIG.queue,
      (msg: ConsumeMessage | null) => this.handleMessage(msg, RABBITMQ_CONFIG.queue)
    );
    this.consumerTags.push(mainConsumer.consumerTag);

    // Also consume from alternative queues
    for (const queue of RABBITMQ_CONFIG.alternativeQueues) {
      try {
        const consumer = await this.channel.consume(
          queue,
          (msg: ConsumeMessage | null) => this.handleMessage(msg, queue)
        );
        this.consumerTags.push(consumer.consumerTag);
        logger.info('Started consuming from alternative queue', { queue });
      } catch (error: any) {
        logger.warn('Failed to consume from alternative queue', {
          queue,
          error: error.message
        });
      }
    }

    // Consume from mint.success queue for observability
    try {
      const mintSuccessConsumer = await this.channel.consume(
        RABBITMQ_CONFIG.mintSuccessQueue,
        (msg: ConsumeMessage | null) => this.handleMintSuccessMessage(msg)
      );
      this.consumerTags.push(mintSuccessConsumer.consumerTag);
      logger.info('Started consuming mint.success events', {
        queue: RABBITMQ_CONFIG.mintSuccessQueue
      });
    } catch (error: any) {
      logger.warn('Failed to start mint.success consumer', {
        error: error.message
      });
    }

    logger.info('RabbitMQ consumers started', {
      mainQueue: RABBITMQ_CONFIG.queue,
      mintSuccessQueue: RABBITMQ_CONFIG.mintSuccessQueue,
      consumerCount: this.consumerTags.length
    });
  }

  /**
   * Handle incoming RabbitMQ message
   * Bridge to Bull queue
   */
  private async handleMessage(
    msg: ConsumeMessage | null,
    sourceQueue: string
  ): Promise<void> {
    if (!msg) {
      return;
    }

    rabbitmqMessagesReceived.inc({ queue: sourceQueue, status: 'received' });

    try {
      const content = JSON.parse(msg.content.toString());

      logger.debug('Received RabbitMQ message', {
        queue: sourceQueue,
        routingKey: msg.fields.routingKey,
        contentSize: msg.content.length
      });

      // Extract mint job data from various message formats
      const mintJobData = this.extractMintJobData(content);

      if (!mintJobData) {
        logger.warn('Could not extract mint job data from message', {
          queue: sourceQueue,
          routingKey: msg.fields.routingKey,
          messageKeys: Object.keys(content)
        });
        // Acknowledge invalid messages to prevent requeue loops
        this.channel?.ack(msg);
        rabbitmqMessagesReceived.inc({ queue: sourceQueue, status: 'invalid' });
        return;
      }

      // Bridge to Bull queue
      const job = await addMintJob(mintJobData);

      logger.info('Message bridged from RabbitMQ to Bull', {
        rabbitQueue: sourceQueue,
        bullJobId: job.id,
        ticketId: mintJobData.ticketId,
        tenantId: mintJobData.tenantId
      });

      // Acknowledge successful processing
      this.channel?.ack(msg);
      rabbitmqToBullBridged.inc({ status: 'success' });
      rabbitmqMessagesReceived.inc({ queue: sourceQueue, status: 'processed' });

    } catch (error: any) {
      logger.error('Error processing RabbitMQ message', {
        queue: sourceQueue,
        error: error.message
      });

      // Check if it's a queue capacity error - nack without requeue to prevent loops
      if (error.message.includes('Queue capacity exceeded')) {
        logger.warn('Queue capacity exceeded, will retry later', {
          queue: sourceQueue
        });
        // Nack with requeue to try again later
        this.channel?.nack(msg, false, true);
        rabbitmqToBullBridged.inc({ status: 'capacity_exceeded' });
      } else {
        // For other errors, nack without requeue (goes to DLQ if configured)
        this.channel?.nack(msg, false, false);
        rabbitmqToBullBridged.inc({ status: 'error' });
      }

      rabbitmqMessagesReceived.inc({ queue: sourceQueue, status: 'error' });
    }
  }

  /**
   * Handle mint.success events for observability
   * These events are published by blockchain-service after NFT minting completes
   * The ticket-service is already updated directly by blockchain-service,
   * so this consumer is for observability, metrics, and audit logging
   */
  private async handleMintSuccessMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    try {
      const content = JSON.parse(msg.content.toString());

      logger.info('Received mint.success event', {
        orderId: content.orderId,
        mintAddress: content.mintAddress,
        transactionSignature: content.transactionSignature,
        venueId: content.venueId,
        metadataUri: content.metadataUri,
        timestamp: content.timestamp,
        routingKey: msg.fields.routingKey
      });

      // Record metrics
      mintSuccessEventsReceived.inc({ status: 'received' });

      // Log for audit trail
      logger.debug('Mint success event details', {
        orderId: content.orderId,
        mintAddress: content.mintAddress,
        creators: content.creators,
        fullPayload: content
      });

      // Acknowledge the message
      this.channel?.ack(msg);
      mintSuccessEventsReceived.inc({ status: 'processed' });

    } catch (error: any) {
      logger.error('Error processing mint.success event', {
        error: error.message,
        routingKey: msg.fields.routingKey
      });

      // Acknowledge anyway to prevent requeue - this is observability only
      this.channel?.ack(msg);
      mintSuccessEventsReceived.inc({ status: 'error' });
    }
  }

  /**
   * Extract mint job data from various message formats
   * Handles messages from blockchain-service and other publishers
   */
  private extractMintJobData(content: any): {
    ticketId: string;
    tenantId: string;
    orderId?: string;
    eventId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } | null {
    // Format 1: Direct mint job format
    if (content.ticketId && content.tenantId) {
      return {
        ticketId: content.ticketId,
        tenantId: content.tenantId,
        orderId: content.orderId,
        eventId: content.eventId,
        userId: content.userId,
        metadata: content.metadata
      };
    }

    // Format 2: blockchain-service format (from mint-worker.ts)
    if (content.orderId) {
      return {
        ticketId: content.ticketId || content.id || `order-${content.orderId}`,
        tenantId: content.tenantId || 'system',
        orderId: content.orderId,
        eventId: content.eventId,
        userId: content.userId,
        metadata: content.metadata
      };
    }

    // Format 3: Wrapped payload format
    if (content.payload) {
      return this.extractMintJobData(content.payload);
    }

    // Format 4: Event message format
    if (content.data) {
      return this.extractMintJobData(content.data);
    }

    return null;
  }

  /**
   * Handle disconnection and trigger reconnect
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.connection = null;
    this.channel = null;
    this.connecting = false;
    this.consumerTags = [];
    rabbitmqConnectionStatus.set(0);
    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectAttempts++;

    // Check max attempts (if not infinite)
    if (RECONNECT_CONFIG.maxAttempts > 0 &&
        this.reconnectAttempts > RECONNECT_CONFIG.maxAttempts) {
      logger.error('Max RabbitMQ reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      return;
    }

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
      } catch (error: any) {
        logger.error('RabbitMQ reconnection failed', {
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
      // Cancel consumers
      if (this.channel) {
        for (const tag of this.consumerTags) {
          try {
            await this.channel.cancel(tag);
          } catch (e) {
            // Ignore cancel errors
          }
        }
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
      this.consumerTags = [];
      rabbitmqConnectionStatus.set(0);
      logger.info('RabbitMQ consumer disconnected');
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
    return this.connected;
  }
}

// =============================================================================
// SINGLETON INSTANCE AND INITIALIZATION
// =============================================================================

export const rabbitmqConsumer = new RabbitMQConsumer();

/**
 * Initialize RabbitMQ consumer
 * Call this during service startup AFTER Bull queues are initialized
 */
export async function initializeRabbitMQConsumer(): Promise<void> {
  try {
    await rabbitmqConsumer.connect();
    logger.info('RabbitMQ consumer initialized - bridging to Bull queue');
  } catch (error: any) {
    logger.warn('Failed to initialize RabbitMQ consumer', {
      error: error.message
    });
    // Don't throw - allow service to run, will retry connection
    // Jobs can still be added via REST API
  }
}

/**
 * Shutdown RabbitMQ consumer gracefully
 */
export async function shutdownRabbitMQConsumer(): Promise<void> {
  await rabbitmqConsumer.disconnect();
}
