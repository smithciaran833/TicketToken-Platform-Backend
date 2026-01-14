# MAKE OFFER FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Make Offer (Bid on Listing) |

---

## Executive Summary

**NOT IMPLEMENTED - No offer/bid system**

| Component | Status |
|-----------|--------|
| offers table | ❌ Does not exist |
| Create offer endpoint | ❌ Not implemented |
| Accept offer endpoint | ❌ Not implemented |
| Reject offer endpoint | ❌ Not implemented |
| Counter offer | ❌ Not implemented |
| Offer expiration | ❌ Not implemented |
| Offer notifications | ❌ Not implemented |
| offeredPrice parameter | ⚠️ Exists but just validates >= listing price |

**Bottom Line:** There is no offer/bid system. The `offeredPrice` parameter in the buy controller simply validates that the offered price is not below the listing price - it's not a negotiation system. Buyers can only purchase at the listed price or higher (tip).

---

## What Exists

### Buy Controller Parameter

**File:** `backend/services/marketplace-service/src/controllers/buy.controller.ts`
```typescript
const { offeredPrice, paymentMethod = 'crypto' } = request.body;

// Validate price if offered
const purchasePrice = offeredPrice || listing.price;
if (offeredPrice && offeredPrice < listing.price) {
  reply.status(400).send({
    error: 'Offered price below listing price',
    listingPrice: listing.price,
    offeredPrice
  });
  return;
}
```

This is NOT an offer system - it's just allowing buyers to pay MORE than listed (essentially a tip).

---

## What's Missing

### 1. Offers Table
```sql
-- NOT IMPLEMENTED
CREATE TABLE offers (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES marketplace_listings(id),
  buyer_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,  -- cents
  status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'accepted', 'rejected', 'expired', 'withdrawn'
  expires_at TIMESTAMP,
  message TEXT,
  counter_offer_id UUID REFERENCES offers(id),
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP
);
```

### 2. API Endpoints

Expected but not implemented:
```
POST   /api/v1/listings/:listingId/offers     - Make an offer
GET    /api/v1/listings/:listingId/offers     - List offers on listing
GET    /api/v1/offers/:offerId                - Get offer details
POST   /api/v1/offers/:offerId/accept         - Accept offer
POST   /api/v1/offers/:offerId/reject         - Reject offer
POST   /api/v1/offers/:offerId/counter        - Counter offer
DELETE /api/v1/offers/:offerId                - Withdraw offer
GET    /api/v1/users/me/offers/sent           - My sent offers
GET    /api/v1/users/me/offers/received       - Offers on my listings
```

### 3. Offer Flow
```
Buyer makes offer ($80 for $100 listing)
  ↓
Seller receives notification
  ↓
Seller can:
  ├── Accept → Triggers purchase at $80
  ├── Reject → Offer closed
  ├── Counter → New offer at $90
  └── Ignore → Expires after 24 hours
```

### 4. Offer Notifications

- Email/push when offer received
- Email/push when offer accepted/rejected
- Reminder before expiration

---

## Impact

| Area | Impact |
|------|--------|
| Price discovery | No negotiation possible |
| Buyer flexibility | Must pay listed price or skip |
| Seller optimization | May miss sales at lower prices |
| Market dynamics | Less liquid market |

---

## Recommendations

### P3 - Implement Offer System

| Task | Effort |
|------|--------|
| Create offers table | 0.25 day |
| Create offer service | 1 day |
| Create offer endpoints | 1 day |
| Accept/reject flow | 0.5 day |
| Counter offer logic | 0.5 day |
| Expiration worker | 0.5 day |
| Notifications | 0.5 day |
| **Total** | **4.25 days** |

---

## Related Documents

- `LISTING_MANAGEMENT_FLOW_AUDIT.md` - Current listing flow
- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow
- `MARKETPLACE_PRICING_RULES_FLOW_AUDIT.md` - Pricing constraints
