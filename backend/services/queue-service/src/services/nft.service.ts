import { PublicKey } from '@solana/web3.js';
import { metaplex, connection, wallet, solanaConfig } from '../config/solana.config';
import { logger } from '../utils/logger';

/**
 * NFT Service
 * Handles Solana NFT minting operations using Metaplex
 */

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // URL to image
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  externalUrl?: string;
  animationUrl?: string;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
  };
}

export interface MintNFTRequest {
  recipientAddress: string;
  metadata: NFTMetadata;
  sellerFeeBasisPoints?: number; // Royalty percentage (e.g., 500 = 5%)
  isMutable?: boolean;
}

export interface MintNFTResult {
  success: boolean;
  mintAddress?: string;
  tokenAddress?: string;
  transactionSignature?: string;
  metadataUri?: string;
  error?: string;
  explorerUrl?: string;
}

export class NFTService {
  /**
   * Mint a new NFT
   */
  async mintNFT(request: MintNFTRequest): Promise<MintNFTResult> {
    try {
      logger.info('Starting NFT mint', {
        recipient: request.recipientAddress,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
      });

      // Validate recipient address
      let recipientPublicKey: PublicKey;
      try {
        recipientPublicKey = new PublicKey(request.recipientAddress);
      } catch (error: any) {
        return {
          success: false,
          error: `Invalid recipient address: ${error.message}`,
        };
      }

      // Upload metadata to Arweave/IPFS via Metaplex
      logger.info('Uploading NFT metadata');
      const { uri: metadataUri } = await metaplex.nfts().uploadMetadata({
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        description: request.metadata.description,
        image: request.metadata.image,
        attributes: request.metadata.attributes || [],
        external_url: request.metadata.externalUrl,
        animation_url: request.metadata.animationUrl,
        properties: request.metadata.properties,
      });

      logger.info('Metadata uploaded', { uri: metadataUri });

      // Create NFT
      logger.info('Creating NFT on-chain');
      const { nft } = await metaplex.nfts().create({
        uri: metadataUri,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        sellerFeeBasisPoints: request.sellerFeeBasisPoints || 0,
        isMutable: request.isMutable !== false,
        maxSupply: null, // Unlimited supply
        tokenOwner: recipientPublicKey,
      });

      const explorerUrl = this.getExplorerUrl(nft.address.toBase58());

      logger.info('NFT minted successfully', {
        mintAddress: nft.address.toBase58(),
        metadataUri,
        explorerUrl,
      });

      return {
        success: true,
        mintAddress: nft.address.toBase58(),
        tokenAddress: nft.token?.address?.toBase58(),
        metadataUri,
        explorerUrl,
      };
    } catch (error: any) {
      logger.error('NFT minting failed', {
        recipient: request.recipientAddress,
        error: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Transfer an NFT to a new owner
   */
  async transferNFT(
    mintAddress: string,
    recipientAddress: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      logger.info('Transferring NFT', {
        mintAddress,
        recipient: recipientAddress,
      });

      const mintPublicKey = new PublicKey(mintAddress);
      const recipientPublicKey = new PublicKey(recipientAddress);

      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });

      const { response } = await metaplex.nfts().transfer({
        nftOrSft: nft,
        toOwner: recipientPublicKey,
      });

      logger.info('NFT transferred successfully', {
        signature: response.signature,
      });

      return {
        success: true,
        signature: response.signature,
      };
    } catch (error: any) {
      logger.error('NFT transfer failed', {
        mintAddress,
        recipient: recipientAddress,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get NFT metadata
   */
  async getNFTMetadata(mintAddress: string): Promise<any | null> {
    try {
      const mintPublicKey = new PublicKey(mintAddress);
      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });
      return nft;
    } catch (error: any) {
      logger.error('Failed to fetch NFT metadata', {
        mintAddress,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(mintAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const nft = await this.getNFTMetadata(mintAddress);
      if (!nft) return false;

      const currentOwner = nft.token?.ownerAddress?.toBase58();
      return currentOwner === ownerAddress;
    } catch (error: any) {
      logger.error('Ownership verification failed', {
        mintAddress,
        ownerAddress,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(): Promise<number> {
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error: any) {
      logger.error('Failed to get wallet balance', {
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get Solana explorer URL for a mint address
   */
  getExplorerUrl(mintAddress: string): string {
    const cluster = solanaConfig.isMainnet ? '' : `?cluster=${solanaConfig.network}`;
    return `https://explorer.solana.com/address/${mintAddress}${cluster}`;
  }

  /**
   * Get configuration info
   */
  getConfig() {
    return {
      network: solanaConfig.network,
      walletPublicKey: solanaConfig.walletPublicKey,
      rpcUrl: solanaConfig.rpcUrl,
      isDevnet: solanaConfig.isDevnet,
      isMainnet: solanaConfig.isMainnet,
    };
  }
}

// Export singleton instance
export const nftService = new NFTService();
