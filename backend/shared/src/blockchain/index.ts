/**
 * Blockchain Module - Public API
 * 
 * Exports for the TicketToken blockchain client.
 * This module provides backend services with the ability to interact
 * with the deployed Solana smart contract.
 */

// Main client
export { BlockchainClient } from './client';

// Type definitions
export type {
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
} from './types';

// Error classes
export {
  BlockchainError,
  TransactionError,
  AccountNotFoundError,
  ConfigurationError,
  TicketAlreadyUsedError,
  InvalidRoyaltyError,
} from './types';

// PDA derivation helpers
export {
  derivePlatformPDA,
  deriveVenuePDA,
  deriveEventPDA,
  deriveTicketPDA,
  deriveReentrancyGuardPDA,
  deriveListingReentrancyGuardPDA,
  toBase58,
  fromBase58,
} from './pda';
