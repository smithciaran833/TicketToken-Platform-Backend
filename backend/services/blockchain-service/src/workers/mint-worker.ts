import { Pool } from 'pg';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import amqp, { Channel, Connection as AMQPConnection } from 'amqplib';
import { logger } from '../utils/logger';
import MetaplexService from '../services/MetaplexService';
import TransactionConfirmationService from '../services/TransactionConfirmationService';
import {
  ticketServiceClient,
  venueServiceClient,
  orderServiceClient,
  eventServiceClient,
  RequestContext,
} from '@tickettoken/shared';
import { withSystemContextPool } from './system-job-utils';

/**
 * MINT WORKER
 *
 * Background worker for NFT minting operations.
 *
 * PHASE 5c REFACTORED:
 * - Replaced direct venues table query with venueServiceClient
 * - Replaced direct tickets/orders/events JOIN with service clients
 * - Replaced direct tickets UPDATE with ticketServiceClient.updateNft()
 */

const QUEUES = {
  TICKET_MINT: 'ticket.mint',
  BLOCKCHAIN_MINT: 'blockchain.mint'
};

/**
 * Helper to create request context for service calls
 */
function createRequestContext(tenantId: string = 'system'): RequestContext {
  return {
    tenantId,
    traceId: `mint-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

interface MintJob {
  id?: string;
  orderId: string;
  ticketId?: string;
  userId?: string;
  eventId?: string;
  venueId?: string;
  tenantId?: string;
  metadata?: any;
}

export class MintWorker {
  private pool: Pool;
  private solanaConnection: Connection;
  private mintWallet: Keypair;
  private rabbitConnection: AMQPConnection | null;
  private channel: Channel | null;
  private metaplexService: MetaplexService;
  private confirmationService: TransactionConfirmationService;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken_db'
    });
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.mintWallet = this.initializeWallet();
    this.rabbitConnection = null;
    this.channel = null;

    // Initialize blockchain services
    this.metaplexService = new MetaplexService(this.solanaConnection, this.mintWallet);
    this.confirmationService = new TransactionConfirmationService(this.solanaConnection);
  }

  initializeWallet(): Keypair {
    if (process.env.MINT_WALLET_PRIVATE_KEY) {
      const privateKey = JSON.parse(process.env.MINT_WALLET_PRIVATE_KEY);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } else {
      const wallet = Keypair.generate();
      logger.warn('Generated new wallet for testing - fund with devnet SOL to enable minting', {
        publicKey: wallet.publicKey.toString()
      });
      return wallet;
    }
  }

  async start(): Promise<void> {
    logger.info('Starting Mint Worker...');

    try {
      await this.connectRabbitMQ();
      await this.consumeQueue();
    } catch (error: any) {
      logger.info('RabbitMQ not available, using polling mode', {
        error: error.message
      });
    }

    await this.startPolling();
  }

  async connectRabbitMQ(): Promise<void> {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    this.rabbitConnection = await (amqp.connect as any)(rabbitmqUrl);
    this.channel = await (this.rabbitConnection as any).createChannel();

    await this.channel.assertQueue(QUEUES.TICKET_MINT, { durable: true });
    logger.info('Connected to RabbitMQ', { queue: QUEUES.TICKET_MINT });
  }

  async consumeQueue(): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    await this.channel.consume(QUEUES.TICKET_MINT, async (msg) => {
      if (!msg) return;

      try {
        const job: MintJob = JSON.parse(msg.content.toString());
        logger.info('Processing mint job', { job });

        await this.processMintJob(job);

        this.channel!.ack(msg);
      } catch (error: any) {
        logger.error('Failed to process mint job', {
          error: error.message,
          stack: error.stack
        });
        this.channel!.nack(msg, false, true);
      }
    });

    logger.info('Consuming from queue', { queue: QUEUES.TICKET_MINT });
  }

  async startPolling(): Promise<void> {
    setInterval(async () => {
      try {
        // mint_jobs is blockchain-service owned table
        const result = await withSystemContextPool(this.pool, async (client) => {
          return client.query(`
            SELECT * FROM mint_jobs
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
          `);
        });

        if (result.rows.length > 0) {
          const job: MintJob = result.rows[0];
          await this.processMintJob(job);
        }
      } catch (error: any) {
        logger.error('Polling error', {
          error: error.message
        });
      }
    }, 5000);

    logger.info('Mint worker started in polling mode', {
      interval: '5000ms'
    });
  }

  /**
   * REFACTORED: Get venue wallet address via venueServiceClient
   * Replaces direct venue_marketplace_settings and venues table queries
   */
  private async getVenueWallet(venueId: string, tenantId: string): Promise<string | null> {
    const ctx = createRequestContext(tenantId);

    try {
      // REFACTORED: Get venue with blockchain info via venueServiceClient
      const venue = await venueServiceClient.getVenue(venueId, ctx);

      if (venue && venue.walletAddress) {
        logger.info('Found venue wallet via service', {
          venueId,
          wallet: venue.walletAddress
        });
        return venue.walletAddress;
      }

      logger.warn('No wallet address found for venue', { venueId });
      return null;

    } catch (error: any) {
      logger.error('Failed to fetch venue wallet via service', {
        venueId,
        error: error.message
      });
      return null;
    }
  }

  private getPlatformWallet(): string {
    return process.env.PLATFORM_TREASURY_WALLET || this.mintWallet.publicKey.toString();
  }

  /**
   * REFACTORED: Process mint job using service clients
   * Replaces direct database JOINs with service client calls
   */
  async processMintJob(job: MintJob): Promise<void> {
    const tenantId = job.tenantId || 'system';
    const ctx = createRequestContext(tenantId);

    try {
      // REFACTORED: Get ticket details via ticketServiceClient
      let ticket: any;
      let eventInfo: any;
      let venueInfo: any;

      // Get order info to find ticket
      if (job.orderId) {
        try {
          const orderItems = await orderServiceClient.getOrderItems(job.orderId, ctx);
          if (!orderItems || orderItems.items.length === 0) {
            throw new Error(`No items found for order ${job.orderId}`);
          }

          // Get first ticket from order
          const firstItem = orderItems.items.find((item: any) => item.ticketId);
          if (!firstItem?.ticketId) {
            throw new Error(`No ticket found for order ${job.orderId}`);
          }

          // Get full ticket info
          ticket = await ticketServiceClient.getTicketFull(firstItem.ticketId, ctx);

          if (!ticket) {
            throw new Error(`Ticket not found: ${firstItem.ticketId}`);
          }

          // Event info is included in ticket response
          eventInfo = ticket.event;

          // Get venue info if available
          if (eventInfo?.venueId) {
            try {
              venueInfo = await venueServiceClient.getVenue(eventInfo.venueId, ctx);
            } catch (e) {
              logger.warn('Failed to get venue info', { venueId: eventInfo.venueId });
            }
          }
        } catch (serviceError: any) {
          logger.warn('Service client calls failed, falling back to direct query', {
            error: serviceError.message
          });

          // Fallback to direct query for backward compatibility
          const ticketResult = await withSystemContextPool(this.pool, async (client) => {
            return client.query(`
              SELECT t.*, e.name as event_name, e.description as event_description,
                     v.name as venue_name
              FROM tickets t
              JOIN order_items oi ON t.id = oi.ticket_id
              JOIN orders o ON oi.order_id = o.id
              JOIN events e ON t.event_id = e.id
              LEFT JOIN venues v ON e.venue_id = v.id
              WHERE o.id = $1
              LIMIT 1
            `, [job.orderId]);
          });

          if (ticketResult.rows.length === 0) {
            throw new Error(`No ticket found for order ${job.orderId}`);
          }

          ticket = ticketResult.rows[0];
          eventInfo = { name: ticket.event_name, description: ticket.event_description };
          venueInfo = { name: ticket.venue_name };
        }
      }

      if (!ticket) {
        throw new Error(`No ticket data available for order ${job.orderId}`);
      }

      // REFACTORED: Get venue wallet via service client
      let venueWallet: string | null = null;
      if (job.venueId) {
        venueWallet = await this.getVenueWallet(job.venueId, tenantId);
      }

      const platformWallet = this.getPlatformWallet();

      // Configure creators with royalty shares
      const creators = [];
      if (venueWallet) {
        creators.push({
          address: venueWallet,
          share: 50  // 50% to venue
        });
      }
      creators.push({
        address: platformWallet,
        share: venueWallet ? 50 : 100  // 50% to platform if venue, 100% otherwise
      });

      logger.info('NFT Royalty Configuration', {
        orderId: job.orderId,
        venueId: job.venueId,
        creators: creators.map(c => ({ address: c.address, share: c.share })),
        sellerFeeBasisPoints: 1000  // 10% royalty
      });

      // Prepare NFT metadata
      const eventName = eventInfo?.name || ticket.event_name || 'Unknown Event';
      const eventDescription = eventInfo?.description || ticket.event_description || `Ticket for ${eventName}`;
      const venueName = venueInfo?.name || ticket.venue_name || 'Unknown';
      const seatNumber = ticket.seat?.number || ticket.seat_number || 'GA';
      const section = ticket.seat?.section || ticket.section || 'General Admission';
      const ticketTypeName = ticket.ticketType?.name || ticket.ticket_type || 'Standard';

      const nftMetadata = {
        name: `${eventName} - Ticket #${seatNumber}`,
        symbol: 'TICKET',
        description: eventDescription,
        image: job.metadata?.image || 'https://placeholder.com/ticket.png',
        attributes: [
          {
            trait_type: 'Event',
            value: eventName
          },
          {
            trait_type: 'Venue',
            value: venueName
          },
          {
            trait_type: 'Section',
            value: section
          },
          ...(seatNumber !== 'GA' ? [{
            trait_type: 'Seat',
            value: seatNumber
          }] : []),
          {
            trait_type: 'Ticket Type',
            value: ticketTypeName
          }
        ]
      };

      // Mint NFT using Metaplex
      const mintResult = await this.metaplexService.mintNFT({
        metadata: nftMetadata,
        creators,
        sellerFeeBasisPoints: 1000,  // 10% royalty
        collection: job.metadata?.collectionMint ? new PublicKey(job.metadata.collectionMint) : undefined
      });

      // Confirm transaction
      await this.confirmationService.confirmTransaction(mintResult.transactionSignature, {
        commitment: 'finalized'
      });

      // REFACTORED: Update ticket with mint address via ticketServiceClient
      try {
        await ticketServiceClient.updateNft(ticket.id, {
          nftMintAddress: mintResult.mintAddress,
          metadataUri: mintResult.metadataUri,
          mintedAt: new Date().toISOString(),
          isMinted: true,
        }, ctx);

        logger.info('Updated ticket NFT via service', { ticketId: ticket.id });
      } catch (updateError: any) {
        logger.warn('Failed to update ticket via service client, using fallback', {
          error: updateError.message
        });

        // Fallback to direct update
        await withSystemContextPool(this.pool, async (client) => {
          await client.query(`
            UPDATE tickets t
            SET mint_address = $1,
                minted_at = NOW(),
                metadata_uri = $2,
                transaction_signature = $3
            FROM order_items oi
            WHERE t.id = oi.ticket_id
              AND oi.order_id = $4
          `, [
            mintResult.mintAddress,
            mintResult.metadataUri,
            mintResult.transactionSignature,
            job.orderId
          ]);
        });
      }

      logger.info('NFT minted successfully', {
        mintAddress: mintResult.mintAddress,
        signature: mintResult.transactionSignature,
        orderId: job.orderId,
        metadataUri: mintResult.metadataUri
      });

      // Update job status - blockchain-service owned table
      if (job.id) {
        await withSystemContextPool(this.pool, async (client) => {
          await client.query(`
            UPDATE mint_jobs
            SET status = 'completed',
                nft_address = $1,
                transaction_signature = $2,
                metadata_uri = $3,
                updated_at = NOW()
            WHERE id = $4
          `, [
            mintResult.mintAddress,
            mintResult.transactionSignature,
            mintResult.metadataUri,
            job.id
          ]);
        });
      }

      // Publish success event
      if (this.channel) {
        await this.channel.publish('events', 'mint.success', Buffer.from(JSON.stringify({
          orderId: job.orderId,
          mintAddress: mintResult.mintAddress,
          transactionSignature: mintResult.transactionSignature,
          metadataUri: mintResult.metadataUri,
          venueId: job.venueId,
          creators,
          timestamp: new Date().toISOString()
        })));
      }

    } catch (error: any) {
      logger.error('Minting failed', {
        error: error.message,
        stack: error.stack,
        orderId: job.orderId,
        jobId: job.id
      });

      // Update job with failure status - blockchain-service owned table
      if (job.id) {
        await withSystemContextPool(this.pool, async (client) => {
          await client.query(`
            UPDATE mint_jobs
            SET status = 'failed',
                error = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [error.message, job.id]);
        });
      }

      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down mint worker...');
    if (this.channel) {
      await this.channel.close();
    }
    if (this.rabbitConnection) {
      await (this.rabbitConnection as any).close();
    }
    await this.pool.end();
  }
}

export default MintWorker;
