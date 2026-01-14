# MARKETPLACE FLOW AUDIT SUMMARY

> **Generated:** January 2, 2025
> **Category:** marketplace
> **Total Files:** 10
> **Status:** ✅ Complete (3) | ⚠️ Partial (4) | ❌ Not Implemented (3)

---

## CRITICAL ISSUES

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| **P0** | No custodial wallet system | CUSTODIAL_WALLET | NFT minting returns fake tokenId, users can transfer NFTs outside platform, breaks royalty enforcement |
| P2 | Dispute resolution doesn't trigger refunds | BUYER_PROTECTION | Disputes resolved but money not returned automatically |
| P2 | No fraudulent buyer detection | SELLER_PROTECTION | Sellers vulnerable to chargeback fraud, fake claims |
| P3 | Make offer is just validation | MAKE_OFFER | No offers table, no negotiation, offeredPrice just validates >= listingPrice |
| P3 | Seller verification flag without process | SELLER_VERIFICATION | auto_approve_verified_sellers exists but no way to become verified |
| P3 | Price history not exposed via API | PRICE_HISTORY_ANALYTICS | PriceHistoryModel complete but no routes |

---

## FILE-BY-FILE BREAKDOWN

---

### 1. BUYER_PROTECTION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works:**

**Database Tables:**
- marketplace_disputes - stores dispute records
- dispute_evidence - stores uploaded evidence

**Dispute Service:**
```typescript
class DisputeService {
  async createDispute(buyerId, listingId, reason, description);
  async addEvidence(disputeId, type, content, uploadedBy);
  async resolveDispute(disputeId, resolution, adminId, notes);
  async getDispute(disputeId);
  async getDisputesByUser(userId);
}
```

**Dispute Types:**
- entry_denied - couldn't enter venue with ticket
- technical_issue - QR code didn't scan
- event_cancelled - event was cancelled
- ticket_invalid - ticket was fake/already used
- other

**Dispute Statuses:**
open → under_review → resolved_buyer_favor | resolved_seller_favor | resolved_split

**What's Missing:**
- No automatic refund on resolution - just updates status
- No escrow hold during dispute period
- No time-based auto-resolution (e.g., auto-resolve after 14 days)
- No buyer guarantee policy enforcement
- No dispute notifications to parties
- No escalation path

**Expected Flow (Not Implemented):**
```typescript
// When resolved in buyer's favor:
if (resolution === 'resolved_buyer_favor') {
  await escrowService.refundBuyer(dispute.escrowId);
  await notificationService.send(buyer, 'dispute_won');
  await notificationService.send(seller, 'dispute_lost');
}
```

**Key Files:**
- marketplace-service/src/routes/disputes.routes.ts
- marketplace-service/src/services/dispute.service.ts
- marketplace-service/src/models/dispute.model.ts

---

### 2. CUSTODIAL_WALLET_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | **P0 - CRITICAL** |

**Current Architecture (Wrong Model):**
System designed for user-controlled wallets:
- Users connect Phantom/MetaMask
- Users hold their own NFTs
- Users can transfer NFTs anywhere

**NFT Minting is STUB:**
```typescript
// ticket-service/src/services/solanaService.ts
async mintTicketNFT(ticketData) {
  // SIMULATED - returns fake data
  return {
    tokenId: `token_${Date.now()}`,
    mintAddress: `fake_mint_${Date.now()}`,
    transactionSignature: `fake_sig_${Date.now()}`
  };
}
```

**Why This Breaks Everything:**
1. Users can transfer NFTs to external wallets
2. Secondary sales can happen outside platform
3. Royalties cannot be collected on external sales
4. Platform loses control of ticket validity
5. Anti-scalping rules unenforceable

**What's Needed:**
```typescript
// Platform-controlled wallets
class CustodialWalletService {
  async createWalletForUser(userId): Promise<{ publicKey, encryptedPrivateKey }>;
  async signTransfer(fromUserId, toUserId, tokenId): Promise<Transaction>;
  async getWalletBalance(userId): Promise<NFT[]>;
}

// Secure key storage
class KMSIntegration {
  async encryptPrivateKey(key): Promise<EncryptedKey>;
  async decryptForSigning(encryptedKey): Promise<PrivateKey>;
}
```

**Required Tables:**
```sql
CREATE TABLE custodial_wallets (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id),
  public_key VARCHAR(255) NOT NULL,
  encrypted_private_key TEXT NOT NULL,  -- KMS encrypted
  kms_key_id VARCHAR(255),
  created_at TIMESTAMP
);
```

**Build Effort:** 12-18 days total
- Wallet derivation: 2-3 days
- KMS integration: 3-4 days
- Transfer signing: 2-3 days
- Migration from user wallets: 3-4 days
- Testing: 2-4 days

**Key Files:**
- auth-service/src/services/wallet.service.ts (current - wrong model)
- ticket-service/src/services/solanaService.ts (stub)

---

### 3. DYNAMIC_PRICING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Works - Schema Complete:**
```typescript
interface EventPricing {
  eventId: string;
  tierId: string;
  
  // Base pricing
  basePrice: number;
  currentPrice: number;
  
  // Dynamic pricing flag
  isDynamic: boolean;
  
  // Bounds
  minPrice: number;
  maxPrice: number;
  
  // Time-based tiers
  earlyBirdPrice: number;
  earlyBirdEndsAt: Date;
  lastMinutePrice: number;
  lastMinuteStartsAt: Date;
  
  // Group discounts
  groupDiscounts: {
    minQuantity: number;
    discountPercentage: number;
  }[];
  
  // Sales windows
  salesWindows: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    price: number;
  }[];
}
```

**Methods That Work:**
```typescript
class EventPricingModel {
  async create(pricing);
  async update(id, pricing);
  async getByEventId(eventId);
  async getActivePricing(eventId, tierId);  // Returns current applicable price
}
```

**What's Missing:**
- No automatic price adjustment job
- No demand-based pricing algorithm
- Time-based tiers not auto-applied at purchase time
- No price change notifications
- No price history tracking for dynamic changes

**Expected But Not Built:**
```typescript
// Scheduled job to adjust prices
@Cron('*/15 * * * *')
async adjustDynamicPrices() {
  const dynamicEvents = await this.getDynamicPricingEvents();
  for (const event of dynamicEvents) {
    const demand = await this.calculateDemand(event.id);
    const newPrice = this.calculatePrice(event, demand);
    await this.updateCurrentPrice(event.id, newPrice);
  }
}

// At purchase time
async getPurchasePrice(eventId, tierId, quantity, purchaseDate) {
  const pricing = await this.getActivePricing(eventId, tierId);
  
  // Check early bird
  if (purchaseDate < pricing.earlyBirdEndsAt) {
    return pricing.earlyBirdPrice;
  }
  
  // Check last minute
  if (purchaseDate > pricing.lastMinuteStartsAt) {
    return pricing.lastMinutePrice;
  }
  
  // Check group discount
  const discount = pricing.groupDiscounts.find(d => quantity >= d.minQuantity);
  if (discount) {
    return pricing.currentPrice * (1 - discount.discountPercentage);
  }
  
  return pricing.currentPrice;
}
```

**Key Files:**
- event-service/src/models/event-pricing.model.ts
- payment-service/src/services/pricing.service.ts

---

### 4. LISTING_MANAGEMENT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**

**Full CRUD:**
- POST /listings - create listing
- GET /listings/:id - get listing
- PUT /listings/:id - update listing
- DELETE /listings/:id - cancel listing
- GET /listings - list with filters

**Authentication & Authorization:**
- JWT authentication required
- Wallet verification middleware
- Ownership validation (verifyListingOwnership)
- Tenant isolation

**Business Rules:**
- 300% max markup above face value
- Duplicate prevention (one active listing per ticket)
- Distributed locking via Redis prevents race conditions
- Price must be within venue's floor/ceiling rules

**Listing Statuses:**
- active - visible and purchasable
- pending_approval - awaiting venue approval
- sold - purchased
- cancelled - seller cancelled
- expired - past expiration date

**Audit Logging:**
```typescript
await auditLog({
  action: 'listing_created',
  listingId,
  sellerId,
  price,
  priceChangePercent: ((price - faceValue) / faceValue) * 100
});
```

**Search Sync:**
On create/update, syncs to search index for discovery.

**Key Files:**
- marketplace-service/src/routes/listings.routes.ts
- marketplace-service/src/controllers/listing.controller.ts
- marketplace-service/src/services/listing.service.ts
- marketplace-service/src/middleware/auth.middleware.ts
- marketplace-service/src/middleware/wallet.middleware.ts

---

### 5. MAKE_OFFER_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**Current State:**
```typescript
// marketplace-service/src/services/purchase.service.ts
async purchaseListing(listingId, buyerId, offeredPrice) {
  const listing = await this.getListing(listingId);
  
  // offeredPrice just validates it's >= listing price
  if (offeredPrice < listing.price) {
    throw new Error('Offered price below listing price');
  }
  
  // Proceeds with purchase at listing.price
  // offeredPrice allows "tips" but not negotiation
}
```

**What's Missing:**

**Offers Table:**
```sql
CREATE TABLE offers (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES marketplace_listings(id),
  buyer_id UUID REFERENCES users(id),
  offered_price INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, rejected, expired, withdrawn
  expires_at TIMESTAMP,
  message TEXT,
  created_at TIMESTAMP,
  responded_at TIMESTAMP
);
```

**Expected Endpoints:**
```typescript
POST /listings/:id/offers        // Create offer
GET /listings/:id/offers         // List offers (seller view)
GET /offers/mine                 // My offers (buyer view)
PUT /offers/:id/accept           // Seller accepts
PUT /offers/:id/reject           // Seller rejects
PUT /offers/:id/counter          // Seller counters
DELETE /offers/:id               // Buyer withdraws
```

**Expected Flow:**
1. Buyer submits offer below listing price
2. Seller notified
3. Seller accepts/rejects/counters
4. If accepted, proceeds to purchase at offer price
5. Offer expires after 24-48 hours if no response

**Build Effort:** ~4.25 days
- Database schema: 0.25 days
- Offer service: 1.5 days
- Notification integration: 1 day
- Counter-offer logic: 1 day
- Testing: 0.5 days

**Key Files:**
- marketplace-service/src/services/purchase.service.ts (offeredPrice validation only)

---

### 6. MARKETPLACE_PRICING_RULES_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**

**VenueSettings Model - Full Configuration:**
```typescript
interface MarketplaceSettings {
  // Price controls
  priceFloorMultiplier: number;      // Default 1.0 (100% = face value minimum)
  priceCeilingMultiplier: number;    // Default 3.0 (300% = max 3x face value)
  allowBelowFaceValue: boolean;      // Allow listings below face value
  
  // Timing controls
  listingExpirationDays: number;     // Default 30
  autoExpireOnEventStart: boolean;   // Cancel listings when event starts
  transferCutoffHours: number;       // Default 4 (no transfers 4hrs before event)
  listingAdvanceHours: number;       // Default 720 (can list 30 days before)
  
  // User limits
  maxListingsPerEvent: number;       // Default 8
  maxTotalActiveListings: number;    // Default 50
  
  // Approval workflow
  requireListingApproval: boolean;   // Manual approval required
  autoApproveVerifiedSellers: boolean;
  autoApproveUnderPrice: number;     // Auto-approve if under this price
}
```

**Validation on Listing Create/Update:**
```typescript
async validateListingPrice(venueId, ticketFaceValue, requestedPrice) {
  const settings = await this.getVenueSettings(venueId);
  
  const minPrice = ticketFaceValue * settings.priceFloorMultiplier;
  const maxPrice = ticketFaceValue * settings.priceCeilingMultiplier;
  
  if (!settings.allowBelowFaceValue && requestedPrice < ticketFaceValue) {
    throw new Error('Price cannot be below face value');
  }
  
  if (requestedPrice < minPrice) {
    throw new Error(`Price must be at least ${minPrice}`);
  }
  
  if (requestedPrice > maxPrice) {
    throw new Error(`Price cannot exceed ${maxPrice}`);
  }
}
```

**What's Not Included (Out of Scope):**
- Offers/counter-offers (see MAKE_OFFER)
- Auction-style sales
- Dynamic pricing adjustments

**Key Files:**
- marketplace-service/src/models/venue-settings.model.ts
- marketplace-service/src/services/listing.service.ts (validation)

---

### 7. MARKETPLACE_SEARCH_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**

**Search Endpoint:**
```typescript
GET /search
Query params:
  - eventId: filter by event
  - venueId: filter by venue
  - minPrice, maxPrice: price range
  - startDate, endDate: event date range
  - category: event category
  - limit: 1-100 (default 20)
  - offset: pagination
  - sort: price_asc, price_desc, date_asc, date_desc, relevance
```

**Search Service:**
```typescript
class SearchService {
  async searchListings(filters, pagination, sort);
  async getTrendingListings(venueId?, limit?);  // By view_count
  async getRecommendations(userId);  // Based on purchase history
  async addToWatchlist(userId, listingId);
  async getWatchlist(userId);
}
```

**Caching:**
- Search results cached with TTL
- Cache invalidated on listing create/update/delete
- Trending listings cached separately

**What's Limited:**
- No full-text search on event/venue names (filter-based only)
- Would need Elasticsearch integration for text search

**Key Files:**
- marketplace-service/src/routes/search.routes.ts
- marketplace-service/src/controllers/search.controller.ts
- marketplace-service/src/services/search.service.ts

---

### 8. PRICE_HISTORY_ANALYTICS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Works - Model Complete:**

**Database Table:**
```sql
CREATE TABLE marketplace_price_history (
  id UUID PRIMARY KEY,
  listing_id UUID REFERENCES marketplace_listings(id),
  event_id UUID REFERENCES events(id),
  old_price INTEGER,
  new_price INTEGER,
  change_type VARCHAR(20),  -- 'created', 'updated', 'sold'
  changed_at TIMESTAMP DEFAULT NOW()
);
```

**PriceHistoryModel Methods:**
```typescript
class PriceHistoryModel {
  async recordPriceChange(listingId, eventId, oldPrice, newPrice, changeType);
  
  async getPriceHistory(listingId): Promise<PriceChange[]>;
  
  async getAveragePrice(eventId, startDate, endDate): Promise<number>;
  
  async getPriceTrends(eventId, period: 'day' | 'week' | 'month'): Promise<{
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    trendDirection: 'up' | 'down' | 'stable';
    changePercent: number;
  }>;
}
```

**What's Missing - No API Endpoints:**
```typescript
// These should exist but don't:
GET /listings/:listingId/price-history
GET /events/:eventId/price-analytics
GET /events/:eventId/price-trends?period=week

// Also missing:
// - Price alerts for users ("notify me when price drops below X")
// - Historical sale prices (only tracks listing price changes, not completed sales)
```

**Key Files:**
- marketplace-service/src/models/price-history.model.ts ✅
- No routes or controller for price history

---

### 9. SELLER_PROTECTION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works:**

**Same Dispute System as Buyers:**
- Sellers can file disputes using same DisputeService
- Evidence submission works
- Admin resolution works

**Escrow Protection:**
```typescript
// Funds held until transfer confirmed
class EscrowService {
  async createEscrow(transactionId, amount, holdPeriod);
  async releaseToSeller(escrowId);  // After transfer confirmed
  async refundToBuyer(escrowId);    // If dispute resolved for buyer
}
```

**Blockchain Proof:**
- Transfer recorded on-chain provides proof of delivery
- Seller can show transaction signature as evidence

**What's Missing:**

**Fraudulent Buyer Detection:**
```typescript
// Should exist but doesn't:
class BuyerFraudService {
  async calculateBuyerRiskScore(buyerId): Promise<{
    score: number;
    factors: {
      previousDisputes: number;
      disputeWinRate: number;
      chargebackHistory: number;
      accountAge: number;
    };
  }>;
  
  async shouldBlockPurchase(buyerId, listingId): Promise<boolean>;
}
```

**Seller Verification (Cross-ref to SELLER_VERIFICATION):**
- No verified seller badges
- No seller ratings system
- No sales history verification

**Chargeback Reserve:**
- ChargebackReserveService exists in payment-service
- NOT integrated with marketplace
- Should hold percentage of seller earnings

**Seller Risks Not Covered:**
- Buyer claims non-receipt after valid blockchain transfer
- Buyer initiates chargeback with bank after receiving ticket
- Buyer sells immediately and claims ticket was bad
- Coordinated fraud rings

**Key Files:**
- marketplace-service/src/services/dispute.service.ts
- payment-service/src/services/marketplace/escrow.service.ts
- payment-service/src/services/chargeback-reserve.service.ts (exists, not wired)

---

### 10. SELLER_VERIFICATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
```typescript
// In venue-settings.model.ts
interface MarketplaceSettings {
  autoApproveVerifiedSellers: boolean;  // Flag exists
  // But no way to become a verified seller
}
```

**What's Missing:**

**Verified Sellers Table:**
```sql
CREATE TABLE verified_sellers (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id),
  verification_level VARCHAR(20),  -- 'basic', 'pro', 'elite'
  verified_at TIMESTAMP,
  verified_by UUID,  -- admin who verified
  verification_data JSONB,  -- what was checked
  expires_at TIMESTAMP,  -- annual renewal
  
  -- Stats
  total_sales INTEGER DEFAULT 0,
  dispute_rate DECIMAL(5,4) DEFAULT 0,
  average_rating DECIMAL(3,2)
);
```

**Expected Verification Levels:**
```typescript
const verificationLevels = {
  basic: {
    requires: ['email_verified', 'phone_verified'],
    benefits: ['faster_listing_approval'],
    fee_discount: 0
  },
  pro: {
    requires: ['basic', 'identity_verified', 'min_10_sales', 'dispute_rate_under_5%'],
    benefits: ['instant_listing', 'priority_support'],
    fee_discount: 0.1  // 10% lower fees
  },
  elite: {
    requires: ['pro', 'min_100_sales', 'dispute_rate_under_2%', 'rating_above_4.5'],
    benefits: ['featured_seller_badge', 'lowest_fees', 'dedicated_support'],
    fee_discount: 0.2  // 20% lower fees
  }
};
```

**Expected Endpoints:**
```typescript
POST /sellers/verify/start         // Start verification process
POST /sellers/verify/identity      // Submit identity documents
GET /sellers/verify/status         // Check verification status
GET /sellers/:id/profile           // Public seller profile with badges
```

**Key Files:**
- marketplace-service/src/models/venue-settings.model.ts (flag only)
- No verification service, routes, or tables

---

## STATISTICS

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Complete | 3 | 30% |
| ⚠️ Partial | 4 | 40% |
| ❌ Not Implemented | 3 | 30% |

---

## KEY DEPENDENCIES

**Critical Path:**
The entire marketplace depends on the custodial wallet system (P0). Without platform-controlled wallets:
- NFTs can be transferred outside platform
- Secondary sales can bypass platform entirely
- Royalty collection impossible on external transfers
- Anti-scalping rules unenforceable
- Escrow meaningless if NFT already transferred

**Integration Points:**
- Escrow service (payment-service) ↔ Dispute resolution
- Chargeback reserve (payment-service) ↔ Seller protection
- KYC (compliance-service) ↔ Seller verification
- Notifications ↔ Offers, disputes, sales

---

## RECOMMENDED FIX ORDER

1. **P0: Custodial wallet system**
   - Platform-controlled wallets
   - KMS key storage
   - Signed transfers
   - Effort: 12-18 days

2. **P2: Wire dispute resolution to refunds**
   - Call escrow refund on buyer-favored resolution
   - Add notifications
   - Effort: 1-2 days

3. **P2: Buyer fraud scoring**
   - Track buyer dispute history
   - Block high-risk buyers
   - Effort: 2-3 days

4. **P3: Price history API**
   - Add routes for existing model
   - Effort: 0.5 days

5. **P3: Make offer system**
   - Offers table
   - Full negotiation flow
   - Effort: 4-5 days

6. **P3: Seller verification**
   - Verification levels
   - Identity verification integration
   - Effort: 3-4 days
