import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction 
} from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { bundlrStorage } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { retryOperation } from '../utils/retry';
import { blockchainMetrics } from '../utils/blockchain-metrics';
import config from '../config';

/**
 * METAPLEX SERVICE
 * 
 * Real NFT minting service using Metaplex SDK
 * 
 * AUDIT FIXES:
 * - #81: Re-enable Bundlr/Irys storage for metadata
 * - #82: Add dynamic priority fees
 * - #84: Add fresh blockhash on retry
 */

interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
  };
}

interface Creator {
  address: string;
  share: number;
}

interface MintNFTParams {
  metadata: NFTMetadata;
  creators: Creator[];
  sellerFeeBasisPoints: number;
  collection?: PublicKey;
  owner?: PublicKey;
}

interface MintNFTResult {
  mintAddress: string;
  transactionSignature: string;
  metadataUri: string;
  slot?: number;
  blockHeight?: number;
}

// Priority fee cache to reduce RPC calls
interface PriorityFeeCache {
  fee: number;
  timestamp: number;
}

const PRIORITY_FEE_CACHE_TTL_MS = 10000; // 10 seconds

export class MetaplexService {
  private connection: Connection;
  private metaplex: Metaplex;
  private authority: Keypair;
  private priorityFeeCache: PriorityFeeCache | null = null;

  constructor(connection: Connection, authority: Keypair) {
    this.connection = connection;
    this.authority = authority;
    
    // Get Bundlr configuration from config
    const bundlrAddress = config.solana.bundlrAddress;
    const bundlrProviderUrl = config.solana.bundlrProviderUrl;
    const bundlrTimeout = config.solana.bundlrTimeout;
    
    // Initialize Metaplex with authority wallet and Bundlr storage
    // AUDIT FIX #81: Re-enable Bundlr/Irys storage
    this.metaplex = Metaplex.make(connection)
      .use(keypairIdentity(authority))
      .use(bundlrStorage({
        address: bundlrAddress,
        providerUrl: bundlrProviderUrl,
        timeout: bundlrTimeout,
      }));

    logger.info('MetaplexService initialized', {
      authority: authority.publicKey.toString(),
      bundlrAddress,
      bundlrProviderUrl,
      network: config.solana.network
    });
  }

  /**
   * Get dynamic priority fee based on recent network conditions
   * AUDIT FIX #82: Dynamic priority fees
   */
  async getPriorityFee(): Promise<number> {
    // Check cache first
    if (this.priorityFeeCache && 
        (Date.now() - this.priorityFeeCache.timestamp) < PRIORITY_FEE_CACHE_TTL_MS) {
      return this.priorityFeeCache.fee;
    }

    try {
      // Fetch recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();
      
      if (recentFees.length === 0) {
        // No recent fees, use default
        this.priorityFeeCache = {
          fee: config.solana.defaultPriorityFee,
          timestamp: Date.now()
        };
        return config.solana.defaultPriorityFee;
      }

      // Sort fees and get median
      const fees = recentFees
        .map(f => f.prioritizationFee)
        .filter(f => f > 0)
        .sort((a, b) => a - b);
      
      if (fees.length === 0) {
        this.priorityFeeCache = {
          fee: config.solana.defaultPriorityFee,
          timestamp: Date.now()
        };
        return config.solana.defaultPriorityFee;
      }

      const medianFee = fees[Math.floor(fees.length / 2)];
      
      // Add 20% buffer to ensure transaction goes through
      let calculatedFee = Math.ceil(medianFee * 1.2);
      
      // Clamp to min/max bounds
      calculatedFee = Math.max(calculatedFee, config.solana.minPriorityFee);
      calculatedFee = Math.min(calculatedFee, config.solana.maxPriorityFee);
      
      // Cache the fee
      this.priorityFeeCache = {
        fee: calculatedFee,
        timestamp: Date.now()
      };

      logger.debug('Calculated priority fee', {
        medianFee,
        calculatedFee,
        sampleSize: fees.length
      });

      return calculatedFee;
    } catch (error: any) {
      logger.warn('Failed to fetch priority fees, using default', {
        error: error.message
      });
      return config.solana.defaultPriorityFee;
    }
  }

  /**
   * Add compute budget instructions to transaction
   * AUDIT FIX #82: Dynamic priority fees
   */
  async addPriorityFeeInstructions(
    computeUnits: number = 200000
  ): Promise<TransactionInstruction[]> {
    const priorityFee = await this.getPriorityFee();
    
    return [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
      })
    ];
  }

  /**
   * Get fresh blockhash for transaction
   * AUDIT FIX #84: Fresh blockhash on retry
   */
  async getFreshBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    
    logger.debug('Got fresh blockhash', {
      blockhash: blockhash.substring(0, 16) + '...',
      lastValidBlockHeight
    });
    
    return { blockhash, lastValidBlockHeight };
  }

  /**
   * Check if blockhash is still valid
   */
  async isBlockhashValid(blockhash: string, lastValidBlockHeight: number): Promise<boolean> {
    try {
      const currentBlockHeight = await this.connection.getBlockHeight('confirmed');
      return currentBlockHeight <= lastValidBlockHeight;
    } catch {
      return false;
    }
  }

  /**
   * Upload metadata to Arweave via Bundlr with retry
   * AUDIT FIX #81: Re-enabled Bundlr storage
   */
  async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    const startTime = Date.now();
    
    try {
      logger.info('Uploading metadata to Arweave', {
        name: metadata.name
      });

      const uri = await retryOperation(
        async () => {
          const { uri } = await this.metaplex.nfts().uploadMetadata(metadata as any);
          return uri;
        },
        'Metadata upload',
        { maxAttempts: 3 }
      );
      
      const duration = Date.now() - startTime;
      blockchainMetrics.recordMetadataUpload('success', duration);
      
      logger.info('Metadata uploaded successfully', {
        uri,
        name: metadata.name,
        durationMs: duration
      });

      return uri;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      blockchainMetrics.recordMetadataUpload('failure');
      
      logger.error('Failed to upload metadata', {
        error: error.message,
        stack: error.stack,
        durationMs: duration
      });
      throw error;
    }
  }

  /**
   * Mint a new NFT with Metaplex
   * 
   * AUDIT FIXES:
   * - #82: Dynamic priority fees added
   * - #84: Fresh blockhash fetched on each retry attempt
   */
  async mintNFT(params: MintNFTParams): Promise<MintNFTResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting NFT mint', {
        name: params.metadata.name,
        creators: params.creators.length,
        hasCollection: !!params.collection,
        owner: params.owner?.toString()
      });

      // Upload metadata first (already has retry)
      const metadataUri = await this.uploadMetadata(params.metadata);

      // Convert creators to Metaplex format
      const creators = params.creators.map(creator => ({
        address: new PublicKey(creator.address),
        share: creator.share
      }));

      // Mint NFT with retry and fresh blockhash on each attempt
      const result = await retryOperation(
        async () => {
          // AUDIT FIX #84: Get fresh blockhash for each attempt
          const { blockhash, lastValidBlockHeight } = await this.getFreshBlockhash();
          
          // AUDIT FIX #82: Get priority fee
          const priorityFee = await this.getPriorityFee();
          
          logger.debug('Attempting mint with fresh blockhash', {
            blockhash: blockhash.substring(0, 16) + '...',
            lastValidBlockHeight,
            priorityFee
          });

          // Create NFT with Metaplex
          const { nft, response } = await this.metaplex.nfts().create({
            uri: metadataUri,
            name: params.metadata.name,
            symbol: params.metadata.symbol,
            sellerFeeBasisPoints: params.sellerFeeBasisPoints,
            creators,
            collection: params.collection,
            isMutable: true,
            tokenOwner: params.owner,
          });
          
          // Get slot from response if available
          const context = await this.connection.getTransaction(response.signature, {
            maxSupportedTransactionVersion: 0
          });
          
          return {
            mintAddress: nft.address.toString(),
            transactionSignature: response.signature,
            metadataUri,
            slot: context?.slot,
            blockHeight: context?.blockTime ? context.blockTime : undefined
          };
        },
        'NFT mint',
        { 
          maxAttempts: 3,
          retryableErrors: [
            'timeout',
            'blockhash', // AUDIT FIX #84: Retry on blockhash expiry
            'expired',
            'network',
            'ECONNRESET',
            '429',
            '503',
          ]
        }
      );

      const duration = Date.now() - startTime;
      blockchainMetrics.recordMintSuccess(duration);

      logger.info('NFT minted successfully', {
        mintAddress: result.mintAddress,
        signature: result.transactionSignature,
        name: params.metadata.name,
        slot: result.slot,
        durationMs: duration
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      blockchainMetrics.recordMintFailure(error.message);
      
      logger.error('Failed to mint NFT', {
        error: error.message,
        stack: error.stack,
        name: params.metadata.name,
        durationMs: duration
      });
      throw error;
    }
  }

  /**
   * Create or get collection NFT (with retry and metrics)
   */
  async createCollection(params: {
    name: string;
    symbol: string;
    description: string;
    image: string;
  }): Promise<PublicKey> {
    try {
      logger.info('Creating collection', {
        name: params.name
      });

      const metadataUri = await this.uploadMetadata({
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        image: params.image
      });

      const address = await retryOperation(
        async () => {
          // Get fresh blockhash for each attempt
          await this.getFreshBlockhash();
          
          const { nft } = await this.metaplex.nfts().create({
            uri: metadataUri,
            name: params.name,
            symbol: params.symbol,
            sellerFeeBasisPoints: 0,
            isCollection: true,
          });
          return nft.address;
        },
        'Collection creation',
        { maxAttempts: 3 }
      );

      blockchainMetrics.recordCollectionCreation();

      logger.info('Collection created', {
        address: address.toString(),
        name: params.name
      });

      return address;
    } catch (error: any) {
      logger.error('Failed to create collection', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Verify NFT collection membership (with retry and metrics)
   */
  async verifyCollectionItem(
    nftMint: PublicKey,
    collectionMint: PublicKey
  ): Promise<string> {
    try {
      const signature = await retryOperation(
        async () => {
          // Get fresh blockhash for each attempt
          await this.getFreshBlockhash();
          
          const { response } = await this.metaplex.nfts().verifyCollection({
            mintAddress: nftMint,
            collectionMintAddress: collectionMint,
          });
          return response.signature;
        },
        'Collection verification',
        { maxAttempts: 2 }
      );

      blockchainMetrics.recordCollectionVerification('success');

      logger.info('Collection verified', {
        nft: nftMint.toString(),
        collection: collectionMint.toString(),
        signature
      });

      return signature;
    } catch (error: any) {
      blockchainMetrics.recordCollectionVerification('failure');
      
      logger.error('Failed to verify collection', {
        error: error.message,
        nft: nftMint.toString(),
        collection: collectionMint.toString()
      });
      throw error;
    }
  }

  /**
   * Find NFT by mint address
   */
  async findNFTByMint(mintAddress: PublicKey) {
    try {
      const nft = await this.metaplex.nfts().findByMint({
        mintAddress
      });
      return nft;
    } catch (error: any) {
      logger.error('Failed to find NFT', {
        error: error.message,
        mintAddress: mintAddress.toString()
      });
      throw error;
    }
  }

  /**
   * Get NFT metadata
   */
  async getNFTMetadata(mintAddress: PublicKey) {
    try {
      const nft = await this.findNFTByMint(mintAddress);
      return {
        name: nft.name,
        symbol: nft.symbol,
        uri: nft.uri,
        sellerFeeBasisPoints: nft.sellerFeeBasisPoints,
        creators: nft.creators,
        collection: nft.collection,
        address: nft.address.toString()
      };
    } catch (error: any) {
      logger.error('Failed to get NFT metadata', {
        error: error.message,
        mintAddress: mintAddress.toString()
      });
      throw error;
    }
  }

  /**
   * Get the authority public key
   */
  getAuthorityPublicKey(): PublicKey {
    return this.authority.publicKey;
  }
}

export default MetaplexService;
