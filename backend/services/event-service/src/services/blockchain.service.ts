/**
 * Blockchain Service for Event Service
 * 
 * Handles blockchain integration for event creation and management.
 * Wraps the shared BlockchainClient with event-specific logic.
 * 
 * CRITICAL SECURITY FIX:
 * - Issue #4: Added tenant validation before blockchain operations
 * - Issue #5: Tenant context now required for all blockchain operations
 * 
 * HIGH PRIORITY RESILIENCE FIXES:
 * - Issue #7: Added circuit breaker for blockchain calls
 * - Issue #8: Added timeout configuration (15s)
 * - Issue #9: Added retry logic with exponential backoff
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
import CircuitBreaker from 'opossum';
import { venueServiceClient } from './venue-service.client';
import { ForbiddenError } from '../types';
import { withRetry } from '../utils/retry';

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
  private circuitBreaker: CircuitBreaker;

  constructor() {
    // Initialize program ID from environment
    this.programId = new PublicKey(
      process.env.TICKETTOKEN_PROGRAM_ID || 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS'
    );

    // HIGH PRIORITY FIX: Circuit breaker for blockchain operations
    this.circuitBreaker = new CircuitBreaker(this.createEventInternal.bind(this), {
      timeout: 15000, // 15s timeout for blockchain transactions
      errorThresholdPercentage: 50,
      resetTimeout: 60000, // 1 minute before attempting again
      volumeThreshold: 3, // Minimum 3 requests before opening circuit
      name: 'blockchain-service',
    });

    // Log circuit breaker events
    this.circuitBreaker.on('open', () => {
      logger.error('Blockchain circuit breaker opened - too many failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Blockchain circuit breaker half-open - testing connection');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('Blockchain circuit breaker closed - normal operation resumed');
    });

    this.circuitBreaker.on('timeout', () => {
      logger.warn('Blockchain operation timed out after 15s');
    });
  }

  /**
   * Initializes the blockchain client (lazy loading)
   * MEDIUM PRIORITY FIX (Issue #24): Added error handling for wallet file read
   */
  private getClient(): BlockchainClient {
    if (!this.client) {
      // MEDIUM PRIORITY FIX: Validate wallet path before initialization
      const walletPath = process.env.PLATFORM_WALLET_PATH || 
        path.join(__dirname, '../../../minting-service/devnet-wallet.json');
      
      try {
        // Check if wallet file exists (BlockchainClient will read it)
        const fs = require('fs');
        if (!fs.existsSync(walletPath)) {
          throw new BlockchainError(
            `Platform wallet file not found at path: ${walletPath}. ` +
            `Please ensure PLATFORM_WALLET_PATH environment variable is set correctly ` +
            `or the default wallet exists at the expected location.`
          );
        }

        const config: BlockchainConfig = {
          rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          programId: process.env.TICKETTOKEN_PROGRAM_ID || 'BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS',
          platformWalletPath: walletPath,
          commitment: 'confirmed',
        };

        this.client = new BlockchainClient(config);
        logger.info({ walletPath, rpcUrl: config.rpcUrl }, 'BlockchainClient initialized for event-service');
      } catch (error) {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          walletPath 
        }, 'Failed to initialize BlockchainClient');
        
        if (error instanceof BlockchainError) {
          throw error;
        }
        
        throw new BlockchainError(
          `Failed to initialize blockchain client: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return this.client;
  }

  /**
   * Creates an event on-chain with immutable royalty splits
   * 
   * CRITICAL SECURITY FIX: Now validates venue belongs to tenant before blockchain operation
   * HIGH PRIORITY RESILIENCE: Uses circuit breaker, retry, and timeout
   * 
   * @param eventData - Event data to create on blockchain
   * @param tenantId - Tenant identifier for security validation
   * @returns Event PDA address and transaction signature
   */
  async createEventOnChain(eventData: EventBlockchainData, tenantId: string): Promise<CreateEventResult> {
    try {
      logger.info(`Creating event ${eventData.eventId} on blockchain`, {
        eventId: eventData.eventId,
        venueId: eventData.venueId,
        tenantId,
        artistPercentage: eventData.artistPercentage,
        venuePercentage: eventData.venuePercentage,
      });

      // CRITICAL SECURITY CHECK: Validate venue belongs to tenant before blockchain operation
      await this.validateVenueTenant(eventData.venueId, tenantId);

      // HIGH PRIORITY FIX: Use circuit breaker with retry logic
      return await withRetry(
        () => this.circuitBreaker.fire(eventData, tenantId),
        {
          maxRetries: 2, // Retry up to 2 times (3 total attempts)
          initialDelayMs: 1000, // Start with 1s delay
          maxDelayMs: 5000, // Cap at 5s
          operationName: 'blockchain-createEvent',
          retryOn: (error: any) => {
            // Only retry on transient errors
            return this.isTransientBlockchainError(error);
          },
        }
      );
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
   * Internal method called by circuit breaker
   * HIGH PRIORITY FIX: Separated for circuit breaker wrapping
   */
  private async createEventInternal(eventData: EventBlockchainData, tenantId: string): Promise<CreateEventResult> {

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
      tenantId,
    });

    return result;
  }

  /**
   * HIGH PRIORITY FIX: Determine if blockchain error is transient and retryable
   * 
   * @param error - The error to check
   * @returns true if error should be retried
   */
  private isTransientBlockchainError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    // RPC rate limiting
    if (error.message?.includes('rate limit') ||
        error.message?.includes('429') ||
        error.message?.includes('Too Many Requests')) {
      return true;
    }

    // Temporary RPC failures
    if (error.message?.includes('blockhash') ||
        error.message?.includes('not confirmed') ||
        error.message?.includes('timeout')) {
      return true;
    }

    // Circuit breaker open
    if (error.message?.includes('circuit') ||
        error.message?.includes('breaker')) {
      return false; // Don't retry if circuit is open
    }

    // Don't retry permanent errors
    return false;
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
   * CRITICAL SECURITY: Validate that venue belongs to the tenant
   * Prevents cross-tenant blockchain event creation
   * 
   * @param venueId - Venue identifier to validate
   * @param tenantId - Tenant identifier
   * @throws ForbiddenError if venue doesn't belong to tenant
   */
  private async validateVenueTenant(venueId: string, tenantId: string): Promise<void> {
    try {
      // Attempt to get venue with tenant context
      const venue = await venueServiceClient.getVenue(venueId, tenantId);
      
      // If venue service is in degraded mode, we got a default response
      if (venue._degraded) {
        logger.error({
          venueId,
          tenantId,
          degraded: true,
        }, 'Cannot validate venue ownership for blockchain operation - venue service unavailable');
        throw new ForbiddenError(
          'Cannot create blockchain event - venue service unavailable for validation'
        );
      }

      // Verify venue exists and is accessible
      if (!venue || !venue.id) {
        logger.error({
          venueId,
          tenantId,
        }, 'Venue not found or not accessible for tenant');
        throw new ForbiddenError(
          'Venue does not exist or you do not have access to it'
        );
      }

      logger.info({
        venueId,
        tenantId,
        venueName: venue.name,
      }, 'Venue ownership validated for blockchain operation');
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      logger.error({
        venueId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to validate venue ownership for blockchain operation');

      throw new ForbiddenError(
        'Failed to validate venue access for blockchain operation'
      );
    }
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
