# ROYALTY DISTRIBUTION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Royalty Distribution (Resale Royalties to Venues) |

---

## Executive Summary

**GOOD NEWS:** This is a **comprehensive and well-designed system**. Multiple services work together with reconciliation.

**ISSUES:**
1. **Feature flag controls flow** - `ENABLE_VENUE_ROYALTY_SPLIT` must be true
2. **Depends on secondary purchase working** - Which has stub endpoint (Flow 5)
3. **Blockchain indexer integration assumed** - May not be deployed
4. **Artist royalties not fully implemented** - Wallet addresses not stored

---

## The Flow
```
Secondary sale completes
        ↓
Transfer service calculates splits
        ↓
Stripe transfers to:
  - Seller (sale price - fees)
  - Venue (royalty via Stripe Connect)
  - Platform (fee)
        ↓
Royalty distributions recorded in DB
        ↓
Reconciliation job verifies against blockchain
        ↓
Payouts scheduled when threshold met
```

---

## Fee Structure

### Default Configuration

| Recipient | Percentage | Source |
|-----------|------------|--------|
| Platform | 5% | Fixed |
| Venue | 5-10% | Configurable per venue/event |
| Seller | 80-90% | Remainder |

### Constants

**File:** `backend/services/marketplace-service/src/config/constants.ts`
```typescript
export const FEES = {
  PLATFORM_FEE_PERCENTAGE: 5.00,
  DEFAULT_VENUE_FEE_PERCENTAGE: 5.00,
  MAX_TOTAL_FEE_PERCENTAGE: 20.00,
  MIN_SELLER_PERCENTAGE: 80.00,
};

export const FEATURE_FLAGS = {
  ENABLE_VENUE_ROYALTY_SPLIT: process.env.ENABLE_VENUE_ROYALTY_SPLIT === 'true',
};
```

---

## Two Payment Flows

### Feature Flag: `ENABLE_VENUE_ROYALTY_SPLIT`

**File:** `backend/services/marketplace-service/src/services/transfer.service.ts`

#### OLD Flow (flag = false): Destination Charges
```
Buyer pays
        ↓
Money goes directly to Seller's Stripe Connect
        ↓
Platform takes application_fee_amount
        ↓
Venue royalty NOT paid via Stripe
```

#### NEW Flow (flag = true): Separate Charges ✅
```
Buyer pays
        ↓
Money goes to Platform account first
        ↓
Platform creates transfers:
  - Transfer to Seller (via source_transaction)
  - Transfer to Venue (via source_transaction)
        ↓
All tied to original charge (atomic)
```

---

## Royalty Calculation

### RoyaltySplitterService

**File:** `backend/services/payment-service/src/services/marketplace/royalty-splitter.service.ts`
```typescript
async calculateRoyalties(salePrice, venueId, eventId) {
  // Get venue default settings
  const venueSettings = await this.getVenueRoyaltySettings(venueId);
  
  // Event can override venue defaults
  const eventSettings = await this.getEventRoyaltySettings(eventId);
  
  // Priority: Event > Venue > Default (10%)
  const venuePercentage = eventSettings?.venueRoyaltyPercentage ??
                         venueSettings?.defaultRoyaltyPercentage ??
                         10;

  const artistPercentage = eventSettings?.artistRoyaltyPercentage ?? 0;
  const platformPercentage = 5;

  return {
    venueRoyalty: salePrice * (venuePercentage / 100),
    artistRoyalty: salePrice * (artistPercentage / 100),
    platformFee: salePrice * (platformPercentage / 100),
    sellerProceeds: salePrice - venueRoyalty - artistRoyalty - platformFee
  };
}
```

---

## Escrow System

### EscrowService

**File:** `backend/services/payment-service/src/services/marketplace/escrow.service.ts`

**Flow:**
1. `createEscrow()` - Create payment intent with manual capture
2. `fundEscrow()` - Confirm payment intent
3. `releaseEscrow()` - Capture payment, distribute funds
4. `refundEscrow()` - Cancel/refund if needed

**Release Conditions:**
```typescript
const conditions = [
  { type: 'nft_transferred', required: true },
  { type: 'cooling_period', required: true, duration: 600 } // 10 min
];
```

**On Release:**
```typescript
// Seller gets their payout
await TransactionModel.create({
  userId: escrow.sellerId,
  amount: escrow.sellerPayout,
  status: TransactionStatus.COMPLETED,
});

// Venue gets royalty credited to balance
await VenueBalanceModel.updateBalance(
  listing.venueId,
  escrow.venueRoyalty,
  'available'
);
```

**Status:** ✅ Venue balance IS updated here (unlike primary sales!)

---

## Transfer Service Integration

**File:** `backend/services/marketplace-service/src/services/transfer.service.ts`
```typescript
if (FEATURE_FLAGS.ENABLE_VENUE_ROYALTY_SPLIT) {
  // Fetch venue royalty data
  const royaltyData = await feeService.getEventRoyaltyData(listing.eventId);
  
  // Calculate fees
  const platformFeeCents = Math.round(amountCents * platformFeePercentage);
  const venueFeeCents = Math.round(amountCents * (royaltyData.venuePercentage / 100));
  const sellerReceivesCents = amountCents - platformFeeCents - venueFeeCents;
  
  // Create Stripe transfers
  const paymentResult = await stripePaymentService.createPaymentIntentWithSeparateCharges({
    sellerStripeAccountId,
    venueStripeAccountId: royaltyData.venueStripeAccountId,
    amountCents,
    platformFeeCents,
    venueFeeCents,
    sellerReceivesCents,
  });
}
```

---

## Reconciliation System

### RoyaltyReconciliationService

**File:** `backend/services/payment-service/src/services/reconciliation/royalty-reconciliation.service.ts`

**Purpose:** Verify blockchain sales match database royalty records

**Process:**
1. Fetch secondary sales from blockchain-indexer (MongoDB)
2. Fetch royalty distributions from PostgreSQL
3. Compare and find discrepancies
4. Auto-create missing distributions
5. Schedule payouts
```typescript
async runReconciliation(startDate, endDate) {
  // Get blockchain sales
  const secondarySales = await this.getSecondarySalesFromBlockchain(startDate, endDate);
  
  // Get database records
  const distributions = await this.getRoyaltyDistributions(startDate, endDate);
  
  // Reconcile
  for (const sale of secondarySales) {
    const existing = distributionMap.get(sale.signature);
    
    if (!existing) {
      // Missing distribution - create it
      await this.createMissingDistribution(sale, expectedRoyalties);
      discrepanciesFound++;
    } else {
      // Check amounts match
      const variance = Math.abs(expected - actual);
      if (variance > 0.01) {
        await this.recordDiscrepancy(...);
      }
    }
  }
}
```

---

## Royalty Routes

**File:** `backend/services/payment-service/src/routes/royalty.routes.ts`

| Endpoint | Purpose |
|----------|---------|
| `GET /report/:venueId` | Royalty report for venue |
| `GET /payouts/:recipientId` | Payout history |
| `GET /distributions/:recipientId` | Distribution history |
| `POST /reconcile` | Trigger manual reconciliation |
| `GET /reconciliation-runs` | Run history |
| `GET /discrepancies` | Unresolved discrepancies |
| `PUT /discrepancies/:id/resolve` | Resolve discrepancy |

---

## Database Tables

### royalty_distributions

| Column | Type | Purpose |
|--------|------|---------|
| transaction_id | VARCHAR | Blockchain signature or internal ID |
| recipient_type | VARCHAR | venue, artist, platform |
| recipient_id | VARCHAR | Who receives |
| amount | DECIMAL | Amount in cents |
| percentage | DECIMAL | % of sale |
| status | VARCHAR | pending, scheduled, paid |

### royalty_payouts

| Column | Type | Purpose |
|--------|------|---------|
| recipient_id | VARCHAR | Who receives |
| amount_cents | INT | Total payout amount |
| distribution_count | INT | How many distributions |
| period_start/end | DATE | Payout period |
| status | VARCHAR | scheduled, processing, completed |

### royalty_discrepancies

| Column | Type | Purpose |
|--------|------|---------|
| reconciliation_run_id | UUID | Which run found it |
| transaction_id | VARCHAR | Which transaction |
| discrepancy_type | VARCHAR | missing_distribution, incorrect_amount |
| expected_amount | DECIMAL | What should be |
| actual_amount | DECIMAL | What is |
| variance | DECIMAL | Difference |
| status | VARCHAR | identified, investigating, resolved |

### venue_royalty_settings

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | UUID | Which venue |
| default_royalty_percentage | DECIMAL | Default % on resales |
| minimum_payout_amount_cents | INT | Min before payout |

### event_royalty_settings

| Column | Type | Purpose |
|--------|------|---------|
| event_id | UUID | Which event |
| venue_royalty_percentage | DECIMAL | Override venue default |
| artist_royalty_percentage | DECIMAL | Artist cut |
| artist_wallet_address | VARCHAR | Where to send artist royalty |

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Royalty calculation | ✅ Works |
| Fee service | ✅ Works |
| Stripe split payments | ✅ Works (if feature flag on) |
| Escrow system | ✅ Works |
| Venue balance crediting | ✅ Works (in escrow flow) |
| Distribution recording | ✅ Works |
| Reconciliation service | ✅ Works |
| Discrepancy tracking | ✅ Works |
| Royalty reports | ✅ Works |
| Payout scheduling | ✅ Works |

---

## Issues

### Issue 1: Feature Flag Required
```typescript
if (FEATURE_FLAGS.ENABLE_VENUE_ROYALTY_SPLIT) {
  // NEW flow with venue royalties
} else {
  // OLD flow - venue doesn't get paid via Stripe
}
```

If `ENABLE_VENUE_ROYALTY_SPLIT=false`, venues don't get Stripe transfers.

### Issue 2: Depends on Secondary Purchase

The entire royalty flow depends on secondary purchases working. But Flow 5 found:
- Purchase endpoint is a stub
- `buyController` never wired to routes

**No purchases = No royalties**

### Issue 3: Blockchain Indexer Assumed

Reconciliation calls:
```typescript
const response = await axios.post(`${this.blockchainIndexerUrl}/api/v1/marketplace/sales`, {...});
```

If blockchain-indexer not deployed or blockchain sales not happening, reconciliation has nothing to check.

### Issue 4: Artist Royalties Incomplete
```typescript
const artistPercentage = eventSettings?.artistRoyaltyPercentage ?? 0;
```

- Artist royalty percentage can be set
- But `artist_wallet_address` storage/usage unclear
- No Stripe Connect for artists (only venues/sellers)

---

## Flow Dependencies
```
1. Secondary purchase endpoint works (Flow 5) ← BROKEN
         ↓
2. Feature flag enabled
         ↓
3. Venue has Stripe Connect
         ↓
4. Royalty calculated and transferred
         ↓
5. Recorded in royalty_distributions
         ↓
6. Reconciliation verifies against blockchain
         ↓
7. Payouts scheduled when threshold met
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Royalty calculation | ✅ Complete |
| Stripe split payments | ✅ Complete |
| Venue balance crediting | ✅ Works (escrow) |
| Distribution recording | ✅ Complete |
| Reconciliation | ✅ Complete |
| Discrepancy handling | ✅ Complete |
| Reports and payouts | ✅ Complete |
| Feature flag dependency | ⚠️ Must be enabled |
| Secondary purchase dependency | ❌ Blocked (stub endpoint) |
| Artist royalties | ⚠️ Partial |

---

## Related Documents

- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Must work for royalties to flow
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Venue balance and payouts
- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Seller Stripe Connect

