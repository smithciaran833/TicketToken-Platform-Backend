/**
 * TypeScript Type Definitions for Blockchain Client
 * 
 * Interfaces for parameters, responses, and configuration
 * used by the BlockchainClient class.
 */

import { Commitment } from '@solana/web3.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for initializing the BlockchainClient
 */
export interface BlockchainConfig {
  /** Solana RPC endpoint URL (e.g., https://api.devnet.solana.com) */
  rpcUrl: string;
  
  /** TicketToken program ID (base58 string) */
  programId: string;
  
  /** Path to platform wallet keypair JSON file */
  platformWalletPath: string;
  
  /** Transaction commitment level (default: 'confirmed') */
  commitment?: Commitment;
}

// ============================================================================
// Parameter Types (Input)
// ============================================================================

/**
 * Parameters for creating an event on-chain
 * Maps to the on-chain CreateEventParams struct
 */
export interface CreateEventParams {
  /** Database event ID (u64) */
  eventId: number | bigint;
  
  /** Venue PDA address (base58 string) */
  venuePda: string;
  
  /** Event name (max 32 bytes) */
  name: string;
  
  /** Ticket price in lamports */
  ticketPrice: number | bigint;
  
  /** Total ticket capacity */
  totalTickets: number;
  
  /** Event start timestamp (Unix seconds) */
  startTime: number | bigint;
  
  /** Event end timestamp (Unix seconds) */
  endTime: number | bigint;
  
  /** Refund window in seconds */
  refundWindow: number | bigint;
  
  /** Metadata URI (max 64 bytes) */
  metadataUri: string;
  
  /** Oracle feed address for price validation */
  oracleFeed: string;
  
  /** Event description (max 200 bytes) */
  description: string;
  
  /** Whether tickets can be transferred */
  transferable: boolean;
  
  /** Whether tickets can be resold */
  resaleable: boolean;
  
  /** Compressed NFT merkle tree address */
  merkleTree: string;
  
  /** Artist wallet address (receives royalties) */
  artistWallet: string;
  
  /** Artist royalty percentage in basis points (e.g., 500 = 5%) */
  artistPercentage: number;
  
  /** Venue royalty percentage in basis points (e.g., 500 = 5%) */
  venuePercentage: number;
}

/**
 * Parameters for registering a ticket on-chain
 */
export interface RegisterTicketParams {
  /** Event PDA address (base58 string) */
  eventPda: string;
  
  /** Database ticket ID (u64) */
  ticketId: number | bigint;
  
  /** Compressed NFT asset ID (base58 string) */
  nftAssetId: string;
  
  /** Owner's user ID from database (max 64 chars) */
  ownerId: string;
}

/**
 * Parameters for transferring ticket ownership
 */
export interface TransferTicketParams {
  /** Ticket PDA address (base58 string) */
  ticketPda: string;
  
  /** Event PDA address (base58 string) */
  eventPda: string;
  
  /** New owner's user ID from database (max 64 chars) */
  newOwnerId: string;
}

/**
 * Parameters for verifying a ticket at the door
 */
export interface VerifyTicketParams {
  /** Ticket PDA address (base58 string) */
  ticketPda: string;
  
  /** Event PDA address (base58 string) */
  eventPda: string;
}

// ============================================================================
// Response Types (Output)
// ============================================================================

/**
 * Result returned after creating an event
 */
export interface CreateEventResult {
  /** The event's PDA address (base58 string) */
  eventPda: string;
  
  /** Transaction signature (base58 string) */
  signature: string;
  
  /** Event ID that was used */
  eventId: number | bigint;
}

/**
 * Result returned after registering a ticket
 */
export interface RegisterTicketResult {
  /** The ticket's PDA address (base58 string) */
  ticketPda: string;
  
  /** Transaction signature (base58 string) */
  signature: string;
  
  /** Ticket ID that was used */
  ticketId: number | bigint;
}

/**
 * Immutable royalty information from an event
 * Used by marketplace to calculate resale payment splits
 */
export interface RoyaltyInfo {
  /** Artist wallet address (base58 string) */
  artistWallet: string;
  
  /** Artist royalty percentage in basis points (500 = 5%) */
  artistPercentage: number;
  
  /** Venue royalty percentage in basis points (500 = 5%) */
  venuePercentage: number;
}

/**
 * Current status of a ticket
 */
export interface TicketInfo {
  /** Event PDA this ticket belongs to */
  event: string;
  
  /** Ticket ID */
  ticketId: number | bigint;
  
  /** NFT asset ID */
  nftAssetId: string;
  
  /** Current owner's user ID */
  currentOwnerId: string;
  
  /** Whether ticket has been used at door */
  used: boolean;
  
  /** Timestamp when ticket was verified (null if not verified) */
  verifiedAt: number | null;
  
  /** Number of times ticket has been transferred (resales) */
  transferCount: number;
}

/**
 * Full event account data from on-chain
 */
export interface EventInfo {
  /** Venue PDA */
  venue: string;
  
  /** Event ID */
  eventId: number | bigint;
  
  /** Event name */
  name: string;
  
  /** Ticket price in lamports */
  ticketPrice: number | bigint;
  
  /** Total capacity */
  totalTickets: number;
  
  /** Number of tickets sold */
  ticketsSold: number;
  
  /** Number of tickets reserved */
  ticketsReserved: number;
  
  /** Start timestamp */
  startTime: number | bigint;
  
  /** End timestamp */
  endTime: number | bigint;
  
  /** Refund window in seconds */
  refundWindow: number | bigint;
  
  /** Metadata URI */
  metadataUri: string;
  
  /** Oracle feed address */
  oracleFeed: string;
  
  /** Description */
  description: string;
  
  /** Transferable flag */
  transferable: boolean;
  
  /** Resaleable flag */
  resaleable: boolean;
  
  /** Merkle tree address */
  merkleTree: string;
  
  /** Artist wallet address */
  artistWallet: string;
  
  /** Artist royalty percentage (basis points) */
  artistPercentage: number;
  
  /** Venue royalty percentage (basis points) */
  venuePercentage: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error class for blockchain-related errors
 */
export class BlockchainError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly signature?: string,
    public readonly logs?: string[]
  ) {
    super(message);
    this.name = 'BlockchainError';
  }
}

/**
 * Error thrown when a transaction fails
 */
export class TransactionError extends BlockchainError {
  constructor(
    message: string,
    signature?: string,
    logs?: string[]
  ) {
    super(message, 'TRANSACTION_FAILED', signature, logs);
    this.name = 'TransactionError';
  }
}

/**
 * Error thrown when an account is not found
 */
export class AccountNotFoundError extends BlockchainError {
  constructor(address: string) {
    super(`Account not found: ${address}`, 'ACCOUNT_NOT_FOUND');
    this.name = 'AccountNotFoundError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends BlockchainError {
  constructor(message: string) {
    super(message, 'INVALID_CONFIG');
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when a ticket is already used
 */
export class TicketAlreadyUsedError extends BlockchainError {
  constructor(ticketPda: string) {
    super(`Ticket has already been used: ${ticketPda}`, 'TICKET_ALREADY_USED');
    this.name = 'TicketAlreadyUsedError';
  }
}

/**
 * Error thrown when royalty percentages are invalid
 */
export class InvalidRoyaltyError extends BlockchainError {
  constructor(message: string) {
    super(message, 'INVALID_ROYALTY');
    this.name = 'InvalidRoyaltyError';
  }
}
