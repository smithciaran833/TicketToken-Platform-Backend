import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { retryOperation } from '../utils/retry';
import { blockchainMetrics } from '../utils/blockchain-metrics';

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
}

interface MintNFTResult {
  mintAddress: string;
  transactionSignature: string;
  metadataUri: string;
}

export class MetaplexService {
  private connection: Connection;
  private metaplex: Metaplex;
  private authority: Keypair;

  constructor(connection: Connection, authority: Keypair) {
    this.connection = connection;
    this.authority = authority;
    
    // Get Bundlr configuration from environment
    const bundlrAddress = process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network';
    const bundlrProviderUrl = process.env.BUNDLR_PROVIDER_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const bundlrTimeout = parseInt(process.env.BUNDLR_TIMEOUT || '60000', 10);
    
    // Initialize Metaplex with authority wallet
    this.metaplex = Metaplex.make(connection)
      .use(keypairIdentity(authority))
//       .use(bundlrStorage({
//         address: bundlrAddress,
//         providerUrl: bundlrProviderUrl,
//         timeout: bundlrTimeout,
//       }));

    logger.info('MetaplexService initialized', {
      authority: authority.publicKey.toString(),
      bundlrAddress,
      bundlrProviderUrl
    });
  }

  /**
   * Upload metadata to Arweave via Bundlr with retry
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
   * Mint a new NFT with Metaplex (with retry and metrics)
   */
  async mintNFT(params: MintNFTParams): Promise<MintNFTResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting NFT mint', {
        name: params.metadata.name,
        creators: params.creators.length,
        hasCollection: !!params.collection
      });

      // Upload metadata first (already has retry)
      const metadataUri = await this.uploadMetadata(params.metadata);

      // Convert creators to Metaplex format
      const creators = params.creators.map(creator => ({
        address: new PublicKey(creator.address),
        share: creator.share
      }));

      // Mint NFT with retry
      const result = await retryOperation(
        async () => {
          const { nft, response } = await this.metaplex.nfts().create({
            uri: metadataUri,
            name: params.metadata.name,
            symbol: params.metadata.symbol,
            sellerFeeBasisPoints: params.sellerFeeBasisPoints,
            creators,
            collection: params.collection,
            isMutable: true,
          });
          
          return {
            mintAddress: nft.address.toString(),
            transactionSignature: response.signature,
            metadataUri
          };
        },
        'NFT mint',
        { maxAttempts: 3 }
      );

      const duration = Date.now() - startTime;
      blockchainMetrics.recordMintSuccess(duration);

      logger.info('NFT minted successfully', {
        mintAddress: result.mintAddress,
        signature: result.transactionSignature,
        name: params.metadata.name,
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
}

export default MetaplexService;
