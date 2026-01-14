import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';
import axios from 'axios';

// Solana configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS;
const COLLECTION_MINT = process.env.COLLECTION_MINT_ADDRESS;
const MINTING_SERVICE_URL = process.env.MINTING_SERVICE_URL || 'http://minting-service:3000';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

interface NFTMintJobData {
  eventId: string;
  ticketId: string;
  seatId?: string;
  userId: string;
  venueId: string;
  tenantId?: string;
  ownerWallet: string;
  metadata: NFTMetadata;
}

interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  externalUrl?: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties?: {
    files?: Array<{ uri: string; type: string }>;
    category?: string;
  };
}

interface MintResult {
  success: boolean;
  mintAddress?: string;
  assetId?: string;
  transactionSignature?: string;
  metadataUri?: string;
  error?: string;
}

export class NFTMintProcessor extends BaseWorker<NFTMintJobData, JobResult> {
  protected name = 'nft-mint-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }

  protected async execute(job: BullJobData<NFTMintJobData>): Promise<JobResult> {
    const { eventId, ticketId, userId, ownerWallet, metadata } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'nft-mint',
      job.data
    );

    // Check if already minted
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`NFT already minted (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Minting NFT ticket:', {
      eventId,
      ticketId,
      userId,
      ownerWallet
    });

    try {
      // Acquire rate limit for Solana
      await this.rateLimiter.acquire('solana', (job.opts?.priority as number) || 5);

      try {
        // Mint NFT via minting service or directly
        const mintResult = await this.mintNFT(job.data);

        if (!mintResult.success) {
          return {
            success: false,
            error: mintResult.error || 'NFT minting failed',
            data: { ticketId, eventId }
          };
        }

        const result: JobResult = {
          success: true,
          data: {
            mintAddress: mintResult.mintAddress,
            assetId: mintResult.assetId,
            transactionSignature: mintResult.transactionSignature,
            metadataUri: mintResult.metadataUri,
            ticketId,
            eventId,
            ownerWallet,
            mintedAt: new Date().toISOString()
          }
        };

        // Store result permanently for NFTs
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue?.name || 'money',
          job.name || 'nft-mint',
          result,
          365 * 24 * 60 * 60 // 1 year for NFTs
        );

        logger.info('NFT minted successfully', {
          ticketId,
          mintAddress: mintResult.mintAddress,
          assetId: mintResult.assetId
        });

        return result;
      } finally {
        this.rateLimiter.release('solana');
      }
    } catch (error) {
      logger.error('NFT minting failed:', error);

      // Handle specific Solana errors
      if (error instanceof Error) {
        // Transaction simulation failed
        if (error.message.includes('Transaction simulation failed')) {
          return {
            success: false,
            error: `Simulation failed: ${error.message}`,
            data: { ticketId, eventId, retryable: true }
          };
        }

        // Insufficient funds
        if (error.message.includes('insufficient funds') || error.message.includes('Insufficient')) {
          return {
            success: false,
            error: 'Insufficient SOL for transaction',
            data: { ticketId, eventId, retryable: false }
          };
        }

        // RPC rate limit
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          throw new Error('Solana RPC rate limit - will retry with backoff');
        }
      }

      throw error;
    }
  }

  /**
   * Mint NFT - delegates to minting service or mints directly
   */
  private async mintNFT(data: NFTMintJobData): Promise<MintResult> {
    // Try minting service first (preferred for production)
    if (MINTING_SERVICE_URL && INTERNAL_SERVICE_KEY) {
      try {
        return await this.mintViaMintingService(data);
      } catch (error: any) {
        // If minting service unavailable, try direct minting
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          logger.warn('Minting service unavailable, attempting direct mint');
        } else {
          throw error;
        }
      }
    }

    // Direct minting (for development or fallback)
    if (SOLANA_PRIVATE_KEY && MERKLE_TREE_ADDRESS) {
      return await this.mintDirectly(data);
    }

    // Mock mode
    logger.warn('Solana not configured - using mock mode');
    return await this.mockMint(data);
  }

  /**
   * Mint via the minting service (recommended for production)
   */
  private async mintViaMintingService(data: NFTMintJobData): Promise<MintResult> {
    const { ticketId, eventId, ownerWallet, metadata, tenantId, venueId, seatId } = data;

    const payload = {
      ticketId,
      eventId,
      ownerWallet,
      metadata: {
        ...metadata,
        // Ensure standard ticket attributes
        attributes: [
          ...metadata.attributes,
          { trait_type: 'Ticket ID', value: ticketId },
          { trait_type: 'Event ID', value: eventId },
          { trait_type: 'Venue ID', value: venueId },
          ...(seatId ? [{ trait_type: 'Seat', value: seatId }] : [])
        ]
      }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Internal-Service-Key': INTERNAL_SERVICE_KEY!
    };

    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    const response = await axios.post<{
      success: boolean;
      mintAddress?: string;
      assetId?: string;
      signature?: string;
      metadataUri?: string;
      error?: string;
    }>(
      `${MINTING_SERVICE_URL}/api/v1/mint/compressed`,
      payload,
      {
        headers,
        timeout: 60000 // 60 second timeout for minting
      }
    );

    const result = response.data;

    return {
      success: result.success,
      mintAddress: result.mintAddress,
      assetId: result.assetId,
      transactionSignature: result.signature,
      metadataUri: result.metadataUri,
      error: result.error
    };
  }

  /**
   * Mint directly to Solana (compressed NFT)
   */
  private async mintDirectly(data: NFTMintJobData): Promise<MintResult> {
    const { ticketId, ownerWallet, metadata, eventId, venueId, seatId } = data;

    try {
      // Upload metadata to Arweave/IPFS
      const metadataUri = await this.uploadMetadata(metadata);

      // Build transaction for compressed NFT mint
      const mintParams = {
        merkleTree: MERKLE_TREE_ADDRESS,
        collectionMint: COLLECTION_MINT,
        owner: ownerWallet,
        name: metadata.name,
        symbol: metadata.symbol || 'TKT',
        uri: metadataUri,
        sellerFeeBasisPoints: 500, // 5% royalty
        creators: [
          {
            address: venueId, // Venue gets royalties
            share: 100
          }
        ]
      };

      // Call Solana RPC to create compressed NFT
      const response = await axios.post<{
        error?: { message: string };
        result?: { signature: string; assetId: string };
      }>(
        SOLANA_RPC_URL,
        {
          jsonrpc: '2.0',
          id: ticketId,
          method: 'mintCompressedNft',
          params: mintParams
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const { signature, assetId } = response.data.result!;

      // Wait for confirmation
      await this.confirmTransaction(signature);

      return {
        success: true,
        assetId,
        transactionSignature: signature,
        metadataUri
      };
    } catch (error: any) {
      logger.error('Direct minting failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload metadata to decentralized storage
   */
  private async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    // In production, this would upload to Arweave or IPFS
    // For now, assume metadata is already uploaded or use a metadata service
    
    const metadataServiceUrl = process.env.METADATA_SERVICE_URL;
    
    if (metadataServiceUrl) {
      const response = await axios.post<{ uri: string }>(
        `${metadataServiceUrl}/upload`,
        { metadata },
        { timeout: 30000 }
      );
      return response.data.uri;
    }

    // Fallback: return a placeholder URI
    // In production, this should always upload to decentralized storage
    logger.warn('Using placeholder metadata URI - configure METADATA_SERVICE_URL for production');
    return `https://metadata.tickettoken.com/${Date.now()}.json`;
  }

  /**
   * Confirm Solana transaction
   */
  private async confirmTransaction(signature: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.post<{
          result?: { value?: Array<{ err?: any; confirmationStatus?: string }> };
        }>(
          SOLANA_RPC_URL,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignatureStatuses',
            params: [[signature], { searchTransactionHistory: true }]
          },
          { timeout: 5000 }
        );

        const status = response.data.result?.value?.[0];
        
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
            return true;
          }
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (i === maxAttempts - 1) throw error;
      }
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Mock NFT minting for development/testing
   */
  private async mockMint(data: NFTMintJobData): Promise<MintResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockMintAddress = `mock_${data.ticketId}_${Date.now()}`;
    const mockAssetId = `asset_${Buffer.from(mockMintAddress).toString('base64').slice(0, 32)}`;

    logger.info('[MOCK] NFT would be minted:', {
      ticketId: data.ticketId,
      ownerWallet: data.ownerWallet,
      metadata: data.metadata.name
    });

    return {
      success: true,
      mintAddress: mockMintAddress,
      assetId: mockAssetId,
      transactionSignature: `mock_sig_${Date.now()}`,
      metadataUri: `https://mock.metadata.tickettoken.com/${data.ticketId}.json`
    };
  }
}
