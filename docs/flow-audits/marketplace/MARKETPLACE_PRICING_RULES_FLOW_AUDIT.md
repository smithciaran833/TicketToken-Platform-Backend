# MARKETPLACE PRICING & LISTING RULES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Marketplace Pricing Rules (Floors, Ceilings, Expiration) |

---

## Executive Summary

**WELL IMPLEMENTED - Comprehensive venue control**

| Component | Status |
|-----------|--------|
| Price floor (min multiplier) | ✅ Implemented |
| Price ceiling (max multiplier) | ✅ Implemented |
| Below face value control | ✅ Implemented |
| Listing expiration | ✅ Implemented |
| Transfer cutoff timing | ✅ Implemented |
| User listing limits | ✅ Implemented |
| Price validation | ✅ Implemented |
| Listing approval workflow | ✅ Implemented |
| Offers/counter-offers | ❌ Not implemented |
| Auction-style sales | ❌ Not implemented |

**Bottom Line:** The marketplace has robust venue-controlled pricing rules. Venues can set min/max price multipliers, control below-face-value sales, set expiration times, and limit listings per user. Offers and auctions are not supported.

---

## What Works ✅

### 1. Price Floor/Ceiling (Multipliers)

**File:** `marketplace-service/src/models/venue-settings.model.ts`
```typescript
interface VenueMarketplaceSettings {
  maxResaleMultiplier: number;  // Default: 3.0 (300% of face value)
  minPriceMultiplier: number;   // Default: 1.0 (100% of face value)
  allowBelowFace: boolean;      // Default: false
}
```

**Validation:**
```typescript
validatePrice(price, faceValue, minMultiplier, maxMultiplier, allowBelowFace) {
  const multiplier = price / faceValue;
  
  // Check floor
  if (!allowBelowFace && price < faceValue) {
    return { valid: false, reason: 'Price cannot be below face value' };
  }
  
  if (multiplier < minMultiplier) {
    return { valid: false, reason: `Price must be at least ${minMultiplier * 100}% of face value` };
  }
  
  // Check ceiling
  if (multiplier > maxMultiplier) {
    return { valid: false, reason: `Price cannot exceed ${maxMultiplier * 100}% of face value` };
  }
  
  return { valid: true, priceMultiplier: multiplier };
}
```

**Example:**
- Face value: $100
- Min multiplier: 1.0, Max multiplier: 3.0, Allow below face: false
- Valid price range: $100 - $300

---

### 2. Listing Expiration

**Types:**
```typescript
interface MarketplaceListing {
  expires_at?: Date;  // When listing auto-expires
  listed_at: Date;
}

interface CreateListingInput {
  expires_at?: Date;  // Optional, defaults to 30 days
}
```

**Controller:**
```typescript
// Default 30-day expiration
expires_at: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
```

**Validation:**
```typescript
// Check if listing has expired
if (listing.expiresAt && new Date() > listing.expiresAt) {
  throw new ValidationError('Listing has expired');
}
```

**Venue setting:**
```typescript
autoExpireOnEventStart: boolean;  // Auto-expire when event starts
```

---

### 3. Transfer Cutoff Timing

**Venue setting:**
```typescript
transferCutoffHours: number;  // Default: 4 hours before event
```

**Validation:**
```typescript
validateTransferTiming(eventStartTime, transferCutoffHours) {
  const cutoffTime = new Date(eventStartTime);
  cutoffTime.setHours(cutoffTime.getHours() - transferCutoffHours);

  if (new Date() >= cutoffTime) {
    throw new ValidationError(
      `Transfers not allowed within ${transferCutoffHours} hours of event start`
    );
  }
}
```

---

### 4. Listing Advance Timing

**Venue setting:**
```typescript
listingAdvanceHours: number;  // Default: 720 (30 days)
```

**Validation:**
```typescript
validateListingTiming(eventStartTime, listingAdvanceHours) {
  const listingWindowStart = new Date(eventStartTime);
  listingWindowStart.setHours(listingWindowStart.getHours() - listingAdvanceHours);

  if (new Date() < listingWindowStart) {
    throw new ValidationError(
      `Cannot list tickets more than ${listingAdvanceHours} hours before event`
    );
  }

  if (new Date() >= eventStartTime) {
    throw new ValidationError('Cannot list tickets for past events');
  }
}
```

---

### 5. User Listing Limits

**Venue settings:**
```typescript
maxListingsPerUserPerEvent: number;  // Default: 8
maxListingsPerUserTotal: number;     // Default: 50
```

**Validation:**
```typescript
async validateUserListingLimits(userId, eventId, maxPerEvent, maxTotal) {
  const eventListings = await listingModel.countByUserId(userId, eventId);
  if (eventListings >= maxPerEvent) {
    throw new ValidationError(`Max ${maxPerEvent} listings per event`);
  }

  const totalListings = await listingModel.countByUserId(userId);
  if (totalListings >= maxTotal) {
    throw new ValidationError(`Max ${maxTotal} total listings`);
  }
}
```

---

### 6. Listing Approval Workflow

**Venue settings:**
```typescript
requireListingApproval: boolean;      // Default: false
autoApproveVerifiedSellers: boolean;  // Auto-approve verified sellers
```

**Listing status:**
```typescript
type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
```

---

### 7. Price Update Validation
```typescript
async validatePriceUpdate(listingId, newPrice, userId) {
  const listing = await listingModel.findById(listingId);
  
  if (listing.sellerId !== userId) {
    throw new ForbiddenError('You can only update your own listings');
  }

  if (listing.status !== 'active') {
    throw new ValidationError('Can only update active listings');
  }

  const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
  
  return this.validatePrice(
    newPrice,
    listing.originalFaceValue,
    venueSettings.minPriceMultiplier,
    venueSettings.maxResaleMultiplier,
    venueSettings.allowBelowFace
  );
}
```

---

## Venue Marketplace Settings (Full)
```typescript
interface VenueMarketplaceSettings {
  // Pricing controls
  maxResaleMultiplier: number;      // 3.0 = 300% max
  minPriceMultiplier: number;       // 1.0 = 100% min
  allowBelowFace: boolean;          // Allow < face value

  // Timing controls
  transferCutoffHours: number;      // Hours before event
  listingAdvanceHours: number;      // How early can list
  autoExpireOnEventStart: boolean;  // Auto-expire listings

  // Limits
  maxListingsPerUserPerEvent: number;
  maxListingsPerUserTotal: number;

  // Approval
  requireListingApproval: boolean;
  autoApproveVerifiedSellers: boolean;

  // Royalties
  royaltyPercentage: number;        // 5.00 = 5%
  royaltyWalletAddress: string;
  minimumRoyaltyPayout: number;     // Cents

  // International
  allowInternationalSales: boolean;
  blockedCountries: string[];

  // KYC
  requireKycForHighValue: boolean;
  highValueThreshold: number;       // Cents
}
```

**Defaults:**
| Setting | Default |
|---------|---------|
| maxResaleMultiplier | 3.0 (300%) |
| minPriceMultiplier | 1.0 (100%) |
| allowBelowFace | false |
| transferCutoffHours | 4 hours |
| listingAdvanceHours | 720 (30 days) |
| maxListingsPerUserPerEvent | 8 |
| maxListingsPerUserTotal | 50 |
| requireListingApproval | false |
| royaltyPercentage | 5% |

---

## What's NOT Implemented ❌

### 1. Offers/Counter-offers

**Expected:**
```typescript
interface Offer {
  id: string;
  listingId: string;
  buyerId: string;
  offerPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'countered';
  expiresAt: Date;
  counterOfferId?: string;
}

// Buyer makes offer
POST /listings/:listingId/offers
{ "price": 150 }

// Seller responds
POST /offers/:offerId/accept
POST /offers/:offerId/reject
POST /offers/:offerId/counter
{ "price": 175 }
```

**Status:** No offer system exists - fixed price only

---

### 2. Auction-Style Sales

**Expected:**
```typescript
interface AuctionListing {
  startingPrice: number;
  reservePrice?: number;
  currentBid?: number;
  highestBidderId?: string;
  auctionEndsAt: Date;
  bidIncrement: number;
}

// Place bid
POST /auctions/:auctionId/bid
{ "amount": 200 }
```

**Status:** No auction system exists

---

### 3. Dynamic Pricing

**Expected:**
- Automatic price adjustments based on demand
- Surge pricing near event date
- Price recommendations based on comparables

**Status:** Not implemented

---

## Validation Flow
```
1. Seller creates listing
   POST /listings { ticketId, price, expiresAt }
         │
         ▼
2. validateListingCreation()
   ├── Check ticket not already listed
   ├── Get venue settings
   ├── validatePrice() - check floor/ceiling
   ├── validateListingTiming() - check advance hours
   └── validateUserListingLimits() - check per-event/total
         │
         ▼
3. If requireListingApproval → status = 'pending_approval'
   Else → status = 'active'
         │
         ▼
4. Buyer attempts purchase
         │
         ▼
5. validateTransfer()
   ├── Check listing status = 'active'
   ├── Check listing not expired
   ├── validateTransferTiming() - check cutoff
   └── Check buyer ≠ seller
         │
         ▼
6. Process purchase
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Price floor (min multiplier) | ✅ Working |
| Price ceiling (max multiplier) | ✅ Working |
| Below face value control | ✅ Working |
| Listing expiration | ✅ Working |
| Auto-expire on event start | ✅ Configurable |
| Transfer cutoff | ✅ Working |
| Listing advance window | ✅ Working |
| User listing limits | ✅ Working |
| Listing approval workflow | ✅ Working |
| Price update validation | ✅ Working |
| Venue-level configuration | ✅ Comprehensive |
| Offers/counter-offers | ❌ Not implemented |
| Auction sales | ❌ Not implemented |
| Dynamic pricing | ❌ Not implemented |

**Bottom Line:** The marketplace has robust, venue-controlled pricing rules. All validation is properly implemented. The gap is in alternative sales mechanisms (offers, auctions) which would require significant new development.

---

## Related Documents

- `SECONDARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow (stub issue)
- `ROYALTY_DISTRIBUTION_FLOW_AUDIT.md` - Royalty payments
- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue setup
