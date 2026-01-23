/**
 * Minting Service Client
 *
 * Client for communicating with minting-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: ticket-service, blockchain-service, queue-service
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Token metadata for minting
 */
export interface TokenMetadata {
  /** Event name */
  eventName: string;
  /** Event date ISO string */
  eventDate: string;
  /** Venue name */
  venue: string;
  /** Ticket type/section */
  ticketType: string;
  /** Seat information if applicable */
  seat?: string;
  /** Row information if applicable */
  row?: string;
  /** Section information if applicable */
  section?: string;
  /** Image URL for the NFT */
  imageUrl?: string;
  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Request body for single ticket minting
 */
export interface MintTicketRequest {
  /** Ticket ID to mint */
  ticketId: string;
  /** Wallet address to mint to */
  walletAddress: string;
  /** Token metadata */
  metadata: TokenMetadata;
  /** Priority level (higher = faster processing) */
  priority?: 'low' | 'normal' | 'high';
  /** Idempotency key to prevent duplicate mints */
  idempotencyKey?: string;
}

/**
 * Response from single ticket mint
 */
export interface MintTicketResponse {
  /** Whether mint was queued successfully */
  success: boolean;
  /** Mint job ID for tracking */
  mintJobId: string;
  /** Current status of the mint */
  status: MintStatus;
  /** Estimated completion time */
  estimatedCompletionTime?: string;
  /** Message */
  message?: string;
}

/**
 * Request body for batch ticket minting
 */
export interface MintBatchRequest {
  /** Array of tickets to mint */
  tickets: Array<{
    ticketId: string;
    walletAddress: string;
    metadata: TokenMetadata;
  }>;
  /** Priority level for entire batch */
  priority?: 'low' | 'normal' | 'high';
  /** Batch idempotency key */
  idempotencyKey?: string;
}

/**
 * Response from batch mint
 */
export interface MintBatchResponse {
  /** Whether batch was queued successfully */
  success: boolean;
  /** Batch job ID */
  batchJobId: string;
  /** Individual mint job IDs */
  mintJobIds: string[];
  /** Number of tickets queued */
  queuedCount: number;
  /** Any tickets that failed to queue */
  failedTickets?: Array<{
    ticketId: string;
    error: string;
  }>;
}

/**
 * Mint status values
 */
export type MintStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'confirming'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Response from mint status check
 */
export interface MintStatusResponse {
  /** Ticket ID */
  ticketId: string;
  /** Current mint status */
  status: MintStatus;
  /** Blockchain token ID (if minted) */
  tokenId?: string;
  /** Transaction hash (if submitted) */
  transactionHash?: string;
  /** Block number (if confirmed) */
  blockNumber?: number;
  /** Contract address */
  contractAddress?: string;
  /** Error message if failed */
  error?: string;
  /** Number of retry attempts */
  retryCount?: number;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Request to queue tickets for minting (used by blockchain-service)
 */
export interface QueueMintRequest {
  /** Array of ticket IDs to mint */
  ticketIds: string[];
  /** Event ID the tickets belong to */
  eventId: string;
  /** User ID who owns the tickets */
  userId: string;
  /** Queue name for job processing */
  queue?: string;
}

/**
 * Response from queuing tickets for minting
 */
export interface QueueMintResponse {
  /** Whether queuing succeeded */
  success: boolean;
  /** Job ID for tracking */
  jobId?: string;
  /** Number of tickets queued */
  queuedCount: number;
  /** Message */
  message?: string;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for minting-service internal APIs
 *
 * @example
 * ```typescript
 * const client = new MintingServiceClient();
 *
 * // Mint a single ticket
 * const result = await client.mintTicket({
 *   ticketId: 'ticket-123',
 *   walletAddress: '0x...',
 *   metadata: { eventName: 'Concert', eventDate: '2024-01-01', venue: 'Arena', ticketType: 'VIP' }
 * }, ctx);
 *
 * // Check mint status
 * const status = await client.getMintStatus('ticket-123', ctx);
 * ```
 */
export class MintingServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.MINTING_SERVICE_URL || 'http://minting-service:3012',
      serviceName: 'minting-service',
      timeout: 30000, // Longer timeout for blockchain operations
    });
  }

  /**
   * Mint a single ticket as an NFT
   *
   * @param request - Mint request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Mint job response with tracking ID
   */
  async mintTicket(
    request: MintTicketRequest,
    ctx: RequestContext
  ): Promise<MintTicketResponse> {
    const response = await this.post<MintTicketResponse>(
      '/internal/mint',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Mint multiple tickets in a batch operation
   *
   * @param request - Batch mint request with array of tickets
   * @param ctx - Request context with tenant/user IDs
   * @returns Batch job response with individual tracking IDs
   */
  async mintBatch(
    request: MintBatchRequest,
    ctx: RequestContext
  ): Promise<MintBatchResponse> {
    const response = await this.post<MintBatchResponse>(
      '/internal/mint/batch',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Get the current minting status for a ticket
   *
   * @param ticketId - The ticket ID to check
   * @param ctx - Request context with tenant/user IDs
   * @returns Current mint status and blockchain details
   */
  async getMintStatus(
    ticketId: string,
    ctx: RequestContext
  ): Promise<MintStatusResponse> {
    const response = await this.get<MintStatusResponse>(
      `/internal/mint/status/${ticketId}`,
      ctx
    );
    return response.data;
  }

  /**
   * Check if a ticket has been successfully minted
   *
   * @param ticketId - The ticket ID to check
   * @param ctx - Request context with tenant/user IDs
   * @returns true if ticket is minted and confirmed
   */
  async isTicketMinted(ticketId: string, ctx: RequestContext): Promise<boolean> {
    try {
      const status = await this.getMintStatus(ticketId, ctx);
      return status.status === 'completed' && !!status.tokenId;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get token ID for a minted ticket
   *
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Token ID or null if not minted
   */
  async getTokenId(ticketId: string, ctx: RequestContext): Promise<string | null> {
    try {
      const status = await this.getMintStatus(ticketId, ctx);
      return status.tokenId || null;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Queue multiple tickets for minting by IDs
   * Used by blockchain-service to forward mint requests
   *
   * @param request - Queue mint request with ticket IDs
   * @param ctx - Request context with tenant/user IDs
   * @returns Queue result
   */
  async queueMint(
    request: QueueMintRequest,
    ctx: RequestContext
  ): Promise<QueueMintResponse> {
    const response = await this.post<QueueMintResponse>(
      '/internal/mint',
      ctx,
      request
    );
    return response.data;
  }
}

/** Singleton instance of MintingServiceClient */
export const mintingServiceClient = new MintingServiceClient();
