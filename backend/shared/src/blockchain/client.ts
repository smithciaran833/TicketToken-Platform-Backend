/**
 * BlockchainClient - Main client for interacting with TicketToken smart contract
 *
 * This class provides a high-level API for backend services to interact
 * with the deployed Solana smart contract.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Commitment,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import {
  BlockchainConfig,
  CreateEventParams,
  CreateEventResult,
  RegisterTicketParams,
  RegisterTicketResult,
  TransferTicketParams,
  VerifyTicketParams,
  RoyaltyInfo,
  TicketInfo,
  EventInfo,
  BlockchainError,
  TransactionError,
  AccountNotFoundError,
  ConfigurationError,
  TicketAlreadyUsedError,
  InvalidRoyaltyError,
} from './types';
import {
  derivePlatformPDA,
  deriveEventPDA,
  deriveTicketPDA,
  deriveReentrancyGuardPDA,
  toBase58,
  fromBase58,
} from './pda';

/**
 * Main blockchain client for TicketToken operations
 */
export class BlockchainClient {
  private connection: Connection;
  private program: Program;
  private platformWallet: Keypair;
  private programId: PublicKey;
  private commitment: Commitment;

  /**
   * Creates a new BlockchainClient instance
   */
  constructor(config: BlockchainConfig) {
    try {
      this.validateConfig(config);
      this.commitment = (config.commitment || 'confirmed') as Commitment;
      this.connection = new Connection(config.rpcUrl, { commitment: this.commitment });
      this.programId = fromBase58(config.programId);
      this.platformWallet = this.loadWallet(config.platformWalletPath);
      this.program = this.initializeProgram();
    } catch (error) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to initialize blockchain client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private validateConfig(config: BlockchainConfig): void {
    if (!config.rpcUrl) throw new ConfigurationError('RPC URL is required');
    if (!config.programId) throw new ConfigurationError('Program ID is required');
    if (!config.platformWalletPath) throw new ConfigurationError('Platform wallet path is required');
  }

  private loadWallet(walletPath: string): Keypair {
    try {
      const absolutePath = path.resolve(walletPath);
      const keypairData = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
      return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    } catch (error) {
      throw new ConfigurationError(
        `Failed to load wallet from ${walletPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private initializeProgram(): Program {
    try {
      const idlPath = path.join(__dirname, '../../idl/tickettoken.json');
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
      const wallet = new Wallet(this.platformWallet);
      const provider = new AnchorProvider(this.connection, wallet, {
        commitment: this.commitment,
      });
      return new Program(idl, provider);
    } catch (error) {
      throw new ConfigurationError(
        `Failed to initialize Anchor program: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==========================================================================
  // EVENT OPERATIONS
  // ==========================================================================

  async createEvent(params: CreateEventParams): Promise<CreateEventResult> {
    try {
      if (params.artistPercentage + params.venuePercentage > 10000) {
        throw new InvalidRoyaltyError(
          `Total royalty percentage cannot exceed 100% (${params.artistPercentage + params.venuePercentage} basis points provided)`
        );
      }

      const venuePubkey = fromBase58(params.venuePda);
      const oracleFeed = fromBase58(params.oracleFeed);
      const artistWallet = fromBase58(params.artistWallet);

      const [eventPda] = deriveEventPDA(this.programId, venuePubkey, params.eventId);
      const [reentrancyGuard] = deriveReentrancyGuardPDA(this.programId, 'event', eventPda);

      const createEventParams = {
        eventId: new BN(params.eventId.toString()),
        name: params.name,
        ticketPrice: new BN(params.ticketPrice.toString()),
        totalTickets: params.totalTickets,
        startTime: new BN(params.startTime.toString()),
        endTime: new BN(params.endTime.toString()),
        refundWindow: new BN(params.refundWindow.toString()),
        metadataUri: params.metadataUri,
        oracleFeed,
        description: params.description,
        transferable: params.transferable,
        resaleable: params.resaleable,
        artistWallet,
        artistPercentage: params.artistPercentage,
        venuePercentage: params.venuePercentage,
      };

      const signature = await (this.program.methods as any)
        .createEvent(createEventParams)
        .accounts({
          authority: this.platformWallet.publicKey,
          venue: venuePubkey,
          event: eventPda,
          reentrancyGuard,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await this.connection.confirmTransaction(signature);

      return {
        eventPda: toBase58(eventPda),
        signature,
        eventId: params.eventId,
      };
    } catch (error) {
      throw this.handleError(error, 'createEvent');
    }
  }

  async getEventRoyalties(eventPda: string): Promise<RoyaltyInfo> {
    try {
      const eventPubkey = fromBase58(eventPda);
      const eventAccount = await (this.program.account as any).event.fetch(eventPubkey);

      return {
        artistWallet: toBase58(eventAccount.artistWallet),
        artistPercentage: eventAccount.artistPercentage,
        venuePercentage: eventAccount.venuePercentage,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Account does not exist')) {
        throw new AccountNotFoundError(eventPda);
      }
      throw this.handleError(error, 'getEventRoyalties');
    }
  }

  async getEventAccount(eventPda: string): Promise<EventInfo> {
    try {
      const eventPubkey = fromBase58(eventPda);
      const event = await (this.program.account as any).event.fetch(eventPubkey);

      const nameBytes = new Uint8Array(event.name);
      const name = Buffer.from(nameBytes).toString('utf-8').replace(/\0/g, '');

      const uriBytes = new Uint8Array(event.metadataUri);
      const metadataUri = Buffer.from(uriBytes).toString('utf-8').replace(/\0/g, '');

      const descBytes = new Uint8Array(event.description);
      const description = Buffer.from(descBytes).toString('utf-8').replace(/\0/g, '');

      return {
        venue: toBase58(event.venue),
        eventId: event.eventId.toNumber(),
        name,
        ticketPrice: event.ticketPrice.toNumber(),
        totalTickets: event.totalTickets,
        ticketsSold: event.ticketsSold,
        ticketsReserved: event.ticketsReserved,
        startTime: event.startTime.toNumber(),
        endTime: event.endTime.toNumber(),
        refundWindow: event.refundWindow.toNumber(),
        metadataUri,
        oracleFeed: toBase58(event.oracleFeed),
        description,
        transferable: event.transferable,
        resaleable: event.resaleable,
        merkleTree: toBase58(event.merkleTree),
        artistWallet: toBase58(event.artistWallet),
        artistPercentage: event.artistPercentage,
        venuePercentage: event.venuePercentage,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Account does not exist')) {
        throw new AccountNotFoundError(eventPda);
      }
      throw this.handleError(error, 'getEventAccount');
    }
  }

  // ==========================================================================
  // TICKET OPERATIONS
  // ==========================================================================

  async registerTicket(params: RegisterTicketParams): Promise<RegisterTicketResult> {
    try {
      const eventPubkey = fromBase58(params.eventPda);
      const nftAssetId = fromBase58(params.nftAssetId);

      const [ticketPda] = deriveTicketPDA(this.programId, eventPubkey, params.ticketId);

      const signature = await (this.program.methods as any)
        .registerTicket(
          new BN(params.ticketId.toString()),
          nftAssetId,
          params.ownerId
        )
        .accounts({
          authority: this.platformWallet.publicKey,
          event: eventPubkey,
          ticket: ticketPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await this.connection.confirmTransaction(signature);

      return {
        ticketPda: toBase58(ticketPda),
        signature,
        ticketId: params.ticketId,
      };
    } catch (error) {
      throw this.handleError(error, 'registerTicket');
    }
  }

  async transferTicket(params: TransferTicketParams): Promise<string> {
    try {
      const ticketInfo = await this.getTicketStatus(params.ticketPda);
      if (ticketInfo.used) {
        throw new TicketAlreadyUsedError(params.ticketPda);
      }

      const eventPubkey = fromBase58(params.eventPda);
      const ticketPubkey = fromBase58(params.ticketPda);

      const signature = await (this.program.methods as any)
        .transferTicket(params.newOwnerId)
        .accounts({
          authority: this.platformWallet.publicKey,
          event: eventPubkey,
          ticket: ticketPubkey,
        })
        .rpc();

      await this.connection.confirmTransaction(signature);

      return signature;
    } catch (error) {
      throw this.handleError(error, 'transferTicket');
    }
  }

  async verifyTicket(params: VerifyTicketParams): Promise<string> {
    try {
      const ticketInfo = await this.getTicketStatus(params.ticketPda);
      if (ticketInfo.used) {
        throw new TicketAlreadyUsedError(params.ticketPda);
      }

      const eventPubkey = fromBase58(params.eventPda);
      const ticketPubkey = fromBase58(params.ticketPda);

      const signature = await (this.program.methods as any)
        .verifyTicket()
        .accounts({
          validator: this.platformWallet.publicKey,
          event: eventPubkey,
          ticket: ticketPubkey,
        })
        .rpc();

      await this.connection.confirmTransaction(signature);

      return signature;
    } catch (error) {
      throw this.handleError(error, 'verifyTicket');
    }
  }

  async getTicketStatus(ticketPda: string): Promise<TicketInfo> {
    try {
      const ticketPubkey = fromBase58(ticketPda);
      const ticket = await (this.program.account as any).ticket.fetch(ticketPubkey);

      return {
        event: toBase58(ticket.event),
        ticketId: ticket.ticketId.toNumber(),
        nftAssetId: toBase58(ticket.nftAssetId),
        currentOwnerId: ticket.currentOwnerId,
        used: ticket.used,
        verifiedAt: ticket.verifiedAt ? ticket.verifiedAt.toNumber() : null,
        transferCount: ticket.transferCount,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Account does not exist')) {
        throw new AccountNotFoundError(ticketPda);
      }
      throw this.handleError(error, 'getTicketStatus');
    }
  }

  async getTicketAccount(ticketPda: string): Promise<TicketInfo> {
    return this.getTicketStatus(ticketPda);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  getPlatformWallet(): PublicKey {
    return this.platformWallet.publicKey;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getConnection(): Connection {
    return this.connection;
  }

  private handleError(error: any, operation: string): BlockchainError {
    if (error instanceof BlockchainError) {
      return error;
    }

    if (error?.logs) {
      return new TransactionError(
        `Transaction failed in ${operation}: ${error.message || 'Unknown error'}`,
        error.signature,
        error.logs
      );
    }

    return new BlockchainError(
      `Error in ${operation}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  async close(): Promise<void> {
    // Connection cleanup is automatic in web3.js
  }
}
