# Week 3 Implementation Summary: Backend Blockchain Integration

## ✅ Completed - December 18, 2025

### Overview
Successfully integrated the shared BlockchainClient into event-service and minting-service. Events now create on-chain records with immutable royalty splits, and tickets register on-chain after NFT minting.

---

## 📁 Files Created

### Database Migrations
1. **`database/migrations/postgresql/001_add_blockchain_fields_to_events.sql`**
   - Added columns: `event_pda`, `artist_wallet`, `artist_percentage`, `venue_percentage`, `blockchain_status`
   - Indexes for blockchain lookups
   - Constraint: Total royalty percentage ≤ 100%

2. **`database/migrations/postgresql/002_add_blockchain_fields_to_tickets.sql`**
   - Added columns: `ticket_pda`, `nft_asset_id`, `event_pda`, `transfer_count`, `used`, `verified_at`, `verification_signature`, `blockchain_status`
   - Indexes for efficient blockchain queries

### Event Service
3. **`backend/services/event-service/src/services/blockchain.service.ts`**
   - `EventBlockchainService` class
   - Wraps BlockchainClient for event operations
   - Converts event data → blockchain parameters
   - Derives venue PDA (venues not yet on-chain)
   - Error handling and logging

### Minting Service
4. **`backend/services/minting-service/src/services/blockchain.service.ts`**
   - `MintingBlockchainService` class
   - Wraps BlockchainClient for ticket registration
   - Links minted NFTs to on-chain ticket records
   - Error handling and logging

---

## 🔧 Files Modified

### Event Service Integration
5. **`backend/services/event-service/src/services/event.service.ts`**
   - Imported `EventBlockchainService`
   - Added blockchain service to constructor
   - After database transaction, calls `createEventOnChain()`
   - Updates event record with `event_pda` and `blockchain_status`
   - Blockchain failures do NOT rollback database (DB is source of truth)
   - New event parameters: `artist_wallet`, `artist_percentage`, `venue_percentage`

### Minting Service Integration
6. **`backend/services/minting-service/src/services/MintingOrchestrator.ts`**
   - Imported `MintingBlockchainService`
   - Added blockchain service to constructor
   - After NFT mint and DB save, calls `registerTicketOnChain()`
   - Fetches `event_pda` from events table
   - Updates ticket record with `ticket_pda`, `event_pda`, `blockchain_status`
   - Blockchain failures do NOT fail the mint (can be retried)
   - New ticketData parameter: `userId` (for on-chain owner)

---

## 🔄 Integration Flow

### Event Creation Flow
```
1. User creates event via API
2. event-service validates and saves to database
3. Database transaction completes (event exists)
4. EventBlockchainService.createEventOnChain():
   - Derives venue PDA
   - Converts percentages to basis points
   - Calls BlockchainClient.createEvent()
   - Returns event_pda
5. Update database with event_pda and blockchain_status='synced'
6. If blockchain fails: blockchain_status='failed' (event still exists)
```

### Ticket Minting Flow
```
1. User purchases ticket
2. Minting job queued
3. MintingOrchestrator mints NFT via Metaplex
4. Save mint record to database (ticket exists)
5. MintingBlockchainService.registerTicketOnChain():
   - Fetch event_pda from events table
   - Calls BlockchainClient.registerTicket()
   - Returns ticket_pda
6. Update database with ticket_pda, event_pda, blockchain_status='registered'
7. If blockchain fails: blockchain_status='failed' (ticket still exists)
```

---

## 🎯 Key Design Decisions

### 1. Database is Source of Truth
- Blockchain sync happens AFTER database writes
- Blockchain failures do NOT rollback database transactions
- Failed syncs marked with `blockchain_status='failed'` for retry

### 2. Synchronous Blockchain Calls
- Week 3 uses synchronous calls (simpler implementation)
- Can optimize with queues in Week 5 if needed

### 3. Venue PDA Derivation
- Venues not yet on blockchain
- Event service derives venue PDA using `deriveVenuePDA(programId, venueId)`
- Venue blockchain integration deferred to later

### 4. Error Handling Strategy
- Log blockchain errors but don't fail user-facing operations
- Users see immediate success (database write)
- Background: Platform can retry blockchain sync

---

## 📊 Database Schema Changes

### Events Table
```sql
event_pda VARCHAR(44)               -- Solana PDA address
artist_wallet VARCHAR(44)           -- Royalty recipient address
artist_percentage DECIMAL(5,2)      -- e.g., 5.00 = 5%
venue_percentage DECIMAL(5,2)       -- e.g., 5.00 = 5%
blockchain_status VARCHAR(50)       -- 'pending', 'synced', 'failed'
```

### Tickets Table
```sql
ticket_pda VARCHAR(44)              -- Solana PDA address
nft_asset_id VARCHAR(88)            -- Metaplex cNFT asset ID
event_pda VARCHAR(44)               -- Parent event (denormalized)
transfer_count INTEGER              -- Resale count
used BOOLEAN                        -- Scanned at door
verified_at TIMESTAMP               -- When scanned
verification_signature VARCHAR(88)  -- Blockchain tx signature
blockchain_status VARCHAR(50)       -- 'pending', 'registered', 'failed'
```

---

## 🔑 Environment Variables

Both services need these variables:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
TICKETTOKEN_PROGRAM_ID=BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS
PLATFORM_WALLET_PATH=/path/to/devnet-wallet.json

# Optional
ORACLE_FEED_ADDRESS=<oracle_pubkey>
DEFAULT_MERKLE_TREE=<merkle_tree_address>
```

---

## 📦 Dependencies

Both services already have required dependency:
- `@tickettoken/shared` (file:../../shared) ✅

The shared package includes:
- `@solana/web3.js` ^1.95.0
- `@coral-xyz/anchor` ^0.30.0
- `bs58` ^5.0.0

---

## 🧪 Testing Checklist

### Event Service
- [ ] Create event with artist_wallet + percentages → returns event_pda
- [ ] Event without artist_wallet → skips blockchain sync
- [ ] Blockchain failure → event still created, status='failed'
- [ ] Verify royalty percentages stored correctly (DB vs chain)

### Minting Service
- [ ] Mint ticket with userId → returns ticket_pda
- [ ] Ticket without userId → skips blockchain registration
- [ ] Event without event_pda → skips blockchain registration
- [ ] Blockchain failure → ticket still minted, status='failed'
- [ ] Verify ticket links to correct event_pda

### Integration
- [ ] Full flow: Create event → Buy ticket → Both on-chain
- [ ] Verify database fields populated correctly
- [ ] Check blockchain explorers for transactions

---

## 🚀 Next Steps (Week 4)

1. **Resale Integration**
   - Create marketplace-service blockchain integration
   - `transferTicket()` on resale
   - Read royalties from chain for payment splits

2. **Retry Mechanism**
   - Background job to retry failed blockchain syncs
   - Query for `blockchain_status='failed'`
   - Re-attempt sync with exponential backoff

3. **Admin Dashboard**
   - View blockchain sync status
   - Manual retry buttons
   - Blockchain explorer links

4. **Testing**
   - End-to-end tests with devnet
   - Load testing blockchain calls
   - Error scenario testing

---

## 📝 Notes

### Known Limitations
- Venues not yet on blockchain (deriving PDAs for now)
- No automatic retry of failed blockchain syncs
- Synchronous blockchain calls (may slow down API responses)

### Future Enhancements
- Queue-based blockchain sync (async)
- Webhook notifications for blockchain events
- Blockchain state verification cron job
- Support for multiple program deployments (devnet/mainnet)

---

## ✅ Week 3 Complete!

All integration points implemented. Events and tickets now sync to blockchain with proper error handling. Ready for Week 4 resale integration.
