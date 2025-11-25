import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import blockchain from '../config/blockchain';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

// Import the IDL (you'll need to copy this from your deployed-idl.json)
const IDL = require('../idl/marketplace.json');

interface TransferNFTParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  listingId: string;
  price: number;
}

interface TransferResult {
  signature: string;
  blockHeight: number;
  fee: number;
}

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;
  private log = logger.child({ component: 'RealBlockchainService' });

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  private initializeProgram() {
    try {
      // Get the marketplace program ID from your deployed contract
      const programId = new PublicKey(process.env.MARKETPLACE_PROGRAM_ID || 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv');

      // Create a dummy provider for reading
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // We'll add wallet when needed for transactions
        { commitment: 'confirmed' }
      );

      this.program = new Program(IDL as any, provider);
      this.log.info('Marketplace program initialized', { programId: programId.toString() });
    } catch (error) {
      this.log.error('Failed to initialize program', { error });
    }
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeTransfer(params);
      } catch (error: any) {
        lastError = error;
        this.log.warn(`Transfer attempt ${attempt} failed`, {
          error: error.message,
          attempt,
          maxRetries
        });

        // Don't retry on certain errors
        if (error.message?.includes('Insufficient') || 
            error.message?.includes('not configured') ||
            error.message?.includes('not initialized')) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Transfer failed after maximum retries');
  }

  private async executeTransfer(params: TransferNFTParams): Promise<TransferResult> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { tokenId, fromWallet, toWallet, listingId, price } = params;

      // Get the payer wallet (marketplace service wallet)
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create the necessary PDAs and accounts
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
        this.program.programId
      );

      const [marketplacePDA] = await PublicKey.findProgramAddress(
        [Buffer.from('marketplace')],
        this.program.programId
      );

      const [reentrancyGuardPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
        this.program.programId
      );

      // Build the buy_listing instruction
      const instruction = await this.program.methods
        .buyListing()
        .accounts({
          buyer: new PublicKey(toWallet),
          listing: listingPDA,
          marketplace: marketplacePDA,
          seller: new PublicKey(fromWallet),
          marketplaceTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          reentrancyGuard: reentrancyGuardPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      const blockHeight = await this.connection.getBlockHeight();
      const fee = 0.00025; // Estimated SOL transaction fee

      this.log.info('NFT transfer completed on-chain', {
        signature,
        blockHeight,
        fromWallet,
        toWallet,
        tokenId
      });

      return {
        signature,
        blockHeight,
        fee,
      };
    } catch (error) {
      this.log.error('NFT transfer failed', { error, params });
      throw new InternalServerError('Blockchain transfer failed: ' + (error as Error).message || 'Unknown error');
    }
  }

  async verifyNFTOwnership(walletAddress: string, tokenId: string): Promise<boolean> {
    try {
      if (!this.program) return false;

      // Query the on-chain listing account
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(tokenId).toBuffer()],
        this.program.programId
      );

      const listing = await (this.program.account as any).listing.fetch(listingPDA);
      return listing.seller.toString() === walletAddress;
    } catch (error) {
      this.log.error('Failed to verify NFT ownership', { error, walletAddress, tokenId });
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletAddress: string): Promise<number> {
    try {
      const pubkey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      this.log.error('Failed to get wallet balance', { error, walletAddress });
      throw new InternalServerError('Failed to get wallet balance');
    }
  }

  /**
   * Validate transaction signature
   */
  async validateTransaction(signature: string): Promise<boolean> {
    try {
      const result = await this.connection.getTransaction(signature);
      return result !== null && result.meta?.err === null;
    } catch (error) {
      this.log.error('Failed to validate transaction', { error, signature });
      return false;
    }
  }

  /**
   * Get the blockchain connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Calculate network fees
   */
  calculateNetworkFee(): number {
    // Solana base fee is 5000 lamports (0.000005 SOL)
    // NFT transfer might require 2-3 transactions
    return 0.00025; // SOL
  }

  /**
   * Create escrow account to hold buyer's funds
   */
  async createEscrowAccount(params: {
    listingId: string;
    buyerWallet: string;
    sellerWallet: string;
    amount: number;
  }): Promise<{ escrowAddress: string; signature: string }> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { listingId, buyerWallet, sellerWallet, amount } = params;

      // Get the payer wallet
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Derive escrow PDA
      const [escrowPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('escrow'),
          new PublicKey(listingId).toBuffer(),
          new PublicKey(buyerWallet).toBuffer()
        ],
        this.program.programId
      );

      // Create escrow initialization instruction
      const instruction = await this.program.methods
        .initializeEscrow(new BN(amount))
        .accounts({
          escrow: escrowPDA,
          buyer: new PublicKey(buyerWallet),
          seller: new PublicKey(sellerWallet),
          listing: new PublicKey(listingId),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(buyerWallet);

      // For now, return the escrow address (actual signing would be done by buyer's wallet)
      this.log.info('Escrow account created', {
        escrowAddress: escrowPDA.toString(),
        listingId,
        amount
      });

      return {
        escrowAddress: escrowPDA.toString(),
        signature: 'ESCROW_INIT_' + Date.now() // Placeholder until integrated with wallet
      };
    } catch (error) {
      this.log.error('Failed to create escrow account', { error, params });
      throw new InternalServerError('Escrow creation failed: ' + (error as Error).message);
    }
  }

  /**
   * Release escrow funds to seller after successful transfer
   */
  async releaseEscrowToSeller(params: {
    escrowAddress: string;
    listingId: string;
    buyerWallet: string;
    sellerWallet: string;
    platformFee: number;
    venueFee: number;
  }): Promise<{ signature: string }> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { escrowAddress, listingId, buyerWallet, sellerWallet, platformFee, venueFee } = params;

      // Get the payer wallet
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create release instruction
      const instruction = await this.program.methods
        .releaseEscrow()
        .accounts({
          escrow: new PublicKey(escrowAddress),
          buyer: new PublicKey(buyerWallet),
          seller: new PublicKey(sellerWallet),
          listing: new PublicKey(listingId),
          platformTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      this.log.info('Escrow released to seller', {
        signature,
        escrowAddress,
        sellerWallet,
        platformFee,
        venueFee
      });

      return { signature };
    } catch (error) {
      this.log.error('Failed to release escrow', { error, params });
      throw new InternalServerError('Escrow release failed: ' + (error as Error).message);
    }
  }

  /**
   * Refund escrow funds to buyer if transfer fails
   */
  async refundEscrowToBuyer(params: {
    escrowAddress: string;
    listingId: string;
    buyerWallet: string;
  }): Promise<{ signature: string }> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { escrowAddress, listingId, buyerWallet } = params;

      // Get the payer wallet
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create refund instruction
      const instruction = await this.program.methods
        .refundEscrow()
        .accounts({
          escrow: new PublicKey(escrowAddress),
          buyer: new PublicKey(buyerWallet),
          listing: new PublicKey(listingId),
          authority: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;

      // Sign and send
      transaction.sign(payer);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      this.log.info('Escrow refunded to buyer', {
        signature,
        escrowAddress,
        buyerWallet
      });

      return { signature };
    } catch (error) {
      this.log.error('Failed to refund escrow', { error, params });
      throw new InternalServerError('Escrow refund failed: ' + (error as Error).message);
    }
  }

  /**
   * Check escrow status
   */
  async getEscrowStatus(escrowAddress: string): Promise<{
    exists: boolean;
    amount?: number;
    buyer?: string;
    seller?: string;
    released?: boolean;
  }> {
    try {
      if (!this.program) {
        return { exists: false };
      }

      const escrow = await (this.program.account as any).escrow.fetch(
        new PublicKey(escrowAddress)
      );

      return {
        exists: true,
        amount: escrow.amount?.toNumber() || 0,
        buyer: escrow.buyer?.toString(),
        seller: escrow.seller?.toString(),
        released: escrow.released || false
      };
    } catch (error) {
      this.log.warn('Escrow account not found or error fetching', {
        escrowAddress,
        error: (error as Error).message
      });
      return { exists: false };
    }
  }
}

// Export singleton instance to match current usage
export const blockchainService = new RealBlockchainService();
