import { Pool } from 'pg';
import { Connection, Keypair, Transaction, PublicKey } from '@solana/web3.js';
import amqp, { Channel, Connection as AMQPConnection } from 'amqplib';
import { logger } from '../utils/logger';
import MetaplexService from '../services/MetaplexService';
import TransactionConfirmationService from '../services/TransactionConfirmationService';

const QUEUES = {
  TICKET_MINT: 'ticket.mint',
  BLOCKCHAIN_MINT: 'blockchain.mint'
};

interface MintJob {
  id?: string;
  orderId: string;
  ticketId?: string;
  userId?: string;
  eventId?: string;
  venueId?: string;
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
        const result = await this.pool.query(`
          SELECT * FROM mint_jobs
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1
        `);

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

  private async getVenueWallet(venueId: string): Promise<string | null> {
    try {
      const settingsResult = await this.pool.query(
        'SELECT royalty_wallet_address FROM venue_marketplace_settings WHERE venue_id = $1',
        [venueId]
      );

      if (settingsResult.rows.length > 0 && settingsResult.rows[0].royalty_wallet_address) {
        logger.info('Found venue royalty wallet', { 
          venueId, 
          wallet: settingsResult.rows[0].royalty_wallet_address 
        });
        return settingsResult.rows[0].royalty_wallet_address;
      }

      const venueResult = await this.pool.query(
        'SELECT wallet_address FROM venues WHERE id = $1',
        [venueId]
      );

      if (venueResult.rows.length > 0 && venueResult.rows[0].wallet_address) {
        logger.info('Found venue wallet', { 
          venueId, 
          wallet: venueResult.rows[0].wallet_address 
        });
        return venueResult.rows[0].wallet_address;
      }

      logger.warn('No wallet address found for venue', { venueId });
      return null;

    } catch (error: any) {
      logger.error('Failed to fetch venue wallet', { 
        venueId, 
        error: error.message 
      });
      return null;
    }
  }

  private getPlatformWallet(): string {
    return process.env.PLATFORM_TREASURY_WALLET || this.mintWallet.publicKey.toString();
  }

  async processMintJob(job: MintJob): Promise<void> {
    try {
      // Get ticket details for metadata
      const ticketResult = await this.pool.query(`
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

      if (ticketResult.rows.length === 0) {
        throw new Error(`No ticket found for order ${job.orderId}`);
      }

      const ticket = ticketResult.rows[0];

      // Get venue wallet for royalties
      let venueWallet: string | null = null;
      if (job.venueId) {
        venueWallet = await this.getVenueWallet(job.venueId);
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
      const nftMetadata = {
        name: `${ticket.event_name} - Ticket #${ticket.seat_number || 'GA'}`,
        symbol: 'TICKET',
        description: ticket.event_description || `Ticket for ${ticket.event_name}`,
        image: job.metadata?.image || 'https://placeholder.com/ticket.png',
        attributes: [
          {
            trait_type: 'Event',
            value: ticket.event_name
          },
          {
            trait_type: 'Venue',
            value: ticket.venue_name || 'Unknown'
          },
          {
            trait_type: 'Section',
            value: ticket.section || 'General Admission'
          },
          ...(ticket.seat_number ? [{
            trait_type: 'Seat',
            value: ticket.seat_number
          }] : []),
          {
            trait_type: 'Ticket Type',
            value: ticket.ticket_type || 'Standard'
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

      // Update ticket with mint address
      await this.pool.query(`
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

      logger.info('NFT minted successfully', { 
        mintAddress: mintResult.mintAddress,
        signature: mintResult.transactionSignature,
        orderId: job.orderId,
        metadataUri: mintResult.metadataUri
      });

      // Update job status
      if (job.id) {
        await this.pool.query(`
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

      // Update job with failure status
      if (job.id) {
        await this.pool.query(`
          UPDATE mint_jobs
          SET status = 'failed',
              error = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [error.message, job.id]);
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
