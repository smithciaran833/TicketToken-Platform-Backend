# TICKET TRANSFER (GIFT) FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Transfer (Gift) |

---

## Executive Summary

**CRITICAL FINDING:** Two separate transfer systems exist that don't share code. Neither calls blockchain to transfer NFT ownership. The `BlockchainTransferService` exists but is **NEVER USED**.

---

## Two Transfer Systems

### System 1: ticket-service Transfer

**Location:** `backend/services/ticket-service/src/services/transferService.ts`

**Endpoint:** `POST /api/v1/transfer`

**Features:**
- ✅ Comprehensive validation
- ✅ Transfer cooldown (30 min)
- ✅ Daily transfer limits (10/day)
- ✅ Event-level transfer restrictions
- ✅ Blackout periods
- ✅ Identity verification checks
- ✅ Transfer deadline enforcement
- ✅ Max transfers per ticket
- ❌ **NO blockchain transfer**

### System 2: transfer-service (Separate Service)

**Location:** `backend/services/transfer-service/src/`

**Endpoints:**
- `POST /api/v1/transfers/gift` - Create gift transfer
- `POST /api/v1/transfers/:transferId/accept` - Accept transfer

**Features:**
- ✅ Gift transfer flow with acceptance code
- ✅ Expiration handling (48 hours)
- ✅ Get-or-create recipient user
- ❌ **NO blockchain transfer**
- ❌ BlockchainTransferService exists but never called

---

## ticket-service Transfer Flow

### Step 1: Initiate Transfer

**Endpoint:** `POST /api/v1/transfer`

**File:** `backend/services/ticket-service/src/services/transferService.ts`

**What happens:**
1. Validate transfer request
2. Lock ticket for update
3. Validate ownership
4. Check ticket status is 'active'
5. Check ticket is transferable
6. Check event allows transfers
7. Check transfer deadline
8. Check blackout periods
9. Check max transfers limit
10. Check identity verification (if required)
11. Update ticket `user_id` to new owner
12. Set ticket status to 'transferred'
13. Increment `transfer_count`
14. Create transfer record
15. Publish events to RabbitMQ
16. Send notifications

**What's MISSING:**
```typescript
// NO blockchain call anywhere!
// NFT ownership on Solana is NOT updated
```

### Validation Checks ✅ COMPREHENSIVE

| Check | Status |
|-------|--------|
| Self-transfer prevention | ✅ |
| Transfer cooldown (30 min) | ✅ |
| Daily limit (10/day) | ✅ |
| Recipient exists | ✅ |
| Recipient account active | ✅ |
| Recipient can receive transfers | ✅ |
| Recipient email verified | ✅ |
| Ticket exists | ✅ |
| Ticket is transferable | ✅ |
| Ticket status is 'active' | ✅ |
| Event allows transfers | ✅ |
| Transfer deadline not passed | ✅ |
| Not in blackout period | ✅ |
| Max transfers not exceeded | ✅ |
| Identity verification (if required) | ✅ |

---

## transfer-service Flow

### Step 1: Create Gift Transfer

**Endpoint:** `POST /api/v1/transfers/gift`

**File:** `backend/services/transfer-service/src/services/transfer.service.ts`

**What happens:**
1. Verify ticket ownership
2. Check ticket type is transferable
3. Get or create recipient user by email
4. Generate acceptance code
5. Set expiration (48 hours)
6. Create transfer record with status 'PENDING'

**Status:** ✅ Works (database only)

### Step 2: Accept Transfer

**Endpoint:** `POST /api/v1/transfers/:transferId/accept`

**What happens:**
1. Get transfer by ID and acceptance code
2. Verify not expired
3. Update ticket `user_id` to new owner
4. Mark transfer as 'COMPLETED'
5. Create transaction record

**What's MISSING:**
```typescript
// BlockchainTransferService.executeBlockchainTransfer() is NEVER called
// NFT ownership on Solana is NOT updated
```

---

## The Unused Blockchain Code

### BlockchainTransferService EXISTS

**File:** `backend/services/transfer-service/src/services/blockchain-transfer.service.ts`

**Capabilities:**
- ✅ Execute blockchain transfer
- ✅ Retry logic with exponential backoff
- ✅ Transaction confirmation polling
- ✅ Failed transfer recording for retry queue
- ✅ Ownership verification
- ✅ Metrics recording

**Problem:** Never instantiated or called by TransferService!

### NFTService EXISTS

**File:** `backend/services/transfer-service/src/services/nft.service.ts`

**Capabilities:**
- ✅ Transfer NFT via Metaplex
- ✅ Verify ownership
- ✅ Get NFT metadata
- ✅ Get NFT owner

**Problem:** Only called by BlockchainTransferService (which is never used)

---

## What Should Happen
```
User initiates transfer
        ↓
Validate transfer allowed
        ↓
Update database ownership
        ↓
Call BlockchainTransferService.executeBlockchainTransfer()  ← MISSING
        ↓
NFT transferred on Solana
        ↓
Update ticket with blockchain signature
        ↓
Transfer complete
```

## What Actually Happens
```
User initiates transfer
        ↓
Validate transfer allowed ✅
        ↓
Update database ownership ✅
        ↓
❌ NO blockchain call
        ↓
Database says new owner
Blockchain says old owner
        ↓
NFT ownership mismatch
```

---

## The Fix

### Option 1: Add Blockchain Call to ticket-service
```typescript
// In transferService.ts, after database update:

// Transfer NFT on blockchain
const blockchainResult = await blockchainClient.transferTicket({
  ticketPda: ticket.ticket_pda,
  eventPda: event.event_pda,
  newOwnerId: toUserId,
});

// Update ticket with blockchain signature
await client.query(`
  UPDATE tickets
  SET blockchain_signature = $1,
      blockchain_status = 'transferred'
  WHERE id = $2
`, [blockchainResult.signature, ticketId]);
```

### Option 2: Use transfer-service's BlockchainTransferService
```typescript
// In transfer.service.ts acceptTransfer(), after database update:

const blockchainService = new BlockchainTransferService(this.pool);
await blockchainService.executeBlockchainTransfer({
  transferId,
  ticketId: transfer.ticket_id,
  fromWallet: fromUser.wallet_address,
  toWallet: toUser.wallet_address,
  nftMintAddress: ticket.nft_mint_address,
});
```

---

## Downstream Issues (Even If Fixed)

### Issue 1: No Real NFT Mint Address

Tickets have fake `nft_mint_address` values like `mock_nft_xxx` from fake minting.
```typescript
// nftService.transferNFT() will fail:
const mint = new PublicKey(mintAddress);  // ← Invalid: "mock_nft_123"
```

### Issue 2: No Wallet Addresses

Users may not have Solana wallet addresses stored.

### Issue 3: No Event/Ticket PDAs

Blockchain transfer requires PDAs that don't exist because:
- Venues not on blockchain
- Events not on blockchain
- Tickets not really minted

---

## Database Tables

### ticket_transfers

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Transfer ID |
| ticket_id | UUID | Ticket being transferred |
| from_user_id | UUID | Original owner |
| to_user_id | UUID | New owner |
| to_email | VARCHAR | Recipient email |
| transfer_method | VARCHAR | 'direct', 'GIFT' |
| status | VARCHAR | 'pending', 'completed', 'expired' |
| acceptance_code | VARCHAR | Code to accept transfer |
| is_gift | BOOLEAN | Is this a gift? |
| expires_at | TIMESTAMP | When transfer expires |
| message | TEXT | Gift message |
| blockchain_signature | VARCHAR | ❌ Never populated |
| blockchain_transferred_at | TIMESTAMP | ❌ Never populated |

---

## Files That Need Changes

### Critical (No Blockchain Transfer)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service/src/services/transferService.ts` | Add blockchain transfer call | P0 |
| OR `transfer-service/src/services/transfer.service.ts` | Use BlockchainTransferService | P0 |

### High (Prerequisites)

| File | Change | Priority |
|------|--------|----------|
| `minting-service` | Real NFT minting (get real mint addresses) | P1 |
| `venue-service` | Create venue on blockchain | P1 |
| `event-service` | Create event on blockchain | P1 |

---

## Comparison: Two Transfer Systems

| Feature | ticket-service | transfer-service |
|---------|----------------|------------------|
| Immediate transfer | ✅ | ❌ (pending/accept) |
| Acceptance code | ❌ | ✅ |
| Expiration | ❌ | ✅ (48h) |
| Cooldown period | ✅ (30 min) | ❌ |
| Daily limits | ✅ (10/day) | ❌ |
| Event restrictions | ✅ | ❌ |
| Blackout periods | ✅ | ❌ |
| Identity verification | ✅ | ❌ |
| Max transfers/ticket | ✅ | ❌ |
| Blockchain transfer | ❌ | ❌ |
| Get-or-create user | ❌ | ✅ |

---

## Recommendation

**Consolidate to one system** that has:
1. All validation from ticket-service
2. Accept flow from transfer-service
3. Actual blockchain transfer

Or at minimum:
1. Add blockchain call to ticket-service (immediate transfers)
2. Wire up BlockchainTransferService in transfer-service (gift transfers)

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue blockchain gap
- `EVENT_CREATION_FLOW_AUDIT.md` - Event blockchain gap
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Minting gap
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Marketplace blockchain gap

