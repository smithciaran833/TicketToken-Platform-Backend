# TicketToken Blockchain Implementation Plan

## Overview

**Goal:** Build a custodial ticketing platform where blockchain is invisible infrastructure that enforces royalty splits on every resale.

**User Experience:** Email/password signup, credit card payments, "My Tickets" page, QR code at door. Zero crypto knowledge required.

**Blockchain Purpose:**
- Store immutable royalty splits per event (set at creation, can't be changed)
- Track ticket ownership history (audit trail)
- Mark tickets as USED (prevents double-scan)
- Prove platform isn't cheating artists/venues

---

## Architecture Decisions

### Custodial Model
- Platform holds all NFTs in platform-controlled wallets
- Users never see/touch blockchain
- Database maps users to tickets
- Resales MUST go through platform (enforces royalties)

### Money Flow
- Stripe handles ALL money movement
- Platform never touches funds
- Stripe Connect splits payments to artist/venue/seller
- Backend reads royalty % from blockchain, tells Stripe how to split

### What Goes On-Chain

| Data | Why |
|------|-----|
| Event royalty splits | Immutable, artists/venues can verify their deal |
| Ticket ownership (user ID) | Audit trail of every transfer |
| Ticket used status | Prevents double-scan at door |
| Transfer count | Proves every resale happened through platform |

### What Stays Off-Chain

| Data | Why |
|------|-----|
| User accounts | Standard auth, no wallets needed |
| Payment processing | Stripe handles compliance |
| Ticket metadata | Database is faster for queries |
| Listing/marketplace data | Backend controls resale flow |

---

## Smart Contract Changes

### Program: tickettoken

### Files to MODIFY

#### 1. `smart-contracts/programs/tickettoken/src/state/event.rs`

**Changes:**
- Add fields to Event struct:
```rust
  pub artist_wallet: Pubkey,      // 32 bytes - royalty recipient
  pub artist_percentage: u16,     // basis points (500 = 5%)
  pub venue_percentage: u16,      // basis points (500 = 5%)
```
- Update SIZE constant to account for new fields (+36 bytes)

---

#### 2. `smart-contracts/programs/tickettoken/src/state/mod.rs`

**Changes:**
- Update CreateEventParams struct:
```rust
  pub artist_wallet: Pubkey,
  pub artist_percentage: u16,
  pub venue_percentage: u16,
```
- Export new Ticket struct from ticket.rs

---

#### 3. `smart-contracts/programs/tickettoken/src/instructions/create_event.rs`

**Changes:**
- Add validation:
```rust
  require!(
      params.artist_percentage + params.venue_percentage <= 10000,
      TicketTokenError::InvalidRoyaltyPercentage
  );
```
- Store royalty fields:
```rust
  event.artist_wallet = params.artist_wallet;
  event.artist_percentage = params.artist_percentage;
  event.venue_percentage = params.venue_percentage;
```

---

#### 4. `smart-contracts/programs/tickettoken/src/instructions/verify_ticket.rs`

**Changes:**
- Replace mock implementation with actual logic:
```rust
  pub fn verify_ticket(ctx: Context<VerifyTicket>) -> Result<()> {
      let ticket = &mut ctx.accounts.ticket;
      require!(!ticket.used, TicketTokenError::TicketAlreadyUsed);
      
      ticket.used = true;
      ticket.verified_at = Some(Clock::get()?.unix_timestamp);
      
      emit!(TicketVerified { ... });
      Ok(())
  }
```

---

#### 5. `smart-contracts/programs/tickettoken/src/instructions/mod.rs`

**Changes:**
- Add exports:
```rust
  pub mod register_ticket;
  pub mod transfer_ticket;
  pub use register_ticket::*;
  pub use transfer_ticket::*;
```

---

#### 6. `smart-contracts/programs/tickettoken/src/lib.rs`

**Changes:**
- Add instruction handlers:
```rust
  pub fn register_ticket(
      ctx: Context<RegisterTicket>,
      ticket_id: u64,
      nft_asset_id: Pubkey,
      owner_id: String,
  ) -> Result<()>

  pub fn transfer_ticket(
      ctx: Context<TransferTicket>,
      new_owner_id: String,
  ) -> Result<()>
```

---

#### 7. `smart-contracts/programs/tickettoken/src/errors.rs`

**Changes:**
- Add error codes:
```rust
  #[msg("Invalid royalty percentage - total must not exceed 100%")]
  InvalidRoyaltyPercentage,
  
  #[msg("Ticket has already been used")]
  TicketAlreadyUsed,
  
  #[msg("Invalid ticket for this event")]
  InvalidTicket,
  
  #[msg("Ticket transfer not allowed for this event")]
  TransferNotAllowed,
  
  #[msg("Owner ID exceeds maximum length")]
  OwnerIdTooLong,
```

---

#### 8. `smart-contracts/Cargo.toml`

**Changes:**
- Remove marketplace from workspace:
```toml
  [workspace]
  members = [
      "programs/tickettoken",
      # REMOVE: "programs/marketplace",
  ]
```

---

### Files to CREATE

#### 1. `smart-contracts/programs/tickettoken/src/state/ticket.rs`

**Contents:**
```rust
use anchor_lang::prelude::*;

#[account]
pub struct Ticket {
    pub event: Pubkey,              // 32 bytes - Parent event PDA
    pub ticket_id: u64,             // 8 bytes - Unique ID within event
    pub nft_asset_id: Pubkey,       // 32 bytes - Metaplex cNFT asset ID
    pub current_owner_id: String,   // 4 + 64 bytes - Backend user ID
    pub used: bool,                 // 1 byte - Has been scanned
    pub verified_at: Option<i64>,   // 1 + 8 bytes - When scanned
    pub transfer_count: u32,        // 4 bytes - Number of resales
    pub bump: u8,                   // 1 byte - PDA bump
}

impl Ticket {
    pub const MAX_OWNER_ID_LEN: usize = 64;
    pub const SIZE: usize = 8 + 32 + 8 + 32 + (4 + 64) + 1 + 9 + 4 + 1; // ~163 bytes
}
```

---

#### 2. `smart-contracts/programs/tickettoken/src/instructions/register_ticket.rs`

**Contents:**
```rust
use anchor_lang::prelude::*;
use crate::state::{Event, Ticket};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
#[instruction(ticket_id: u64, nft_asset_id: Pubkey, owner_id: String)]
pub struct RegisterTicket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub event: Account<'info, Event>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"ticket", event.key().as_ref(), ticket_id.to_le_bytes().as_ref()],
        bump,
        space = 8 + Ticket::SIZE,
    )]
    pub ticket: Account<'info, Ticket>,
    
    pub system_program: Program<'info, System>,
}

pub fn register_ticket(
    ctx: Context<RegisterTicket>,
    ticket_id: u64,
    nft_asset_id: Pubkey,
    owner_id: String,
) -> Result<()> {
    require!(owner_id.len() <= Ticket::MAX_OWNER_ID_LEN, TicketTokenError::OwnerIdTooLong);
    
    let ticket = &mut ctx.accounts.ticket;
    ticket.event = ctx.accounts.event.key();
    ticket.ticket_id = ticket_id;
    ticket.nft_asset_id = nft_asset_id;
    ticket.current_owner_id = owner_id;
    ticket.used = false;
    ticket.verified_at = None;
    ticket.transfer_count = 0;
    ticket.bump = ctx.bumps.ticket;
    
    Ok(())
}
```

---

#### 3. `smart-contracts/programs/tickettoken/src/instructions/transfer_ticket.rs`

**Contents:**
```rust
use anchor_lang::prelude::*;
use crate::state::{Event, Ticket};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
pub struct TransferTicket<'info> {
    pub authority: Signer<'info>,
    
    #[account(constraint = event.resaleable @ TicketTokenError::TransferNotAllowed)]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"ticket", event.key().as_ref(), ticket.ticket_id.to_le_bytes().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,
}

pub fn transfer_ticket(
    ctx: Context<TransferTicket>,
    new_owner_id: String,
) -> Result<()> {
    require!(new_owner_id.len() <= Ticket::MAX_OWNER_ID_LEN, TicketTokenError::OwnerIdTooLong);
    
    let ticket = &mut ctx.accounts.ticket;
    require!(!ticket.used, TicketTokenError::TicketAlreadyUsed);
    
    ticket.current_owner_id = new_owner_id;
    ticket.transfer_count += 1;
    
    Ok(())
}
```

---

### Files to DELETE

#### `smart-contracts/programs/marketplace/` (entire directory)

**Reason:** Not needed for custodial model. Resales handled by backend + Stripe.

---

## Backend Changes

### New Package: Shared Blockchain Client

**Location:** `backend/shared/src/blockchain/`

**Files to CREATE:**
```
backend/shared/src/blockchain/
├── index.ts           # Exports all public APIs
├── client.ts          # BlockchainClient class
├── types.ts           # TypeScript interfaces
└── pda.ts             # PDA derivation helpers
```

#### `client.ts` - Main Client Class
```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';

export class BlockchainClient {
  private program: Program;
  private platformWallet: Keypair;

  // Event operations
  async createEvent(params: CreateEventParams): Promise<string>  // Returns event PDA
  async getEventRoyalties(eventPda: string): Promise<RoyaltyInfo>

  // Ticket operations  
  async registerTicket(params: RegisterTicketParams): Promise<string>  // Returns ticket PDA
  async transferTicket(params: TransferTicketParams): Promise<string>  // Returns tx signature
  async verifyTicket(params: VerifyTicketParams): Promise<string>      // Returns tx signature
  async getTicketStatus(ticketPda: string): Promise<TicketInfo>
}
```

#### `types.ts` - Interfaces
```typescript
export interface CreateEventParams {
  eventId: number;
  name: string;
  artistWallet: string;
  artistPercentage: number;  // basis points
  venuePercentage: number;   // basis points
  // ... other event params
}

export interface RegisterTicketParams {
  eventPda: string;
  ticketId: number;
  nftAssetId: string;
  ownerId: string;  // User ID from database
}

export interface TransferTicketParams {
  ticketPda: string;
  eventPda: string;
  newOwnerId: string;
}

export interface VerifyTicketParams {
  ticketPda: string;
  eventPda: string;
}

export interface RoyaltyInfo {
  artistWallet: string;
  artistPercentage: number;
  venuePercentage: number;
}

export interface TicketInfo {
  used: boolean;
  transferCount: number;
  currentOwnerId: string;
  verifiedAt: number | null;
}
```

---

### Service Integrations

#### 1. event-service

**File to MODIFY:** `backend/services/event-service/src/services/event.service.ts`

**Changes:**
- After creating event in database, call blockchain:
```typescript
  const eventPda = await blockchainClient.createEvent({
    eventId: event.id,
    artistWallet: event.artist_wallet,
    artistPercentage: event.artist_percentage * 100,  // Convert to basis points
    venuePercentage: event.venue_percentage * 100,
    // ...
  });
  
  await db('events').where({ id: event.id }).update({ event_pda: eventPda });
```

**File to CREATE:** `backend/services/event-service/src/services/blockchain.service.ts`
- Wrapper around BlockchainClient for event-specific operations

---

#### 2. minting-service

**File to MODIFY:** `backend/services/minting-service/src/services/MintingOrchestrator.ts`

**Changes:**
- After minting NFT via Metaplex, register on-chain:
```typescript
  // After: const mintResult = await this.nftService.mintNFT({...});
  
  const ticketPda = await blockchainClient.registerTicket({
    eventPda: ticketData.eventPda,
    ticketId: ticketData.ticketId,
    nftAssetId: mintResult.assetId,
    ownerId: ticketData.userId,
  });
  
  await db('tickets').where({ id: ticketData.ticketId }).update({ ticket_pda: ticketPda });
```

---

#### 3. marketplace-service

**File to CREATE:** `backend/services/marketplace-service/src/services/royalty.service.ts`

**Contents:**
```typescript
export class RoyaltyService {
  async calculateResaleSplit(eventPda: string, salePrice: number) {
    // Read immutable royalties from blockchain
    const royalties = await blockchainClient.getEventRoyalties(eventPda);
    
    const artistAmount = (salePrice * royalties.artistPercentage) / 10000;
    const venueAmount = (salePrice * royalties.venuePercentage) / 10000;
    const platformAmount = (salePrice * 500) / 10000;  // 5% platform fee
    const sellerAmount = salePrice - artistAmount - venueAmount - platformAmount;
    
    return { artistAmount, venueAmount, platformAmount, sellerAmount };
  }
}
```

**File to MODIFY:** `backend/services/marketplace-service/src/services/listing.service.ts`

**Changes:**
- On resale purchase:
  1. Calculate splits using RoyaltyService (reads from chain)
  2. Process Stripe payment with splits
  3. Call `blockchainClient.transferTicket()` to update ownership
  4. Update database

---

#### 4. scanning-service (or ticket-service)

**File to MODIFY:** `backend/services/ticket-service/src/services/verification.service.ts`

**Changes:**
```typescript
async verifyTicketAtDoor(ticketId: string, userId: string) {
  // 1. Check database
  const ticket = await db('tickets').where({ id: ticketId, owner_id: userId }).first();
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.used) throw new Error('Ticket already used');
  
  // 2. Mark USED on blockchain (immutable!)
  const signature = await blockchainClient.verifyTicket({
    ticketPda: ticket.ticket_pda,
    eventPda: ticket.event_pda,
  });
  
  // 3. Update database
  await db('tickets').where({ id: ticketId }).update({
    used: true,
    verified_at: new Date(),
    verification_signature: signature,
  });
  
  return { valid: true, signature };
}
```

---

## Database Migrations

### Migration 1: Events Table

**File:** `database/migrations/001_add_blockchain_fields_to_events.sql`
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_pda VARCHAR(44);
ALTER TABLE events ADD COLUMN IF NOT EXISTS artist_wallet VARCHAR(44);
ALTER TABLE events ADD COLUMN IF NOT EXISTS artist_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_percentage DECIMAL(5,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_events_event_pda ON events(event_pda);

COMMENT ON COLUMN events.event_pda IS 'Solana PDA for on-chain event account';
COMMENT ON COLUMN events.artist_percentage IS 'Artist royalty percentage on resales (e.g., 5.00 = 5%)';
COMMENT ON COLUMN events.venue_percentage IS 'Venue royalty percentage on resales';
```

### Migration 2: Tickets Table

**File:** `database/migrations/002_add_blockchain_fields_to_tickets.sql`
```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_pda VARCHAR(44);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS nft_asset_id VARCHAR(88);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transfer_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verification_signature VARCHAR(88);

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_pda ON tickets(ticket_pda);
CREATE INDEX IF NOT EXISTS idx_tickets_nft_asset_id ON tickets(nft_asset_id);
CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);

COMMENT ON COLUMN tickets.ticket_pda IS 'Solana PDA for on-chain ticket account';
COMMENT ON COLUMN tickets.nft_asset_id IS 'Metaplex compressed NFT asset ID';
COMMENT ON COLUMN tickets.transfer_count IS 'Number of resales (from blockchain)';
COMMENT ON COLUMN tickets.verification_signature IS 'Blockchain tx signature when ticket was verified';
```

---

## Environment Configuration

Add to relevant services' `.env`:
```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
PLATFORM_WALLET_PATH=/path/to/platform-wallet.json
TICKETTOKEN_PROGRAM_ID=2Pt5c9QcKSxMe9cBpfhdmfWHUwq8NUk7kFmJREJsNm2b
```

Services that need these:
- event-service
- minting-service
- marketplace-service
- ticket-service (for verification)

---

## User Flows

### Primary Sale
```
1. User browses events (database query)
2. User clicks "Buy Ticket"
3. Frontend shows Stripe payment form
4. User pays via credit card
5. Backend:
   a. Stripe charges card
   b. Creates ticket record in DB (owner = user ID)
   c. Queues minting job
   d. Returns success immediately
6. Minting Worker (async):
   a. Mints NFT to platform wallet via Metaplex
   b. Calls registerTicket() on blockchain
   c. Updates ticket record with ticket_pda, nft_asset_id
7. User sees ticket in "My Tickets"
```

### Resale
```
1. Seller clicks "Sell Ticket"
2. Seller enters price ($200)
3. Backend:
   a. Reads royalties from blockchain (immutable!)
   b. Calculates: Seller gets $170, Artist $10, Venue $10, Platform $10
   c. Shows seller: "You'll receive $170"
4. Seller confirms listing
5. Backend creates listing in database
6. Buyer sees listing, clicks "Buy"
7. Buyer pays via Stripe
8. Backend:
   a. Stripe charges buyer $200
   b. Stripe transfers $170 to seller
   c. Stripe transfers $10 to artist (via Connect)
   d. Stripe transfers $10 to venue (via Connect)
   e. Platform keeps $10
   f. Calls transferTicket() on blockchain
   g. Updates database (new owner)
9. Buyer sees ticket in "My Tickets"
10. Seller sees "$170 received"
```

### Verification at Door
```
1. User opens "My Tickets"
2. Frontend generates QR code (contains signed token with ticket ID + user ID)
3. User shows QR to scanner
4. Scanner app:
   a. Decodes QR token
   b. Calls verification API
5. Backend:
   a. Validates token signature
   b. Checks database: ticket exists, user owns it, not used
   c. Calls verifyTicket() on blockchain (marks USED permanently)
   d. Updates database: used = true
   e. Returns success
6. Scanner shows: "✓ Valid - Welcome!"
7. User enters venue
8. Same ticket can NEVER be scanned again (blockchain enforced)
```

---

## Implementation Order

### Week 1: Foundation
- [ ] Update smart contract (Event struct + Ticket struct + instructions)
- [ ] Write contract tests
- [ ] Deploy to devnet
- [ ] Run database migrations

### Week 2: Blockchain Client
- [ ] Create shared blockchain client package
- [ ] Implement all methods (createEvent, registerTicket, transferTicket, verifyTicket)
- [ ] Write integration tests against devnet
- [ ] Add to shared package exports

### Week 3: Event + Minting Integration
- [ ] Integrate event-service with blockchain (createEvent)
- [ ] Integrate minting-service with blockchain (registerTicket)
- [ ] Test: Create event → Buy ticket → Verify on-chain registration

### Week 4: Resale Integration
- [ ] Create royalty service (reads from chain)
- [ ] Integrate marketplace-service with blockchain (transferTicket)
- [ ] Test: List ticket → Buy resale → Verify royalty calculation → Verify ownership transfer

### Week 5: Verification + Polish
- [ ] Integrate scanning/verification with blockchain (verifyTicket)
- [ ] Test: Full flow including door scanning
- [ ] Error handling and retry logic
- [ ] Monitoring and logging
- [ ] Documentation

---

## What You Get At The End

### For Users
- Sign up with email, pay with credit card
- See tickets in the app
- Sell tickets with a button
- Show QR code at door
- No crypto knowledge needed

### For Artists/Venues
- Set royalty percentage when creating event
- Get paid automatically on every resale
- Can verify their deal on public blockchain
- Can audit all resale activity

### For You (Platform)
- Immutable audit trail
- Can prove you're not cheating
- Royalties enforced by code, not trust
- Stripe handles all compliance

### Technical Proof
- Every event has on-chain record with locked royalty splits
- Every ticket has on-chain record linking to event
- Every resale updates on-chain ownership
- Every door scan marks ticket USED on-chain
- Full history is public and immutable
