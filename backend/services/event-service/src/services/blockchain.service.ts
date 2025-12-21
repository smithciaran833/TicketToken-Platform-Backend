/**
 * Blockchain Service for Event Service
 * 
 * Handles blockchain integration for event creation and management.
 * Wraps the shared BlockchainClient with event-specific logic.
 */

import {
  BlockchainClient,
  BlockchainConfig,
  CreateEventParams,
  CreateEventResult,
  BlockchainError,
  deriveVenuePDA,
} from '@tickettoken/shared';
import { PublicKey } from '@solana/web3.js';
import { pino } from 'pino';
import path from 'path';

const logger = pino({ name: 'event-blockchain-service' });

export interface EventBlockchainData {
  eventId: number;
  venueId: string;
  name: string;
  ticketPrice: number;
  totalTickets: number;
  startTime: Date;
  endTime: Date;
  refundWindow: number; // hours
  metadataUri: string;
  description: string;
  transferable: boolean;
  resaleable: boolean;
  merkleTree: string;
  artistWallet: string;
  artistPercentage: number; // percentage (5.00 = 5%)
  venuePercentage: number; // percentage (5.00 = 5%)
}

export class EventBlockchainService {
  private client: BlockchainClient | null = null;
  private programId: PublicKey;

  constructor() {
    // Initialize program ID from environment
    this.programId = new PublicKey(
      process.env.TICKETTOKEN_PROGRAM_ID || 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS'
    );
  }

  /**
   * Initializes the blockchain client (lazy loading)
   */
  private getClient(): BlockchainClient {
    if (!this.client) {
      const config: BlockchainConfig = {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        programId: process.env.TICKETTOKEN_PROGRAM_ID || 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS',
        platformWalletPath: process.env.PLATFORM_WALLET_PATH || 
          path.join(__dirname, '../../../minting-service/devnet-wallet.json'),
        commitment: 'confirmed',
      };

      this.client = new BlockchainClient(config);
      logger.info('BlockchainClient initialized for event-service');
    }

    return this.client;
  }

  /**
   * Creates an event on-chain with immutable royalty splits
   * 
   * @param eventData - Event data to create on blockchain
   * @returns Event PDA address and transaction signature
   */
  async createEventOnChain(eventData: EventBlockchainData): Promise<CreateEventResult> {
    try {
      logger.info(`Creating event ${eventData.eventId} on blockchain`, {
        eventId: eventData.eventId,
        venueId: eventData.venueId,
        artistPercentage: eventData.artistPercentage,
        venuePercentage: eventData.venuePercentage,
      });

      // Derive venue PDA (venues not yet on-chain, so we derive from venueId)
      const [venuePda] = deriveVenuePDA(this.programId, eventData.venueId);

      // Convert timestamps to Unix seconds
      const startTime = Math.floor(eventData.startTime.getTime() / 1000);
      const endTime = Math.floor(eventData.endTime.getTime() / 1000);
      const refundWindowSeconds = eventData.refundWindow * 3600; // hours to seconds

      // Convert percentages to basis points (5.00% -> 500 basis points)
      const artistPercentageBps = Math.round(eventData.artistPercentage * 100);
      const venuePercentageBps = Math.round(eventData.venuePercentage * 100);

      // Validate total doesn't exceed 100%
      if (artistPercentageBps + venuePercentageBps > 10000) {
        throw new Error(
          `Total royalty percentage cannot exceed 100% (artist: ${eventData.artistPercentage}%, venue: ${eventData.venuePercentage}%)`
        );
      }

      // Prepare blockchain parameters
      const blockchainParams: CreateEventParams = {
        eventId: eventData.eventId,
        venuePda: venuePda.toBase58(),
        name: eventData.name,
        ticketPrice: eventData.ticketPrice,
        totalTickets: eventData.totalTickets,
        startTime,
        endTime,
        refundWindow: refundWindowSeconds,
        metadataUri: eventData.metadataUri || '',
        oracleFeed: process.env.ORACLE_FEED_ADDRESS || PublicKey.default.toBase58(),
        description: eventData.description || '',
        transferable: eventData.transferable,
        resaleable: eventData.resaleable,
        merkleTree: eventData.merkleTree,
        artistWallet: eventData.artistWallet,
        artistPercentage: artistPercentageBps,
        venuePercentage: venuePercentageBps,
      };

      const client = this.getClient();
      const result = await client.createEvent(blockchainParams);

      logger.info(`Event ${eventData.eventId} created on blockchain`, {
        eventId: eventData.eventId,
        eventPda: result.eventPda,
        signature: result.signature,
      });

      return result;
    } catch (error) {
      logger.error(`Failed to create event ${eventData.eventId} on blockchain`, {
        eventId: eventData.eventId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Re-throw as BlockchainError for consistent error handling
      if (error instanceof BlockchainError) {
        throw error;
      }

      throw new BlockchainError(
        `Failed to create event on blockchain: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Derives the venue PDA for a given venue ID
   * Used when venue doesn't have blockchain integration yet
   * 
   * @param venueId - Venue identifier from database
   * @returns Venue PDA address
   */
  deriveVenuePDA(venueId: string): string {
    const [venuePda] = deriveVenuePDA(this.programId, venueId);
    return venuePda.toBase58();
  }

  /**
   * Closes the blockchain client and cleans up resources
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      logger.info('BlockchainClient closed');
    }
  }
}
