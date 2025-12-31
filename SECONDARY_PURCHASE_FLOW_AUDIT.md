# SECONDARY PURCHASE (RESALE) FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Secondary/Resale Purchase |

---

## Executive Summary

**CRITICAL FINDING:** The purchase endpoint (`POST /transfers/purchase`) is a **STUB** that does nothing. A fully implemented `BuyController` exists but is **NOT WIRED TO ANY ROUTE**.

---

## What Should Happen
```
Seller lists ticket
        ↓
Buyer finds listing
        ↓
Buyer purchases listing
        ↓
Payment processed (crypto or fiat)
        ↓
NFT transferred to buyer
        ↓
Seller receives payment (minus fees)
        ↓
Venue receives royalty
        ↓
Listing marked as sold
```

---

## What Actually Happens
```
Seller lists ticket ✅
        ↓
Buyer finds listing ✅
        ↓
Buyer calls POST /transfers/purchase
        ↓
Controller returns { success: true } ❌ DOES NOTHING
        ↓
No payment, no transfer, no NFT movement
```

---

## The Stub Problem

**File:** `backend/services/marketplace-service/src/controllers/transfer.controller.ts`
```typescript
async purchaseListing(_request: WalletRequest, reply: FastifyReply) {
  try {
    reply.send({ success: true });  // ← DOES NOTHING
  } catch (error) {
    throw error;
  }
}

async directTransfer(_request: WalletRequest, reply: FastifyReply) {
  try {
    reply.send({ success: true });  // ← DOES NOTHING
  } catch (error) {
    throw error;
  }
}

async getTransferHistory(_request: WalletRequest, reply: FastifyReply) {
  try {
    reply.send({ history: [] });  // ← ALWAYS EMPTY
  } catch (error) {
    throw error;
  }
}

async cancelTransfer(_request: WalletRequest, reply: FastifyReply) {
  try {
    reply.send({ success: true });  // ← DOES NOTHING
  } catch (error) {
    throw error;
  }
}
```

---

## The Real Implementation (Unused)

**File:** `backend/services/marketplace-service/src/controllers/buy.controller.ts`

A fully implemented `BuyController` exists with:
- ✅ Distributed locking
- ✅ Price validation
- ✅ Self-purchase prevention
- ✅ Crypto purchase flow (blockchain transfer)
- ✅ Fiat purchase flow (Stripe Connect)
- ✅ Error handling
- ✅ Retry logic

**BUT:** It's not wired to any route!

---

## Complete Flow Analysis

### Part 1: Listing Creation ✅ WORKS

**Endpoint:** `POST /listings`

**File:** `backend/services/marketplace-service/src/services/listing.service.ts`

**What happens:**
1. Distributed lock on ticket
2. Check for existing active listing
3. Create listing with price
4. Sync to search service

**Status:** ✅ Working

---

### Part 2: Purchase Initiation ❌ BROKEN

**Endpoint:** `POST /transfers/purchase`

**Expected behavior:**
1. Validate listing exists and is active
2. Create payment intent or initiate blockchain transfer
3. Return client secret or transaction to sign

**Actual behavior:**
```typescript
reply.send({ success: true });  // Returns immediately, does nothing
```

**Status:** ❌ Stub - does nothing

---

### Part 3: Payment Processing (Never Reached)

**For Fiat (Stripe):**

**File:** `backend/services/marketplace-service/src/services/stripe-payment.service.ts`

**Would do:**
1. Get seller's Stripe Connect account
2. Create PaymentIntent with:
   - Platform fee (2.5%)
   - Venue fee (5%)
   - Seller receives remainder
3. Return client secret for frontend
4. On webhook success → complete transfer

**For Crypto:**

**File:** `backend/services/marketplace-service/src/services/blockchain.service.ts`

**Would do:**
1. Verify buyer wallet balance
2. Execute on-chain transfer via Anchor program
3. Complete transfer record

**Status:** ⚠️ Implemented but never called

---

### Part 4: Transfer Completion (Never Reached)

**File:** `backend/services/marketplace-service/src/services/transfer.service.ts`

**`completeFiatTransfer()` would:**
1. Get charge ID from PaymentIntent
2. Create Stripe Transfer to seller
3. Create Stripe Transfer to venue (if has Connect)
4. Update transfer status to 'completed'
5. Mark listing as sold
6. Sync blockchain ownership (best effort)

**`completeTransfer()` would:**
1. Validate blockchain signature
2. Update transfer with blockchain data
3. Mark listing as sold
4. Update fee collection status

**Status:** ⚠️ Implemented but never called

---

### Part 5: Webhook Handler ✅ WORKS (If Ever Called)

**File:** `backend/services/marketplace-service/src/controllers/webhook.controller.ts`

**On `payment_intent.succeeded`:**
1. Look up transfer by PaymentIntent ID
2. Call `transferService.completeFiatTransfer()`
3. Execute split payments to seller and venue

**Status:** ✅ Implemented correctly, but never receives events because purchases never start

---

## Services Analysis

### TransferService ✅ IMPLEMENTED

| Method | Status | Description |
|--------|--------|-------------|
| `initiateTransfer()` | ✅ | Creates transfer record for crypto |
| `initiateFiatTransfer()` | ✅ | Creates transfer with Stripe info |
| `completeTransfer()` | ✅ | Completes crypto transfer |
| `completeFiatTransfer()` | ✅ | Completes fiat with split payments |
| `failTransfer()` | ✅ | Handles failed transfers |
| `syncBlockchainOwnership()` | ⚠️ | Will fail (no event_pda) |

### StripePaymentService ✅ IMPLEMENTED

| Method | Status | Description |
|--------|--------|-------------|
| `createPaymentIntent()` | ✅ | Destination charges pattern |
| `createPaymentIntentWithSeparateCharges()` | ✅ | Separate charges for venue split |
| `createTransferToSeller()` | ✅ | Transfer to seller Connect |
| `createTransferToVenue()` | ✅ | Transfer to venue Connect |
| `getSellerStripeAccountId()` | ✅ | Lookup seller's Connect ID |

### BlockchainService ⚠️ IMPLEMENTED BUT ISSUES

| Method | Status | Issue |
|--------|--------|-------|
| `transferNFT()` | ⚠️ | Requires deployed marketplace program |
| `verifyNFTOwnership()` | ⚠️ | Requires deployed marketplace program |
| `getWalletBalance()` | ✅ | Works |
| `validateTransaction()` | ✅ | Works |

---

## The Fix

**Option 1: Wire BuyController to Route**

Add to `transfers.routes.ts`:
```typescript
import { buyController } from '../controllers/buy.controller';

// Replace stub with real implementation
fastify.post('/purchase', {
  preHandler: [...securePreHandler, validate(purchaseListingSchema)]
}, buyController.buyListing.bind(buyController));
```

**Option 2: Fix TransferController**

Replace stub methods with real implementations that call `transferService`.

---

## Downstream Issues (Even If Fixed)

### Issue 1: Blockchain Sync Will Fail

**File:** `transfer.service.ts` → `syncBlockchainOwnership()`
```typescript
const event = await db('events')
  .where({ id: ticket.event_id })
  .select('event_pda')
  .first();

if (!event || !event.event_pda) {
  throw new Error('Event PDA not found');  // ← Will always throw
}
```

Events don't have `event_pda` because:
- Venue not on blockchain
- Event creation on blockchain fails

**Impact:** Even if purchase works, blockchain ownership won't update

### Issue 2: Ticket PDA Required
```typescript
const ticket = await db('tickets')
  .where({ id: listing.ticketId })
  .select('ticket_pda', 'event_id')
  .first();

if (!ticket || !ticket.ticket_pda) {
  throw new Error('Ticket PDA not found');  // ← Will always throw
}
```

Tickets don't have `ticket_pda` because minting is fake.

---

## Fee Structure (As Designed)

| Component | Percentage | Recipient |
|-----------|------------|-----------|
| Sale Price | 100% | - |
| Platform Fee | 2.5% | Platform |
| Venue Royalty | 5% | Venue |
| Seller Receives | 92.5% | Seller |

**Feature Flag:** `ENABLE_VENUE_ROYALTY_SPLIT`
- If true: Separate charges pattern (money to platform, then transfers)
- If false: Destination charges pattern (money direct to seller, platform takes fee)

---

## Files That Need Changes

### Critical (Purchase Doesn't Work)

| File | Change | Priority |
|------|--------|----------|
| `marketplace-service/src/routes/transfers.routes.ts` | Wire buyController OR fix stubs | P0 |
| `marketplace-service/src/controllers/transfer.controller.ts` | Implement real methods | P0 |

### High (Blockchain Won't Sync)

| File | Change | Priority |
|------|--------|----------|
| `venue-service` | Create venue on blockchain | P1 |
| `event-service` | Create event on blockchain | P1 |
| `ticket-service` | Real NFT minting | P1 |

---

## What Works vs What's Broken

| Component | Status |
|-----------|--------|
| Listing creation | ✅ Works |
| Listing search | ✅ Works |
| Listing price update | ✅ Works |
| Listing cancellation | ✅ Works |
| Purchase initiation | ❌ Stub |
| Direct transfer | ❌ Stub |
| Transfer history | ❌ Stub (returns empty) |
| Cancel transfer | ❌ Stub |
| Stripe payment processing | ⚠️ Implemented, not called |
| Stripe webhook handling | ⚠️ Implemented, not called |
| Blockchain transfer | ⚠️ Implemented, won't work |
| Venue royalty crediting | ⚠️ Implemented, not called |

---

## Dependency Chain
```
1. Venue on blockchain ← BLOCKED
         ↓
2. Event on blockchain ← BLOCKED
         ↓
3. Real NFT minting ← BLOCKED
         ↓
4. Wire purchase route ← FIX THIS FIRST
         ↓
5. Purchase works (fiat) ← Will work
         ↓
6. Blockchain sync ← Will fail (no PDAs)
```

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue blockchain gap
- `EVENT_CREATION_FLOW_AUDIT.md` - Event blockchain gap
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Primary ticket purchase
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Venue payment flows

