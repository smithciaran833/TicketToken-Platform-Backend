# ARTIST PAYOUT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Artist Payout |

---

## Executive Summary

**PARTIAL - Schema exists, royalty calculation works, no dedicated payout flow**

| Component | Status |
|-----------|--------|
| artist_royalty_percentage column | ✅ Exists |
| artist_stripe_account_id column | ✅ Exists |
| artist_wallet_address column | ✅ Exists |
| recipient_type = 'artist' in transfers | ✅ Exists |
| Royalty calculation (RoyaltySplitter) | ✅ Working |
| Royalty distribution recording | ✅ Working |
| Artist Stripe Connect onboarding | ❌ Not implemented |
| Artist payout endpoint | ❌ Not implemented |
| Artist payout history | ❌ Not implemented |
| Artist dashboard | ❌ Not implemented |

**Bottom Line:** The database schema supports artist royalties and payouts, and the `RoyaltySplitterService` correctly calculates artist royalty percentages on resales. However, there's no artist onboarding flow, no artist-specific payout endpoints, and no way for artists to manage their payment settings.

---

## What Exists

### 1. Database Schema

**File:** `backend/services/payment-service/src/migrations/001_baseline_payment.ts`
```sql
-- On events table (via venue settings or event settings)
artist_royalty_percentage DECIMAL(5,2) DEFAULT 0
artist_wallet_address VARCHAR(255)
artist_stripe_account_id VARCHAR(255)

-- Constraint
CHECK (artist_royalty_percentage >= 0 AND artist_royalty_percentage <= 100)
```

**File:** `backend/services/payment-service/src/migrations/004_add_stripe_connect_tables.ts`
```sql
-- In connected_accounts
account_type VARCHAR(50) -- 'venue', 'artist'

-- In transfers
recipient_type VARCHAR(50) -- 'venue', 'artist', 'platform'

-- Constraint
CHECK (recipient_type IN ('venue', 'artist', 'platform'))
```

### 2. Royalty Calculation

**File:** `backend/services/payment-service/src/services/marketplace/royalty-splitter.service.ts`
```typescript
async calculateRoyalties(salePrice: number, venueId: string, eventId: string) {
  const artistPercentage = eventSettings?.artistRoyaltyPercentage ?? 0;
  
  const artistRoyalty = salePrice * (artistPercentage / 100);
  
  return {
    venueRoyalty,
    venuePercentage,
    artistRoyalty: Math.round(artistRoyalty * 100) / 100,
    artistPercentage,
    sellerProceeds,
    platformFee
  };
}
```

### 3. Royalty Distribution Recording
```typescript
// Records artist as recipient
{
  transactionId,
  recipientType: 'artist',
  recipientId: royalties.artistId,
  amount: royalties.artistRoyalty,
  percentage: royalties.artistPercentage
}
```

---

## What's Missing

### 1. Artist Onboarding Flow

No way for artists to:
- Connect their Stripe account
- Set payout preferences
- Verify identity

### 2. Artist Payout Endpoints

Expected but not implemented:
```
GET  /api/v1/artists/:artistId/balance
POST /api/v1/artists/:artistId/payout
GET  /api/v1/artists/:artistId/payouts
GET  /api/v1/artists/:artistId/royalties
```

### 3. Artist-Event Association

No clear model for:
- Which artist is associated with which event
- Multiple artists per event
- Artist management by venues

### 4. Artist Dashboard

No artist-facing UI or API for:
- View earnings
- Track royalties by event
- Download tax documents

---

## Current Workaround

Artists would need to be paid manually or treated as venues (use venue payout flow with venue_id = artist_id).

---

## Recommendations

### P3 - Implement Artist Payout

| Task | Effort |
|------|--------|
| Create artist model/table | 0.5 day |
| Artist Stripe Connect onboarding | 1 day |
| Artist payout endpoints | 1 day |
| Artist royalty tracking | 0.5 day |
| Artist dashboard API | 1 day |
| **Total** | **4 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `payment-service/src/migrations/001_baseline_payment.ts` | ✅ Schema exists |
| `payment-service/src/migrations/004_add_stripe_connect_tables.ts` | ✅ Schema exists |
| `payment-service/src/services/marketplace/royalty-splitter.service.ts` | ✅ Calculation works |
| `payment-service/src/services/fee-calculation.service.ts` | ✅ References artist |
| `payment-service/src/routes/artist.routes.ts` | ❌ Does not exist |
| `payment-service/src/controllers/artist.controller.ts` | ❌ Does not exist |

---

## Related Documents

- `ROYALTY_DISTRIBUTION_FLOW_AUDIT.md` - General royalty flow
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Similar payout pattern
- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Stripe Connect pattern
