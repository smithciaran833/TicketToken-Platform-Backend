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
}

// Export singleton instance to match current usage
export const blockchainService = new RealBlockchainService();
