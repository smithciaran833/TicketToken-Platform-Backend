/**
 * Event Sync Consumer - blockchain-service
 *
 * Consumes event.blockchain_sync_requested messages from RabbitMQ
 * and creates events on the Solana blockchain.
 *
 * Message Flow:
 * 1. event-service publishes event.blockchain_sync_requested to tickettoken_events exchange
 * 2. This consumer receives the message
 * 3. Calls Solana program to create event on-chain
 * 4. Calls back to event-service with blockchain status
 *
 * Exchange: tickettoken_events
 * Routing Key: event.blockchain_sync_requested
 * Queue: blockchain-service.event-sync
 */

import * as amqp from 'amqplib';
import type { Channel, Connection as AMQPConnection, ConsumeMessage } from 'amqplib';
import { Connection as SolanaConnection, Keypair, PublicKey } from '@solana/web3.js';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import config from '../config';

const log = logger.child({ component: 'EventSyncConsumer' });

// Queue configuration
const QUEUE_CONFIG = {
  exchange: 'tickettoken_events',
  routingKey: 'event.blockchain_sync_requested',
  queue: 'blockchain-service.event-sync',
  deadLetterExchange: 'tickettoken_events.dlx',
  deadLetterQueue: 'blockchain-service.event-sync.dlq',
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 5000,
  maxDelayMs: 60000,
  multiplier: 2,
};

/**
 * Message payload from event-service
 */
interface BlockchainSyncMessage {
  eventId: string;
  action: 'CREATE_EVENT';
  blockchainData: {
    blockchainEventId: number;
    venueId: string;
    name: string;
    ticketPrice: number;
    totalTickets: number;
    startTime: string;
    endTime: string;
    refundWindow: number;
    metadataUri: string;
    description: string;
    transferable: boolean;
    resaleable: boolean;
    merkleTree: string;
    artistWallet: string;
    artistPercentage: number;
    venuePercentage: number;
  };
  metadata: {
    tenantId: string;
    userId?: string;
    timestamp: string;
    source: string;
  };
  requestedAt: string;
}

/**
 * Callback payload to event-service
 */
interface BlockchainStatusCallback {
  status: 'synced' | 'failed';
  eventPda?: string;
  signature?: string;
  error?: string;
  syncedAt?: string;
}

export class EventSyncConsumer {
  private connection: AMQPConnection | null = null;
  private channel: Channel | null = null;
  private solanaConnection: SolanaConnection;
  private pool: Pool;
  private programWallet: Keypair;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = -1; // Infinite

  constructor() {
    this.solanaConnection = new SolanaConnection(
      config.solana.rpcUrl,
      config.solana.commitment
    );

    this.pool = new Pool(config.database);
    this.programWallet = this.initializeWallet();
  }

  /**
   * Initialize wallet for signing transactions
   */
  private initializeWallet(): Keypair {
    if (process.env.PROGRAM_WALLET_KEY) {
      const privateKey = JSON.parse(process.env.PROGRAM_WALLET_KEY);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    }

    // Generate test wallet in development
    const wallet = Keypair.generate();
    log.warn('Generated new wallet for testing', {
      publicKey: wallet.publicKey.toString(),
    });
    return wallet;
  }

  /**
   * Connect to RabbitMQ and start consuming
   */
  async start(): Promise<void> {
    log.info('Starting Event Sync Consumer...');

    try {
      await this.connect();
      await this.setupQueues();
      await this.startConsuming();

      log.info('Event Sync Consumer started successfully', {
        queue: QUEUE_CONFIG.queue,
        exchange: QUEUE_CONFIG.exchange,
        routingKey: QUEUE_CONFIG.routingKey,
      });
    } catch (error: any) {
      log.error('Failed to start Event Sync Consumer', { error: error.message });
      this.scheduleReconnect();
    }
  }

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';

    log.info('Connecting to RabbitMQ...', {
      url: rabbitmqUrl.replace(/:[^:@]+@/, ':***@'),
    });

    this.connection = await (amqp.connect as any)(rabbitmqUrl);
    this.channel = await (this.connection as any).createChannel();

    // Set prefetch to process one message at a time
    await this.channel.prefetch(1);

    // Handle connection events
    this.connection.on('error', (err: Error) => {
      log.error('RabbitMQ connection error', { error: err.message });
      this.handleDisconnect();
    });

    this.connection.on('close', () => {
      log.warn('RabbitMQ connection closed');
      this.handleDisconnect();
    });

    this.isConnected = true;
    this.reconnectAttempts = 0;

    log.info('Connected to RabbitMQ');
  }

  /**
   * Set up exchanges and queues
   */
  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    // Assert main exchange
    await this.channel.assertExchange(QUEUE_CONFIG.exchange, 'topic', {
      durable: true,
    });

    // Assert dead letter exchange
    await this.channel.assertExchange(QUEUE_CONFIG.deadLetterExchange, 'topic', {
      durable: true,
    });

    // Assert dead letter queue
    await this.channel.assertQueue(QUEUE_CONFIG.deadLetterQueue, {
      durable: true,
    });

    // Bind DLQ to DLX
    await this.channel.bindQueue(
      QUEUE_CONFIG.deadLetterQueue,
      QUEUE_CONFIG.deadLetterExchange,
      QUEUE_CONFIG.routingKey
    );

    // Assert main queue with DLX
    await this.channel.assertQueue(QUEUE_CONFIG.queue, {
      durable: true,
      deadLetterExchange: QUEUE_CONFIG.deadLetterExchange,
      deadLetterRoutingKey: QUEUE_CONFIG.routingKey,
    });

    // Bind queue to exchange
    await this.channel.bindQueue(
      QUEUE_CONFIG.queue,
      QUEUE_CONFIG.exchange,
      QUEUE_CONFIG.routingKey
    );

    log.info('Queues configured', {
      queue: QUEUE_CONFIG.queue,
      dlq: QUEUE_CONFIG.deadLetterQueue,
    });
  }

  /**
   * Start consuming messages
   */
  private async startConsuming(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      QUEUE_CONFIG.queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const startTime = Date.now();
        let message: BlockchainSyncMessage | null = null;

        try {
          message = JSON.parse(msg.content.toString());

          log.info('Processing blockchain sync message', {
            eventId: message?.eventId,
            action: message?.action,
          });

          await this.processMessage(message!);

          // Acknowledge successful processing
          this.channel!.ack(msg);

          log.info('Blockchain sync completed', {
            eventId: message?.eventId,
            durationMs: Date.now() - startTime,
          });
        } catch (error: any) {
          log.error('Failed to process blockchain sync message', {
            eventId: message?.eventId,
            error: error.message,
            durationMs: Date.now() - startTime,
          });

          // Check retry count from message headers
          const retryCount = this.getRetryCount(msg);

          if (retryCount < RETRY_CONFIG.maxRetries) {
            // Requeue with delay (nack with requeue)
            log.info('Requeuing message for retry', {
              eventId: message?.eventId,
              retryCount: retryCount + 1,
              maxRetries: RETRY_CONFIG.maxRetries,
            });

            this.channel!.nack(msg, false, true);
          } else {
            // Send to dead letter queue
            log.error('Max retries exceeded, sending to DLQ', {
              eventId: message?.eventId,
              retryCount,
            });

            this.channel!.nack(msg, false, false);

            // Callback to event-service with failure status
            if (message) {
              await this.callbackEventService(message.eventId, message.metadata.tenantId, {
                status: 'failed',
                error: `Max retries exceeded: ${error.message}`,
              });
            }
          }
        }
      },
      { noAck: false }
    );

    log.info('Consuming from queue', { queue: QUEUE_CONFIG.queue });
  }

  /**
   * Get retry count from message headers
   */
  private getRetryCount(msg: ConsumeMessage): number {
    const xDeath = msg.properties.headers?.['x-death'];
    if (Array.isArray(xDeath) && xDeath.length > 0) {
      return xDeath[0].count || 0;
    }
    return 0;
  }

  /**
   * Process a blockchain sync message
   */
  private async processMessage(message: BlockchainSyncMessage): Promise<void> {
    const { eventId, action, blockchainData, metadata } = message;

    if (action !== 'CREATE_EVENT') {
      throw new Error(`Unsupported action: ${action}`);
    }

    log.info('Creating event on blockchain', {
      eventId,
      blockchainEventId: blockchainData.blockchainEventId,
      name: blockchainData.name,
    });

    // Simulate blockchain transaction (in production, call actual Solana program)
    // This would use your Anchor program to create the event
    const result = await this.createEventOnChain(blockchainData);

    // Record sync in database
    await this.recordBlockchainSync(eventId, metadata.tenantId, result);

    // Callback to event-service with success status
    await this.callbackEventService(eventId, metadata.tenantId, {
      status: 'synced',
      eventPda: result.eventPda,
      signature: result.signature,
      syncedAt: new Date().toISOString(),
    });
  }

  /**
   * Create event on Solana blockchain
   * In production, this calls your Anchor program
   */
  private async createEventOnChain(blockchainData: BlockchainSyncMessage['blockchainData']): Promise<{
    eventPda: string;
    signature: string;
  }> {
    // TODO: Implement actual Solana program call
    // This is a placeholder that simulates the blockchain call

    log.info('Calling Solana program to create event', {
      blockchainEventId: blockchainData.blockchainEventId,
      artistWallet: blockchainData.artistWallet,
    });

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In production:
    // 1. Build transaction with program instruction
    // 2. Sign with program wallet
    // 3. Send and confirm transaction
    // 4. Extract event PDA from logs

    // Placeholder response
    const eventPda = `event_${blockchainData.blockchainEventId}_${Date.now()}`;
    const signature = `sig_${Math.random().toString(36).substr(2, 44)}`;

    log.info('Event created on blockchain', {
      eventPda,
      signature,
    });

    return { eventPda, signature };
  }

  /**
   * Record blockchain sync in database
   */
  private async recordBlockchainSync(
    eventId: string,
    tenantId: string,
    result: { eventPda: string; signature: string }
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO blockchain_sync_history (
          event_id, tenant_id, event_pda, transaction_signature,
          status, synced_at, created_at
        ) VALUES ($1, $2, $3, $4, 'synced', NOW(), NOW())
        ON CONFLICT (event_id) DO UPDATE SET
          event_pda = $3,
          transaction_signature = $4,
          status = 'synced',
          synced_at = NOW(),
          updated_at = NOW()
      `, [eventId, tenantId, result.eventPda, result.signature]);

      log.debug('Blockchain sync recorded', { eventId });
    } catch (error: any) {
      // Table might not exist, log and continue
      log.warn('Failed to record blockchain sync', {
        eventId,
        error: error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Callback to event-service with blockchain status
   */
  private async callbackEventService(
    eventId: string,
    tenantId: string,
    status: BlockchainStatusCallback
  ): Promise<void> {
    const eventServiceUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:3011';
    const endpoint = `${eventServiceUrl}/internal/events/${eventId}/blockchain-status`;

    log.info('Calling back to event-service', {
      eventId,
      status: status.status,
      endpoint,
    });

    try {
      // In production, use HMAC-authenticated HTTP client
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service': 'blockchain-service',
          'x-tenant-id': tenantId,
          'x-trace-id': `blockchain-sync-${eventId}-${Date.now()}`,
          // TODO: Add HMAC signature header
        },
        body: JSON.stringify(status),
      });

      if (!response.ok) {
        throw new Error(`Event service returned ${response.status}`);
      }

      log.info('Callback to event-service successful', { eventId });
    } catch (error: any) {
      log.error('Failed to callback to event-service', {
        eventId,
        error: error.message,
      });
      // Don't throw - the blockchain sync was successful, callback failure is non-fatal
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.connection = null;
    this.channel = null;
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;

    if (this.maxReconnectAttempts > 0 &&
        this.reconnectAttempts > this.maxReconnectAttempts) {
      log.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.multiplier, this.reconnectAttempts - 1),
      RETRY_CONFIG.maxDelayMs
    );

    log.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(async () => {
      try {
        await this.start();
      } catch (error: any) {
        log.error('Reconnection failed', {
          attempt: this.reconnectAttempts,
          error: error.message,
        });
      }
    }, delay);
  }

  /**
   * Gracefully shutdown the consumer
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down Event Sync Consumer...');

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await (this.connection as any).close();
        this.connection = null;
      }
      await this.pool.end();

      this.isConnected = false;
      log.info('Event Sync Consumer shut down');
    } catch (error: any) {
      log.error('Error during shutdown', { error: error.message });
    }
  }
}

// Export singleton instance
export const eventSyncConsumer = new EventSyncConsumer();

export default EventSyncConsumer;
