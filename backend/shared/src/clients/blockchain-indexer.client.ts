/**
 * Blockchain Indexer Client
 *
 * Client for communicating with blockchain-indexer internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: payment-service
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Transaction status values
 */
export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'dropped';

/**
 * NFT ownership record
 */
export interface NftOwnership {
  /** Wallet address of owner */
  ownerAddress: string;
  /** When ownership was acquired */
  acquiredAt: string;
  /** Transaction hash of acquisition */
  acquisitionTxHash: string;
}

/**
 * NFT transfer record
 */
export interface NftTransfer {
  /** From wallet address */
  fromAddress: string;
  /** To wallet address */
  toAddress: string;
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
  /** Timestamp */
  timestamp: string;
  /** Transfer type */
  type: 'mint' | 'transfer' | 'sale';
}

/**
 * NFT details response
 */
export interface NftDetailsResponse {
  /** Token ID */
  tokenId: string;
  /** Contract address */
  contractAddress: string;
  /** Current owner address */
  ownerAddress: string;
  /** Token URI (metadata URL) */
  tokenUri?: string;
  /** Metadata (if fetched) */
  metadata?: Record<string, unknown>;
  /** Mint transaction hash */
  mintTxHash: string;
  /** Block number when minted */
  mintBlockNumber: number;
  /** When minted */
  mintedAt: string;
  /** Transfer history */
  transfers: NftTransfer[];
  /** Whether token is currently listed for sale */
  isListed: boolean;
  /** Listing price if listed */
  listingPrice?: number;
  /** Listing currency */
  listingCurrency?: string;
}

/**
 * Transaction details response
 */
export interface TransactionDetailsResponse {
  /** Transaction hash */
  txHash: string;
  /** Block number (if confirmed) */
  blockNumber?: number;
  /** Transaction status */
  status: TransactionStatus;
  /** From address */
  fromAddress: string;
  /** To address */
  toAddress: string;
  /** Value in wei */
  value: string;
  /** Gas used */
  gasUsed?: number;
  /** Gas price in wei */
  gasPrice?: string;
  /** Transaction fee in wei */
  transactionFee?: string;
  /** Number of confirmations */
  confirmations: number;
  /** Block timestamp */
  timestamp?: string;
  /** Contract method called (if applicable) */
  methodName?: string;
  /** Decoded input data (if applicable) */
  decodedInput?: Record<string, unknown>;
  /** Events emitted */
  events?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Request to record a marketplace sale
 */
export interface RecordMarketplaceSaleRequest {
  /** Token ID */
  tokenId: string;
  /** Contract address */
  contractAddress: string;
  /** Seller wallet address */
  sellerAddress: string;
  /** Buyer wallet address */
  buyerAddress: string;
  /** Sale price in smallest unit */
  price: number;
  /** Currency */
  currency: string;
  /** Transaction hash of the sale */
  txHash: string;
  /** Platform listing ID */
  listingId: string;
  /** Platform transfer ID */
  transferId?: string;
  /** Sale timestamp */
  saleTimestamp: string;
  /** Platform fee amount */
  platformFee?: number;
  /** Royalty amount */
  royaltyAmount?: number;
  /** Royalty recipient */
  royaltyRecipient?: string;
}

/**
 * Response from recording marketplace sale
 */
export interface RecordMarketplaceSaleResponse {
  /** Whether recording succeeded */
  success: boolean;
  /** Sale record ID */
  saleId: string;
  /** Message */
  message?: string;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for blockchain-indexer internal APIs
 *
 * @example
 * ```typescript
 * const client = new BlockchainIndexerClient();
 *
 * // Record a marketplace sale
 * await client.recordMarketplaceSale({
 *   tokenId: '12345',
 *   contractAddress: '0x...',
 *   sellerAddress: '0xSeller...',
 *   buyerAddress: '0xBuyer...',
 *   price: 100000000,
 *   currency: 'USDC',
 *   txHash: '0xabc...',
 *   listingId: 'listing-123',
 *   saleTimestamp: new Date().toISOString()
 * }, ctx);
 *
 * // Get NFT details
 * const nft = await client.getNftDetails('12345', ctx);
 *
 * // Check transaction status
 * const tx = await client.getTransactionStatus('0xabc...', ctx);
 * ```
 */
export class BlockchainIndexerClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.BLOCKCHAIN_INDEXER_URL || 'http://blockchain-indexer:3017',
      serviceName: 'blockchain-indexer',
      timeout: 30000, // Longer timeout for blockchain queries
    });
  }

  /**
   * Record a marketplace sale in the indexer
   *
   * @param sale - Sale details to record
   * @param ctx - Request context with tenant/user IDs
   * @returns Recording result
   */
  async recordMarketplaceSale(
    sale: RecordMarketplaceSaleRequest,
    ctx: RequestContext
  ): Promise<RecordMarketplaceSaleResponse> {
    const response = await this.post<RecordMarketplaceSaleResponse>(
      '/internal/marketplace/sales',
      ctx,
      sale
    );
    return response.data;
  }

  /**
   * Get NFT details by token ID
   *
   * @param tokenId - The token ID
   * @param ctx - Request context with tenant/user IDs
   * @returns NFT details including ownership and transfers
   */
  async getNftDetails(
    tokenId: string,
    ctx: RequestContext
  ): Promise<NftDetailsResponse> {
    const response = await this.get<NftDetailsResponse>(
      `/internal/nfts/${tokenId}`,
      ctx
    );
    return response.data;
  }

  /**
   * Get NFT details, returning null if not found
   *
   * @param tokenId - The token ID
   * @param ctx - Request context with tenant/user IDs
   * @returns NFT details or null
   */
  async getNftDetailsSafe(
    tokenId: string,
    ctx: RequestContext
  ): Promise<NftDetailsResponse | null> {
    try {
      return await this.getNftDetails(tokenId, ctx);
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get transaction status by hash
   *
   * @param txHash - The transaction hash
   * @param ctx - Request context with tenant/user IDs
   * @returns Transaction details and status
   */
  async getTransactionStatus(
    txHash: string,
    ctx: RequestContext
  ): Promise<TransactionDetailsResponse> {
    const response = await this.get<TransactionDetailsResponse>(
      `/internal/transactions/${txHash}`,
      ctx
    );
    return response.data;
  }

  /**
   * Get transaction status, returning null if not found
   *
   * @param txHash - The transaction hash
   * @param ctx - Request context with tenant/user IDs
   * @returns Transaction details or null
   */
  async getTransactionStatusSafe(
    txHash: string,
    ctx: RequestContext
  ): Promise<TransactionDetailsResponse | null> {
    try {
      return await this.getTransactionStatus(txHash, ctx);
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if a transaction is confirmed (helper method)
   *
   * @param txHash - The transaction hash
   * @param ctx - Request context with tenant/user IDs
   * @param minConfirmations - Minimum confirmations required (default: 1)
   * @returns true if transaction is confirmed with enough confirmations
   */
  async isTransactionConfirmed(
    txHash: string,
    ctx: RequestContext,
    minConfirmations: number = 1
  ): Promise<boolean> {
    try {
      const tx = await this.getTransactionStatus(txHash, ctx);
      return tx.status === 'confirmed' && tx.confirmations >= minConfirmations;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get current owner of an NFT (helper method)
   *
   * @param tokenId - The token ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Owner address or null if not found
   */
  async getNftOwner(
    tokenId: string,
    ctx: RequestContext
  ): Promise<string | null> {
    try {
      const nft = await this.getNftDetails(tokenId, ctx);
      return nft.ownerAddress;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if NFT is listed for sale (helper method)
   *
   * @param tokenId - The token ID
   * @param ctx - Request context with tenant/user IDs
   * @returns true if NFT is currently listed
   */
  async isNftListed(tokenId: string, ctx: RequestContext): Promise<boolean> {
    try {
      const nft = await this.getNftDetails(tokenId, ctx);
      return nft.isListed;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

/** Singleton instance of BlockchainIndexerClient */
export const blockchainIndexerClient = new BlockchainIndexerClient();
