import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  TransactionSignature,
  Commitment,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createMint, 
  mintTo, 
  transfer,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { db } from '../config/database';

interface MintRequest {
  ticketId: string;
  ownerAddress: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    eventId: string;
    venueId: string;
    seatNumber?: string;
    eventDate: string;
  };
}

interface TransferRequest {
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
}

export class SolanaService {
  private connection: Connection;
  private metaplex: Metaplex;
  private payerKeypair: Keypair;
  private commitment: Commitment = 'confirmed';
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds

  constructor() {
    // Initialize connection to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, this.commitment);
    
    // Load payer keypair from environment
    const payerSecret = process.env.SOLANA_PAYER_SECRET_KEY;
    if (payerSecret) {
      this.payerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(payerSecret))
      );
    } else {
      // Generate new keypair for testing
      this.payerKeypair = Keypair.generate();
      logger.warn('Using generated keypair - fund this address:', 
        this.payerKeypair.publicKey.toString());
    }

    // Initialize Metaplex
    this.metaplex = new Metaplex(this.connection);
    this.metaplex.use(keypairIdentity(this.payerKeypair));
  }

  /**
   * Mint NFT ticket with idempotency
   */
  async mintTicketNFT(request: MintRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check if already minted (idempotency)
      const existing = await this.checkExistingMint(request.ticketId);
      if (existing) {
        logger.info(`Ticket ${request.ticketId} already minted: ${existing}`);
        return existing;
      }

      // Create NFT with Metaplex
      const { nft } = await this.metaplex.nfts().create({
        uri: request.metadata.uri,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        sellerFeeBasisPoints: 250, // 2.5% royalty
        creators: [
          {
            address: this.payerKeypair.publicKey,
            share: 100
          }
        ],
        isMutable: false, // Tickets shouldn't change
        maxSupply: 1 // Each ticket is unique
      });

      const mintAddress = nft.address.toString();
      
      // Store mint record for idempotency
      await this.storeMintRecord(request.ticketId, mintAddress, nft);

      // Transfer to buyer
      if (request.ownerAddress !== this.payerKeypair.publicKey.toString()) {
        await this.transferNFT({
          tokenAddress: mintAddress,
          fromAddress: this.payerKeypair.publicKey.toString(),
          toAddress: request.ownerAddress,
          amount: 1
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`NFT minted in ${duration}ms: ${mintAddress}`);
      
      // Record metrics
      this.recordMetrics('mint', true, duration);
      
      return mintAddress;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Mint failed:', error);
      
      // Record metrics
      this.recordMetrics('mint', false, duration, error.message);
      
      // Retry logic
      if (this.shouldRetry(error)) {
        return this.retryMint(request);
      }
      
      throw error;
    }
  }

  /**
   * Transfer NFT with retry logic
   */
  async transferNFT(request: TransferRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      const fromPubkey = new PublicKey(request.fromAddress);
      const toPubkey = new PublicKey(request.toAddress);
      const mintPubkey = new PublicKey(request.tokenAddress);

      // Get or create associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        fromPubkey
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        toPubkey
      );

      // Check if destination account exists
      const toAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      
      const transaction = new Transaction();
      
      // Create account if it doesn't exist
      if (!toAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.payerKeypair.publicKey,
            toTokenAccount,
            toPubkey,
            mintPubkey
          )
        );
      }

      // Add transfer instruction
      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          [],
          request.amount
        )
      );

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payerKeypair],
        {
          commitment: this.commitment,
          maxRetries: this.maxRetries
        }
      );

      const duration = Date.now() - startTime;
      logger.info(`NFT transferred in ${duration}ms: ${signature}`);
      
      // Store transfer record
      await this.storeTransferRecord(request, signature);
      
      // Record metrics
      this.recordMetrics('transfer', true, duration);
      
      return signature;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Transfer failed:', error);
      
      // Record metrics
      this.recordMetrics('transfer', false, duration, error.message);
      
      throw error;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(tokenAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const ownerPubkey = new PublicKey(ownerAddress);
      
      const ownerTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey
      );
      
      const accountInfo = await this.connection.getTokenAccountBalance(ownerTokenAccount);
      
      return accountInfo.value.uiAmount === 1;
      
    } catch (error) {
      logger.error('Ownership verification failed:', error);
      return false;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(signature: string): Promise<string> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      
      if (!status || !status.value) {
        return 'unknown';
      }
      
      if (status.value.err) {
        return 'failed';
      }
      
      if (status.value.confirmationStatus === 'finalized') {
        return 'finalized';
      }
      
      if (status.value.confirmationStatus === 'confirmed') {
        return 'confirmed';
      }
      
      return 'processing';
      
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      return 'error';
    }
  }

  /**
   * Check if ticket was already minted (idempotency)
   */
  private async checkExistingMint(ticketId: string): Promise<string | null> {
    try {
      const record = await db('nft_mints')
        .where({ ticket_id: ticketId, status: 'completed' })
        .first();
      
      return record?.mint_address || null;
      
    } catch (error) {
      logger.error('Failed to check existing mint:', error);
      return null;
    }
  }

  /**
   * Store mint record for idempotency
   */
  private async storeMintRecord(ticketId: string, mintAddress: string, nft: any): Promise<void> {
    await db('nft_mints').insert({
      ticket_id: ticketId,
      mint_address: mintAddress,
      metadata: JSON.stringify(nft.json),
      status: 'completed',
      created_at: new Date()
    }).onConflict('ticket_id').merge();
  }

  /**
   * Store transfer record
   */
  private async storeTransferRecord(request: TransferRequest, signature: string): Promise<void> {
    await db('nft_transfers').insert({
      token_address: request.tokenAddress,
      from_address: request.fromAddress,
      to_address: request.toAddress,
      amount: request.amount,
      signature,
      status: 'completed',
      created_at: new Date()
    });
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: any): boolean {
    const retryableErrors = [
      'blockhash not found',
      'node is behind',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Retry mint operation
   */
  private async retryMint(request: MintRequest, attempt = 1): Promise<string> {
    if (attempt > this.maxRetries) {
      throw new Error(`Mint failed after ${this.maxRetries} attempts`);
    }
    
    logger.info(`Retrying mint attempt ${attempt}...`);
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
    
    try {
      return await this.mintTicketNFT(request);
    } catch (error: any) {
      if (this.shouldRetry(error)) {
        return this.retryMint(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetrics(operation: string, success: boolean, duration: number, error?: string): void {
    // This would integrate with the monitoring service from Phase 8
    if (success) {
      logger.info(`Solana ${operation} successful`, { duration });
    } else {
      logger.error(`Solana ${operation} failed`, { duration, error });
    }
  }

  /**
   * Health check for Solana connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const blockHeight = await this.connection.getBlockHeight();
      const balance = await this.connection.getBalance(this.payerKeypair.publicKey);
      
      logger.info('Solana health check:', {
        blockHeight,
        balance: balance / LAMPORTS_PER_SOL,
        address: this.payerKeypair.publicKey.toString()
      });
      
      return blockHeight > 0;
      
    } catch (error) {
      logger.error('Solana health check failed:', error);
      return false;
    }
  }
}

export const solanaService = new SolanaService();
