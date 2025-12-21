/**
 * Program-Derived Address (PDA) Derivation Helpers
 * 
 * Functions to derive deterministic addresses for on-chain accounts
 * in the TicketToken program.
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Derives the platform PDA
 * Seeds: ["platform"]
 * 
 * @param programId - The TicketToken program ID
 * @returns [PublicKey, bump] tuple
 */
export function derivePlatformPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('platform')],
    programId
  );
}

/**
 * Derives a venue PDA
 * Seeds: ["venue", venueId]
 * 
 * @param programId - The TicketToken program ID
 * @param venueId - The venue identifier string
 * @returns [PublicKey, bump] tuple
 */
export function deriveVenuePDA(
  programId: PublicKey,
  venueId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('venue'), Buffer.from(venueId)],
    programId
  );
}

/**
 * Derives an event PDA
 * Seeds: ["event", venuePubkey, eventId]
 * 
 * @param programId - The TicketToken program ID
 * @param venuePubkey - The venue's public key
 * @param eventId - The event ID (u64)
 * @returns [PublicKey, bump] tuple
 */
export function deriveEventPDA(
  programId: PublicKey,
  venuePubkey: PublicKey,
  eventId: number | bigint
): [PublicKey, number] {
  // Convert eventId to little-endian u64 bytes
  const eventIdBuffer = Buffer.alloc(8);
  eventIdBuffer.writeBigUInt64LE(BigInt(eventId));

  return PublicKey.findProgramAddressSync(
    [Buffer.from('event'), venuePubkey.toBuffer(), eventIdBuffer],
    programId
  );
}

/**
 * Derives a ticket PDA
 * Seeds: ["ticket", eventPubkey, ticketId]
 * 
 * @param programId - The TicketToken program ID
 * @param eventPubkey - The event's public key
 * @param ticketId - The ticket ID (u64)
 * @returns [PublicKey, bump] tuple
 */
export function deriveTicketPDA(
  programId: PublicKey,
  eventPubkey: PublicKey,
  ticketId: number | bigint
): [PublicKey, number] {
  // Convert ticketId to little-endian u64 bytes
  const ticketIdBuffer = Buffer.alloc(8);
  ticketIdBuffer.writeBigUInt64LE(BigInt(ticketId));

  return PublicKey.findProgramAddressSync(
    [Buffer.from('ticket'), eventPubkey.toBuffer(), ticketIdBuffer],
    programId
  );
}

/**
 * Derives a reentrancy guard PDA for event operations
 * Seeds: ["reentrancy", context, identifier]
 * 
 * @param programId - The TicketToken program ID
 * @param context - The context string (e.g., "event", "listing")
 * @param identifier - Unique identifier (typically a public key or ID)
 * @returns [PublicKey, bump] tuple
 */
export function deriveReentrancyGuardPDA(
  programId: PublicKey,
  context: string,
  identifier: PublicKey | Buffer
): [PublicKey, number] {
  const identifierBuffer = identifier instanceof PublicKey 
    ? identifier.toBuffer() 
    : identifier;

  return PublicKey.findProgramAddressSync(
    [Buffer.from('reentrancy'), Buffer.from(context), identifierBuffer],
    programId
  );
}

/**
 * Derives a listing reentrancy guard PDA
 * Seeds: ["reentrancy", "listing", assetId]
 * 
 * @param programId - The TicketToken program ID
 * @param assetId - The NFT asset ID
 * @returns [PublicKey, bump] tuple
 */
export function deriveListingReentrancyGuardPDA(
  programId: PublicKey,
  assetId: PublicKey
): [PublicKey, number] {
  return deriveReentrancyGuardPDA(programId, 'listing', assetId);
}

/**
 * Converts a PublicKey to a base58 string
 * Helper for returning addresses as strings
 * 
 * @param pubkey - The public key to convert
 * @returns Base58 string representation
 */
export function toBase58(pubkey: PublicKey): string {
  return pubkey.toBase58();
}

/**
 * Converts a base58 string to a PublicKey
 * Helper for parsing address strings
 * 
 * @param address - Base58 address string
 * @returns PublicKey object
 */
export function fromBase58(address: string): PublicKey {
  return new PublicKey(address);
}
