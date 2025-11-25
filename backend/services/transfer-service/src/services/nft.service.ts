import { PublicKey } from '@solana/web3.js';
import { Metaplex, Nft } from '@metaplex-foundation/js';
import { solanaConfig, getExplorerUrl } from '../config/solana.config';
import logger from '../utils/logger';

/**
 * NFT SERVICE
 * 
 * Handles NFT operations on Solana blockchain
 * Phase 5: Blockchain Integration
 */

export interface TransferNFTParams {
  mintAddress: string;
  fromWallet: string;
  toWallet: string;
}

export interface TransferNFTResult {
  success: boolean;
  signature: string;
  explorerUrl: string;
  error?: string;
}

export class NFTService {
  private metaplex: Metaplex;

  constructor() {
    this.metaplex = solanaConfig.metaplex;
  }

  /**
   * Transfer NFT from one wallet to another
   */
  async transferNFT(params: TransferNFTParams): Promise<TransferNFTResult> {
    const { mintAddress, fromWallet, toWallet } = params;

    try {
      logger.info('Starting NFT transfer', {
        mintAddress,
        fromWallet,
        toWallet
      });

      // Parse mint address
      const mint = new PublicKey(mintAddress);
      const from = new PublicKey(fromWallet);
      const to = new PublicKey(toWallet);

      // Find NFT
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });

      if (!nft) {
        throw new Error('NFT not found');
      }

      // Execute transfer
      const { response } = await this.metaplex.nfts().transfer({
        nftOrSft: nft,
        fromOwner: from,
        toOwner: to
      });

      const signature = response.signature;
      const explorerUrl = getExplorerUrl(signature);

      logger.info('NFT transfer successful', {
        signature,
        explorerUrl
      });

      return {
        success: true,
        signature,
        explorerUrl
      };

    } catch (error) {
      const err = error as Error;
      logger.error({ err }, 'NFT transfer failed');

      return {
        success: false,
        signature: '',
        explorerUrl: '',
        error: err.message
      };
    }
  }

  /**
   * Get NFT metadata
   */
  async getNFTMetadata(mintAddress: string): Promise<any | null> {
    try {
      const mint = new PublicKey(mintAddress);
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });
      
      return nft;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch NFT metadata');
      return null;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(mintAddress: string, walletAddress: string): Promise<boolean> {
    try {
      const mint = new PublicKey(mintAddress);
      const wallet = new PublicKey(walletAddress);
      
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });
      
      if (!nft) {
        return false;
      }

      // Check if wallet owns the NFT - nft.updateAuthorityAddress or use token account
      // For SPL tokens, we need to check the token account owner
      const tokenAccounts = await this.metaplex.connection.getTokenAccountsByOwner(
        wallet,
        { mint: mint }
      );
      
      return tokenAccounts.value.length > 0;

    } catch (error) {
      logger.error({ err: error }, 'Failed to verify NFT ownership');
      return false;
    }
  }

  /**
   * Get NFT owner
   */
  async getNFTOwner(mintAddress: string): Promise<string | null> {
    try {
      const mint = new PublicKey(mintAddress);
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });
      
      if (!nft) {
        return null;
      }

      return nft.address.toBase58();
    } catch (error) {
      logger.error({ err: error }, 'Failed to get NFT owner');
      return null;
    }
  }

  /**
   * Check if NFT exists
   */
  async nftExists(mintAddress: string): Promise<boolean> {
    try {
      const mint = new PublicKey(mintAddress);
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });
      
      return nft !== null;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const nftService = new NFTService();
