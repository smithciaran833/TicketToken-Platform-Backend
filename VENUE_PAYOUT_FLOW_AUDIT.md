# VENUE PAYOUT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Payout |

---

## Executive Summary

**CRITICAL FINDING:** Venues are NEVER credited for primary ticket sales. The entire primary sale revenue stays with the platform. Only resale royalties credit venue balances.

---

## Two Revenue Streams for Venues

### Stream 1: Primary Sales (BROKEN)

When a fan buys a ticket directly:
- Fan pays $100
- Platform should take ~12% ($12)
- Venue should receive ~88% ($88)
- **ACTUAL: Venue receives $0**

### Stream 2: Resales/Secondary Market (Working)

When a fan resells a ticket:
- Buyer pays $150
- Platform takes 5% ($7.50)
- Venue takes royalty (e.g., 10% = $15)
- Seller receives remainder ($127.50)
- **Venue balance IS credited via escrow.service.ts**

---

## Primary Sale Flow Analysis

### What Should Happen
```
Fan pays $100 for ticket
         ↓
Stripe processes payment
         ↓
Webhook fires: payment_intent.succeeded
         ↓
Calculate venue share (100% - platform fee)
         ↓
Credit venue_balances table
         ↓
Venue can request payout
         ↓
Transfer to Stripe Connect account
```

### What Actually Happens
```
Fan pays $100 for ticket
         ↓
Stripe processes payment ✅
         ↓
Webhook fires: payment_intent.succeeded ✅
         ↓
State transition: COMPLETED ✅
         ↓
Order status updated ✅
         ↓
❌ NOTHING ELSE HAPPENS
         ↓
Venue balance = $0
         ↓
Money sits in platform Stripe account
```

---

## Code Evidence

### Stripe Webhook Handler

**File:** `backend/services/payment-service/src/webhooks/stripe-handler.ts`
```typescript
private async processEvent(event: Stripe.Event): Promise<void> {
  // Handle Connect account events
  if (event.type === 'account.updated') {
    await this.handleAccountUpdated(event);
    return;
  }

  // Handle marketplace payments (resales)
  if (event.type === 'payment_intent.succeeded' && paymentIntent.metadata?.listing_id) {
    await this.handleMarketplacePayment(paymentIntent);  // ← Only for resales
  }

  // For primary sales: just update state
  await this.stateService.handlePaymentEvent(stateEvent, currentState, {...});
  // ← NO venue crediting anywhere
}
```

### State Transition Service

**File:** `backend/services/payment-service/src/services/state-machine/transitions.ts`
```typescript
async handlePaymentEvent(...): Promise<PaymentState> {
  // Update payment status
  await this.db.query(
    'UPDATE payment_transactions SET status = $1...',
    [newState, context.paymentId]
  );

  // Update order state
  await this.syncOrderState(context.orderId, newState);
  
  // ← NO venue crediting
  return newState;
}
```

### Where Venue IS Credited (Resales Only)

**File:** `backend/services/payment-service/src/services/marketplace/escrow.service.ts`
```typescript
async releaseEscrow(escrowId: string): Promise<void> {
  // ... capture payment ...
  
  // Credit venue for RESALE royalty
  const listing = await this.getListing(escrow.listingId);
  await VenueBalanceModel.updateBalance(
    listing.venueId,
    escrow.venueRoyalty,  // ← Only resale royalty, not primary sale
    'available'
  );
}
```

---

## Payout Flow (When Balance Exists)

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /venues/:venueId/balance` | Get current balance |
| `POST /venues/:venueId/payout` | Request payout |
| `GET /venues/:venueId/payouts` | Payout history |

### Get Balance

**File:** `backend/services/payment-service/src/controllers/venue.controller.ts`
```typescript
async getBalance(request, reply) {
  const balance = await this.venueBalanceService.getBalance(venueId);
  const payoutInfo = await this.venueBalanceService.calculatePayoutAmount(venueId);
  return reply.send({ balance, payoutInfo });
}
```

### Request Payout

**File:** `backend/services/payment-service/src/services/core/venue-balance.service.ts`
```typescript
async processPayout(venueId: string, amount: number): Promise<void> {
  const { payable } = await this.calculatePayoutAmount(venueId);

  if (amount > payable) {
    throw new Error('Insufficient funds for payout');
  }

  // Move from available to processing
  await VenueBalanceModel.updateBalance(venueId, -amount, 'available');

  // In production, would initiate actual bank transfer here
  // For now, just mark as processed
  log.info('Processing payout', { amount, venueId });
}
```

**PROBLEM:** The actual Stripe Connect transfer is NOT implemented!
```typescript
// In production, would initiate actual bank transfer here
// For now, just mark as processed  ← THIS IS A TODO
```

---

## What's Missing

### Gap 1: Primary Sale Venue Credit (CRITICAL)

**Impact:** Venues receive $0 from all primary ticket sales

**What needs to happen:**

1. On `payment_intent.succeeded` for primary sales:
   - Get order details
   - Get event's venue_id
   - Calculate venue share (total - platform fee)
   - Credit `venue_balances` table

**Files that need changes:**

| File | Change |
|------|--------|
| `payment-service/src/webhooks/stripe-handler.ts` | Add primary sale venue crediting |
| `payment-service/src/services/core/primary-sale-settlement.service.ts` | CREATE NEW |

### Gap 2: Actual Stripe Transfer Not Implemented

**Impact:** Even if balance exists, money doesn't actually transfer

**What needs to happen:**

1. When venue requests payout:
   - Get venue's Stripe Connect account ID
   - Create Stripe Transfer to connected account
   - Update payout record with transfer ID
   - Handle failures

**Files that need changes:**

| File | Change |
|------|--------|
| `payment-service/src/services/core/venue-balance.service.ts` | Implement actual Stripe transfer |

### Gap 3: Payout History Not Implemented

**File:** `backend/services/payment-service/src/controllers/venue.controller.ts`
```typescript
async getPayoutHistory(request, reply) {
  // TODO: Implement getPayoutHistory method
  const history: any[] = []; // ← Always returns empty array
  return reply.send(history);
}
```

---

## Database Tables

### venue_balances

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | UUID | Venue reference |
| amount | DECIMAL | Balance amount |
| balance_type | ENUM | 'available', 'pending', 'reserved' |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

### Current State

- **Resales:** Venue royalties ARE credited ✅
- **Primary Sales:** NEVER credited ❌
- **Payouts:** Balance decremented but no actual transfer ❌

---

## Fee Structure (As Designed)

### Primary Sales

| Component | Percentage | Goes To |
|-----------|------------|---------|
| Ticket Price | 100% | - |
| Platform Fee | ~12% | Platform |
| Venue Share | ~88% | Venue (NOT IMPLEMENTED) |

### Resales (Secondary Market)

| Component | Percentage | Goes To |
|-----------|------------|---------|
| Resale Price | 100% | - |
| Platform Fee | 5% | Platform ✅ |
| Venue Royalty | 10% | Venue ✅ |
| Seller Payout | 85% | Seller ✅ |

---

## Complete Payout Flow (What Should Exist)
```
PRIMARY SALE:
Fan pays $100
    ↓
Stripe processes payment
    ↓
Webhook: payment_intent.succeeded
    ↓
Calculate: Platform $12, Venue $88
    ↓
UPDATE venue_balances SET amount = amount + 8800 WHERE venue_id = X  ← MISSING
    ↓
Venue balance: $88

RESALE:
Fan pays $150 for resale
    ↓
Escrow created, payment captured
    ↓
NFT transferred
    ↓
Escrow released
    ↓
UPDATE venue_balances SET amount = amount + 1500  ← EXISTS
    ↓
Venue balance: $88 + $15 = $103

PAYOUT:
Venue requests $100 payout
    ↓
Validate balance >= $100
    ↓
Create Stripe Transfer to Connect account  ← MISSING
    ↓
UPDATE venue_balances SET amount = amount - 10000
    ↓
Record payout in payouts table  ← MISSING
    ↓
Venue balance: $3
```

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `payment-service/src/routes/venue.routes.ts` | Payout endpoints | ✅ Exists |
| `payment-service/src/controllers/venue.controller.ts` | Controller | ⚠️ Partial |
| `payment-service/src/services/core/venue-balance.service.ts` | Balance logic | ⚠️ Partial |
| `payment-service/src/models/venue-balance.model.ts` | DB operations | ✅ Works |
| `payment-service/src/webhooks/stripe-handler.ts` | Webhook handling | ❌ Missing primary sale |
| `payment-service/src/services/marketplace/escrow.service.ts` | Resale escrow | ✅ Works |

---

## Files That Need Changes

### Critical (No Revenue to Venues)

| File | Change | Priority |
|------|--------|----------|
| `payment-service/src/webhooks/stripe-handler.ts` | Credit venue on primary sale success | P0 |
| `payment-service/src/services/core/primary-sale-settlement.service.ts` | CREATE - Calculate and credit venue | P0 |

### High (Payouts Don't Work)

| File | Change | Priority |
|------|--------|----------|
| `payment-service/src/services/core/venue-balance.service.ts` | Implement Stripe Connect transfer | P1 |
| `payment-service/src/models/payout.model.ts` | CREATE - Track payouts | P1 |

### Medium (Missing Features)

| File | Change | Priority |
|------|--------|----------|
| `payment-service/src/controllers/venue.controller.ts` | Implement getPayoutHistory | P2 |

---

## Implementation Plan

### Phase 1: Primary Sale Crediting
```typescript
// In stripe-handler.ts, add to processEvent():

if (event.type === 'payment_intent.succeeded') {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  
  // Check if this is a primary sale (not marketplace)
  if (!paymentIntent.metadata?.listing_id && paymentIntent.metadata?.order_id) {
    await this.handlePrimarySalePayment(paymentIntent);
  }
}

private async handlePrimarySalePayment(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.order_id;
  
  // Get order and event details
  const order = await this.db.query(
    'SELECT o.*, e.venue_id FROM orders o JOIN events e ON o.event_id = e.id WHERE o.id = $1',
    [orderId]
  );
  
  if (order.rows.length === 0) return;
  
  const { venue_id, total_cents, platform_fee_cents } = order.rows[0];
  const venueShareCents = total_cents - platform_fee_cents;
  
  // Credit venue balance
  await VenueBalanceModel.updateBalance(venue_id, venueShareCents, 'available');
  
  log.info('Primary sale venue credited', { 
    venueId: venue_id, 
    amount: venueShareCents,
    orderId 
  });
}
```

### Phase 2: Stripe Connect Transfer
```typescript
// In venue-balance.service.ts:

async processPayout(venueId: string, amount: number): Promise<void> {
  // ... validation ...
  
  // Get venue's Stripe Connect account
  const venue = await this.getVenueStripeAccount(venueId);
  
  if (!venue.stripe_connect_account_id) {
    throw new Error('Venue has not completed Stripe Connect onboarding');
  }
  
  // Create Stripe Transfer
  const transfer = await this.stripe.transfers.create({
    amount: amount,
    currency: 'usd',
    destination: venue.stripe_connect_account_id,
    metadata: {
      venueId,
      payoutType: 'standard'
    }
  });
  
  // Update balance
  await VenueBalanceModel.updateBalance(venueId, -amount, 'available');
  
  // Record payout
  await this.recordPayout(venueId, amount, transfer.id);
}
```

---

## Summary

| Component | Status |
|-----------|--------|
| Primary sale payment processing | ✅ Works |
| Primary sale venue crediting | ❌ Missing |
| Resale payment processing | ✅ Works |
| Resale venue royalty crediting | ✅ Works |
| Venue balance tracking | ✅ Works |
| Payout request endpoint | ✅ Exists |
| Actual Stripe Connect transfer | ❌ Not implemented |
| Payout history | ❌ Not implemented |

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Stripe Connect setup
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow
- `FEE_STRUCTURE_REMEDIATION.md` - Fee calculations

