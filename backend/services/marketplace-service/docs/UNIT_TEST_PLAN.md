Here is the comprehensive **UNIT_TEST_PLAN.md** for the marketplace-service:

---

# Marketplace Service - Unit Test Plan

## Overview

This document outlines the comprehensive unit testing plan for the marketplace-service, a secondary ticket marketplace handling crypto (Solana) and fiat (Stripe) payments.

**Service Summary:**
- **19 Services** - Core business logic
- **12 Controllers** - HTTP handlers
- **13 Middleware** - Auth, rate-limit, tenant-context
- **9 Models** - Database models
- **14 Utils** - Helpers and utilities
- **12 Routes** - API route definitions
- **4 Events** - Event bus and handlers
- **10 Config** - Configuration modules

**Coverage Targets (from jest.config.js):**
- Global: 80% lines, 75% functions, 70% branches
- Services: 85% lines, 85% functions, 80% branches
- Middleware: 80% lines, 80% functions, 75% branches

---

## Test File Structure

```
tests/
├── setup.ts                    # Global test setup (exists)
├── teardown.ts                 # Global teardown
├── unit/
│   ├── index.test.ts           # Entry point tests
│   ├── app.test.ts             # Fastify app tests
│   ├── server.test.ts          # Server startup tests
│   ├── config/
│   │   ├── index.test.ts
│   │   ├── database.test.ts
│   │   ├── redis.test.ts
│   │   ├── blockchain.test.ts
│   │   ├── fees.test.ts
│   │   ├── validate.test.ts
│   │   └── secrets.test.ts
│   ├── services/
│   │   ├── listing.service.test.ts
│   │   ├── blockchain.service.test.ts
│   │   ├── stripe-payment.service.test.ts
│   │   ├── transfer.service.test.ts
│   │   ├── dispute.service.test.ts
│   │   ├── anti-bot.service.test.ts
│   │   ├── escrow-monitor.service.test.ts
│   │   ├── fee.service.test.ts
│   │   ├── fee-distribution.service.test.ts
│   │   ├── validation.service.test.ts
│   │   ├── notification.service.test.ts
│   │   ├── venue-rules.service.test.ts
│   │   ├── wallet.service.test.ts
│   │   ├── seller-onboarding.service.test.ts
│   │   ├── search.service.test.ts
│   │   ├── refund.service.test.ts
│   │   ├── tax-reporting.service.test.ts
│   │   ├── ticket-lookup.service.test.ts
│   │   └── cache-integration.test.ts
│   ├── controllers/
│   │   ├── listing.controller.test.ts
│   │   ├── buy.controller.test.ts
│   │   ├── transfer.controller.test.ts
│   │   ├── admin.controller.test.ts
│   │   ├── dispute.controller.test.ts
│   │   ├── webhook.controller.test.ts
│   │   ├── search.controller.test.ts
│   │   ├── tax.controller.test.ts
│   │   ├── seller-onboarding.controller.test.ts
│   │   ├── venue-settings.controller.test.ts
│   │   ├── health.controller.test.ts
│   │   └── listings.controller.test.ts
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── internal-auth.test.ts
│   │   ├── rate-limit.test.ts
│   │   ├── tenant-context.test.ts
│   │   ├── purchase-cooldown.test.ts
│   │   ├── idempotency.test.ts
│   │   ├── request-logger.test.ts
│   │   ├── request-id.test.ts
│   │   ├── error.middleware.test.ts
│   │   ├── cache.middleware.test.ts
│   │   ├── validation.middleware.test.ts
│   │   ├── venue-access.middleware.test.ts
│   │   └── wallet.middleware.test.ts
│   ├── models/
│   │   ├── listing.model.test.ts
│   │   ├── transfer.model.test.ts
│   │   ├── fee.model.test.ts
│   │   ├── dispute.model.test.ts
│   │   ├── anti-bot.model.test.ts
│   │   ├── blacklist.model.test.ts
│   │   ├── price-history.model.test.ts
│   │   ├── tax-reporting.model.test.ts
│   │   └── venue-settings.model.test.ts
│   ├── utils/
│   │   ├── circuit-breaker.test.ts
│   │   ├── response-filter.test.ts
│   │   ├── metrics.test.ts
│   │   ├── distributed-lock.test.ts
│   │   ├── db-operations.test.ts
│   │   ├── data-lifecycle.test.ts
│   │   ├── discrepancy-alerting.test.ts
│   │   ├── errors.test.ts
│   │   ├── logger.test.ts
│   │   ├── constants.test.ts
│   │   ├── validators.test.ts
│   │   ├── date-helper.test.ts
│   │   ├── solana-helper.test.ts
│   │   └── wallet-helper.test.ts
│   ├── events/
│   │   ├── event-bus.test.ts
│   │   ├── event-types.test.ts
│   │   ├── handlers.test.ts
│   │   └── publishers.test.ts
│   ├── routes/
│   │   ├── index.test.ts
│   │   ├── listings.routes.test.ts
│   │   ├── transfers.routes.test.ts
│   │   ├── venue.routes.test.ts
│   │   ├── search.routes.test.ts
│   │   ├── admin.routes.test.ts
│   │   ├── disputes.routes.test.ts
│   │   ├── tax.routes.test.ts
│   │   ├── health.routes.test.ts
│   │   ├── webhook.routes.test.ts
│   │   ├── seller-onboarding.routes.test.ts
│   │   └── metrics.routes.test.ts
│   ├── queues/
│   │   └── retry-queue.test.ts
│   ├── jobs/
│   │   └── listing-expiration.test.ts
│   └── schemas/
│       ├── validation.test.ts
│       └── wallet.schema.test.ts
```

---

## Priority 1: Core Services (Critical Path)

### 1.1 listing.service.test.ts
**Source:** `src/services/listing.service.ts`
**Priority:** P0 (Critical)
**Estimated Tests:** 25-30

```typescript
describe('ListingService', () => {
  describe('createListing', () => {
    it('should create listing with distributed lock')
    it('should reject if ticket already has active listing')
    it('should set price from original face value')
    it('should warn if client attempts to set price directly')
    it('should publish search sync event on creation')
    it('should handle lock acquisition failure')
  })

  describe('updateListingPrice', () => {
    it('should update price with distributed lock')
    it('should reject price <= 0')
    it('should reject if listing not found')
    it('should reject if user is not the owner')
    it('should reject if listing status is not active')
    it('should enforce max 300% markup limit')
    it('should calculate markup percentage correctly')
    it('should publish search sync event on update')
  })

  describe('cancelListing', () => {
    it('should cancel listing with distributed lock')
    it('should reject if listing not found')
    it('should reject if user is not the owner')
    it('should reject if listing status is not active')
    it('should publish search sync deletion event')
  })

  describe('getListingById', () => {
    it('should return listing by ID')
    it('should throw NotFoundError if not found')
  })

  describe('searchListings', () => {
    it('should search by seller ID')
    it('should search by event ID')
    it('should apply pagination')
    it('should filter by status')
  })

  describe('markListingAsSold', () => {
    it('should mark listing as sold with distributed lock')
    it('should reject if listing not found')
    it('should reject if status is not active or pending_approval')
    it('should record buyer ID')
    it('should publish search sync deletion event')
  })
})
```

### 1.2 blockchain.service.test.ts
**Source:** `src/services/blockchain.service.ts`
**Priority:** P0 (Critical)
**Estimated Tests:** 30-35

```typescript
describe('RealBlockchainService', () => {
  describe('constructor', () => {
    it('should initialize connection')
    it('should initialize program')
    it('should load wallet from private key')
    it('should handle invalid private key')
  })

  describe('transferNFT', () => {
    it('should execute transfer with retry')
    it('should retry on transient failures')
    it('should not retry on insufficient balance')
    it('should throw after max retries')
    it('should use exponential backoff')
  })

  describe('executeTransfer', () => {
    it('should build and send transaction')
    it('should create listing PDA')
    it('should create marketplace PDA')
    it('should create reentrancy guard PDA')
    it('should wait for confirmation')
    it('should handle program not initialized')
    it('should handle wallet not configured')
  })

  describe('verifyNFTOwnership', () => {
    it('should verify ownership from on-chain data')
    it('should return false on error')
    it('should return false if program not initialized')
  })

  describe('getWalletBalance', () => {
    it('should return balance in SOL')
    it('should throw on invalid address')
  })

  describe('validateTransaction', () => {
    it('should return true for valid transaction')
    it('should return false for invalid signature')
    it('should return false on error')
  })

  describe('createEscrowAccount', () => {
    it('should derive escrow PDA')
    it('should create initialization instruction')
    it('should return escrow address')
  })

  describe('releaseEscrowToSeller', () => {
    it('should create release instruction')
    it('should send and confirm transaction')
    it('should handle platform and venue fees')
  })

  describe('refundEscrowToBuyer', () => {
    it('should create refund instruction')
    it('should send and confirm transaction')
  })

  describe('getEscrowStatus', () => {
    it('should return escrow details')
    it('should return exists: false if not found')
  })
})
```

### 1.3 stripe-payment.service.test.ts
**Source:** `src/services/stripe-payment.service.ts`
**Priority:** P0 (Critical)
**Estimated Tests:** 35-40

```typescript
describe('StripePaymentService', () => {
  describe('constructor', () => {
    it('should initialize Stripe client')
    it('should throw if STRIPE_SECRET_KEY not configured')
  })

  describe('createPaymentIntent', () => {
    it('should create PaymentIntent with destination charges')
    it('should calculate platform fee correctly')
    it('should calculate venue fee correctly')
    it('should set transfer_data destination')
    it('should set application_fee_amount')
    it('should include metadata')
    it('should enable automatic payment methods')
  })

  describe('createPaymentIntentWithSeparateCharges', () => {
    it('should create PaymentIntent without transfer_data')
    it('should store split amounts in metadata')
    it('should handle venue without Stripe Connect')
  })

  describe('createTransferToSeller', () => {
    it('should create transfer with source_transaction')
    it('should set transfer_group')
    it('should include metadata')
  })

  describe('createTransferToVenue', () => {
    it('should create transfer to venue')
    it('should skip if venue has no Stripe account')
    it('should skip if amount is zero')
    it('should not throw on venue transfer failure')
  })

  describe('getPaymentIntent', () => {
    it('should retrieve PaymentIntent')
    it('should throw on not found')
  })

  describe('cancelPaymentIntent', () => {
    it('should cancel PaymentIntent')
  })

  describe('createRefund', () => {
    it('should create full refund')
    it('should create partial refund')
    it('should reverse application fee')
  })

  describe('getSellerStripeAccountId', () => {
    it('should return account ID for fully onboarded seller')
    it('should return null if seller not found')
    it('should throw if account not connected')
    it('should throw if charges not enabled')
  })

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature')
    it('should throw on invalid signature')
  })

  describe('calculateFees', () => {
    it('should calculate all fee components')
    it('should calculate seller receives')
    it('should calculate buyer pays')
  })
})
```

### 1.4 transfer.service.test.ts
**Source:** `src/services/transfer.service.ts`
**Priority:** P0 (Critical)
**Estimated Tests:** 30-35

```typescript
describe('TransferService', () => {
  describe('initiateTransfer', () => {
    it('should validate listing exists')
    it('should validate transfer requirements')
    it('should check buyer wallet balance')
    it('should create transfer record')
    it('should create fee record')
    it('should throw ValidationError on insufficient balance')
  })

  describe('completeTransfer', () => {
    it('should validate transfer exists')
    it('should reject invalid status')
    it('should validate blockchain transaction')
    it('should update blockchain data')
    it('should mark transfer as completed')
    it('should mark listing as sold')
    it('should update fee collection')
  })

  describe('failTransfer', () => {
    it('should update status to failed')
    it('should record failure reason')
    it('should reactivate listing')
  })

  describe('initiateFiatTransfer', () => {
    describe('with ENABLE_VENUE_ROYALTY_SPLIT', () => {
      it('should use separate charges flow')
      it('should fetch event royalty data')
      it('should create PaymentIntent with separate charges')
      it('should store venue percentage in fee record')
    })

    describe('without ENABLE_VENUE_ROYALTY_SPLIT', () => {
      it('should use destination charges flow')
      it('should create PaymentIntent with transfer_data')
    })
  })

  describe('completeFiatTransfer', () => {
    it('should retrieve PaymentIntent')
    it('should extract charge ID')
    it('should create transfer to seller')
    it('should create transfer to venue')
    it('should update transfer status')
    it('should mark listing as sold')
    it('should sync blockchain ownership (non-fatal)')
  })

  describe('syncBlockchainOwnership', () => {
    it('should call blockchain transferTicket')
    it('should update transfer record on success')
    it('should log error but not throw on failure')
    it('should update blockchain_status to failed on error')
  })
})
```

---

## Priority 2: Supporting Services

### 2.1 dispute.service.test.ts (8-10 tests)
- createDispute - transfer validation, respondent assignment, evidence
- addEvidence - evidence types, metadata
- getDispute - retrieval
- getUserDisputes - filtering by initiator/respondent

### 2.2 anti-bot.service.test.ts (12-15 tests)
- checkPurchaseVelocity - rate limiting, flagging
- checkListingVelocity - daily limits
- analyzeUserPattern - bot scoring, caching
- enforceRateLimit - action limits, Redis cache
- isUserBlocked - cache check, score threshold

### 2.3 escrow-monitor.service.test.ts (15-18 tests)
- start/stop - lifecycle management
- checkTimedOutEscrows - query stuck transfers
- handleTimedOutEscrow - escrow status, refund, failure
- getMetrics - active/timed out counts
- manuallyResolveEscrow - refund/release actions

### 2.4 fee.service.test.ts (10-12 tests)
- getEventRoyaltyData - royalty lookups
- calculateFees - fee calculations
- getPlatformFeeReport - date range filtering
- getVenueFeeReport - venue-specific reports

### 2.5 fee-distribution.service.test.ts (10-12 tests)
- calculateFees - breakdown calculation
- recordFeeCollection - persistence
- distributeFees - distribution logic
- reconcileFees - discrepancy detection

### 2.6 validation.service.test.ts (15-18 tests)
- validateListingCreation - all validation rules
- validateTransfer - timing, ownership
- validatePrice - markup limits
- validateWalletAddress - Solana address format

### 2.7 seller-onboarding.service.test.ts (10-12 tests)
- createConnectAccountAndOnboardingLink
- getAccountStatus
- handleAccountUpdated
- canAcceptFiatPayments

### 2.8 Other Services (5-8 tests each)
- notification.service.test.ts
- venue-rules.service.test.ts
- wallet.service.test.ts
- search.service.test.ts
- refund.service.test.ts
- tax-reporting.service.test.ts
- ticket-lookup.service.test.ts

---

## Priority 3: Middleware Tests

### 3.1 auth.middleware.test.ts (15-18 tests)
- validateAuthConfig
- authMiddleware - token validation, user extraction
- requireAdmin - role check
- requireVenueOwner - venue ownership
- verifyListingOwnership - listing owner check

### 3.2 internal-auth.test.ts (12-15 tests)
- validateInternalRequest - HMAC verification
- generateInternalSignature - signature generation
- buildInternalHeaders - header construction
- createInternalFetch - authenticated client
- validateInternalAuthConfig - config validation

### 3.3 rate-limit.test.ts (12-15 tests)
- checkRateLimit - Redis increment, window
- getEndpointLimits - endpoint-specific limits
- getUserTierMultiplier - tier-based multipliers
- userRateLimitMiddleware - user-based limiting
- ipRateLimitMiddleware - IP-based limiting

### 3.4 tenant-context.test.ts (15-18 tests)
- extractTenantId - header extraction
- validateTenant - tenant validation
- tenantContextMiddleware - context setting
- tenantScopedQuery - RLS helper
- insertWithTenant - tenant-aware insert
- clearTenantCache - cache management

### 3.5 idempotency.test.ts (10-12 tests)
- idempotencyMiddleware - key handling
- captureIdempotencyResponse - response caching
- markIdempotencyFailed - failure marking
- clearIdempotencyEntry - cleanup

### 3.6 Other Middleware (5-8 tests each)
- purchase-cooldown.test.ts
- request-logger.test.ts
- request-id.test.ts
- error.middleware.test.ts
- cache.middleware.test.ts
- validation.middleware.test.ts

---

## Priority 4: Configuration Tests

### 4.1 fees.test.ts (20-25 tests)
- calculateFiatFees - all fee components, tiers, caps
- calculateCryptoFees - lamports, priority fees
- getNetworkFeeEstimate - caching
- getSellerFeeTier - volume-based tiers
- validateFeeBreakdown - math validation

### 4.2 validate.test.ts (15-18 tests)
- validateConfig - all requirements
- validateAndFail - production vs development
- getConfigValue - typed config retrieval
- ConfigTransformers - all transformers

### 4.3 database.test.ts (8-10 tests)
- SSL configuration
- Connection pooling
- testConnection
- closeConnection

### 4.4 redis.test.ts (8-10 tests)
- initRedis - initialization
- getRedis/getPub/getSub - client retrieval
- cache helpers - get/set/del/exists

### 4.5 blockchain.test.ts (8-10 tests)
- Connection initialization
- Wallet loading
- getBlockHeight, getBalance, testConnection

---

## Priority 5: Utility Tests

### 5.1 circuit-breaker.test.ts (15-18 tests)
- withCircuitBreaker - all states (closed, open, half-open)
- getCircuitState - state retrieval
- resetCircuit - state reset
- withRetry - retry logic
- withCircuitBreakerAndRetry - combined

### 5.2 distributed-lock.test.ts (12-15 tests)
- acquireLock/releaseLock - basic operations
- extendLock - lock extension
- withLock - lock wrapper
- acquireListingLock/acquirePurchaseLock - typed locks
- checkVersion/updateWithVersion - optimistic locking

### 5.3 db-operations.test.ts (10-12 tests)
- withDeadlockRetry - deadlock handling
- transactionWithRetry - transaction retry
- updateWithOptimisticLock - version checking

### 5.4 errors.test.ts (10-12 tests)
- All error classes - ValidationError, NotFoundError, etc.
- Status codes, messages, serialization

### 5.5 metrics.test.ts (10-12 tests)
- Counter operations
- Histogram observations
- Gauge operations
- Metrics export

### 5.6 response-filter.test.ts (10-12 tests)
- sanitizeObject - sensitive field masking
- sanitizeError - error formatting
- createSuccessResponse/createPaginatedResponse

---

## Priority 6: Model Tests

### 6.1 listing.model.test.ts (15-18 tests)
- create, findById, findByTicketId
- findByEventId, findBySellerId
- update, updateStatus
- incrementViewCount
- countByEventId, countByUserId
- expireListings

### 6.2 transfer.model.test.ts (12-15 tests)
- create, findById
- findByListingId, findByStripePaymentIntentId
- findByBuyerId, findBySellerId
- updateStatus, updateBlockchainData
- countByEventId, getTotalVolumeByVenueId

### 6.3 fee.model.test.ts (10-12 tests)
- create, findById, findByTransferId
- updateFeeCollection, recordTransferIds
- getTotalPlatformFees, getTotalVenueFees

### 6.4 Other Models (5-8 tests each)
- dispute.model.test.ts
- anti-bot.model.test.ts
- blacklist.model.test.ts
- price-history.model.test.ts
- tax-reporting.model.test.ts
- venue-settings.model.test.ts

---

## Priority 7: Controller Tests

### 7.1 listing.controller.test.ts (12-15 tests)
- createListing - validation, service call
- updateListingPrice - auth, validation
- cancelListing - ownership check
- getListing, getMyListings, getEventListings

### 7.2 buy.controller.test.ts (15-18 tests)
- buyListing - crypto/fiat routing
- buyWithRetry - retry logic
- processCryptoPurchase - blockchain flow
- processFiatPurchase - Stripe flow

### 7.3 webhook.controller.test.ts (12-15 tests)
- handleStripeWebhook - signature verification
- Event locking (tryAcquireEventLock, releaseEventLock)
- handlePaymentCompleted - transfer completion

### 7.4 Other Controllers (5-8 tests each)
- transfer.controller.test.ts
- admin.controller.test.ts
- dispute.controller.test.ts
- search.controller.test.ts

---

## Priority 8: Event Tests

### 8.1 event-bus.test.ts (20-25 tests)
- initEventBus - subscription setup
- publishEvent - publishing with retry
- subscribe - handler registration
- DLQ operations:
  - addToDLQ
  - getDLQEntries
  - retryDLQEntry
  - retryAllDLQEntries
  - removeDLQEntry
  - cleanupExpiredDLQEntries
- DLQ scheduler - start/stop
- closeEventBus

### 8.2 handlers.test.ts & publishers.test.ts (10-15 tests each)
- Event type handlers
- Event publishing

---

## Priority 9: Route Tests

For each route file, test:
- Route registration
- HTTP methods and paths
- Middleware attachment
- Schema validation

**Files:**
- listings.routes.test.ts
- transfers.routes.test.ts
- venue.routes.test.ts
- search.routes.test.ts
- admin.routes.test.ts
- disputes.routes.test.ts
- tax.routes.test.ts
- health.routes.test.ts
- webhook.routes.test.ts
- seller-onboarding.routes.test.ts

---

## Test Implementation Order

### Phase 1: Foundation (Week 1) ✅ COMPLETE
1. [x] errors/index.test.ts ✅
2. [x] utils/logger.test.ts ✅
3. [x] utils/metrics.test.ts ✅
4. [x] config/database.test.ts ✅
5. [x] config/redis.test.ts ✅
6. [x] config/validate.test.ts ✅

### Phase 2: Utilities (Week 2) ✅ COMPLETE
1. [x] circuit-breaker.test.ts ✅
2. [x] distributed-lock.test.ts ✅
3. [x] db-operations.test.ts ✅
4. [x] response-filter.test.ts ✅

### Phase 3: Models (Week 3) ✅ COMPLETE
1. [x] listing.model.test.ts ✅
2. [x] transfer.model.test.ts ✅
3. [x] fee.model.test.ts ✅
4. [x] dispute.model.test.ts ✅
5. [x] anti-bot.model.test.ts ✅
6. [x] blacklist.model.test.ts ✅
7. [x] price-history.model.test.ts ✅
8. [x] tax-reporting.model.test.ts ✅
9. [x] venue-settings.model.test.ts ✅

### Phase 4: Core Services (Week 4-5) ✅ COMPLETE
1. [x] listing.service.test.ts ✅
2. [x] blockchain.service.test.ts ✅
3. [x] stripe-payment.service.test.ts ✅
4. [x] transfer.service.test.ts ✅

### Phase 5: Middleware (Week 6) ✅ COMPLETE
1. [x] auth.middleware.test.ts ✅
2. [x] internal-auth.test.ts ✅
3. [x] tenant-context.test.ts ✅
4. [x] rate-limit.test.ts ✅
5. [x] idempotency.test.ts ✅

### Phase 6: Supporting Services (Week 7-8) ✅ COMPLETE
**Completed:**
1. [x] dispute.service.test.ts ✅
2. [x] anti-bot.service.test.ts ✅
3. [x] fee.service.test.ts ✅
4. [x] validation.service.test.ts ✅
5. [x] notification.service.test.ts ✅
6. [x] search.service.test.ts ✅
7. [x] tax-reporting.service.test.ts ✅
8. [x] refund.service.test.ts ✅
9. [x] escrow-monitor.service.test.ts ✅
10. [x] wallet.service.test.ts ✅
11. [x] seller-onboarding.service.test.ts ✅
12. [x] venue-rules.service.test.ts ✅
13. [x] ticket-lookup.service.test.ts ✅
14. [x] fee-distribution.service.test.ts ✅
15. [x] cache-integration.test.ts ✅

### Phase 7: Controllers & Routes (Week 9-10) ✅ COMPLETE
**Controllers (Complete):**
1. [x] listing.controller.test.ts ✅
2. [x] buy.controller.test.ts ✅
3. [x] webhook.controller.test.ts ✅
4. [x] transfer.controller.test.ts ✅
5. [x] admin.controller.test.ts ✅
6. [x] dispute.controller.test.ts ✅
7. [x] search.controller.test.ts ✅
8. [x] health.controller.test.ts ✅
9. [x] tax.controller.test.ts ✅
10. [x] seller-onboarding.controller.test.ts ✅
11. [x] venue-settings.controller.test.ts ✅
12. [x] listings.controller.test.ts ✅

**Routes (Complete):**
Source files in `src/routes/`:
- [x] index.routes.test.ts (index.ts) ✅
- [x] admin.routes.test.ts (admin.routes.ts) ✅
- [x] disputes.routes.test.ts (disputes.routes.ts) ✅
- [x] health.routes.test.ts (health.routes.ts) ✅
- [x] listings.routes.test.ts (listings.routes.ts) ✅
- [ ] metrics.routes.test.ts (metrics.routes.ts) - covered by health.routes
- [x] search.routes.test.ts (search.routes.ts) ✅
- [x] seller-onboarding.routes.test.ts (seller-onboarding.routes.ts) ✅
- [x] tax.routes.test.ts (tax.routes.ts) ✅
- [x] transfers.routes.test.ts (transfers.routes.ts) ✅
- [x] venue.routes.test.ts (venue.routes.ts) ✅
- [x] webhook.routes.test.ts (webhook.routes.ts) ✅

### Phase 8: Events & Final (Week 11) ✅ COMPLETE
Source files in `src/events/`:
- [x] event-bus.test.ts (event-bus.ts) ✅
- [x] event-types.test.ts (event-types.ts) ✅
- [x] handlers.test.ts (handlers.ts) ✅
- [x] publishers.test.ts (publishers.ts) ✅
- [x] Integration validation ✅

---

## Mocking Strategy

### External Dependencies
```typescript
// Solana/Anchor
jest.mock('@solana/web3.js')
jest.mock('@coral-xyz/anchor')

// Stripe
jest.mock('stripe')

// Database
jest.mock('../src/config/database')

// Redis
jest.mock('../src/config/redis')

// Shared library
jest.mock('@tickettoken/shared')
```

### Common Mock Patterns
```typescript
// Mock listing model
jest.mock('../src/models/listing.model', () => ({
  listingModel: {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn()
  }
}))

// Mock blockchain service
jest.mock('../src/services/blockchain.service', () => ({
  blockchainService: {
    getWalletBalance: jest.fn(),
    transferNFT: jest.fn(),
    validateTransaction: jest.fn()
  }
}))
```

---

## Estimated Total Tests

| Category | Files | Tests/File | Total |
|----------|-------|------------|-------|
| Services | 19 | 15-35 | ~400 |
| Middleware | 13 | 10-18 | ~170 |
| Models | 9 | 10-18 | ~120 |
| Config | 7 | 8-25 | ~100 |
| Utils | 14 | 10-18 | ~180 |
| Controllers | 12 | 8-18 | ~150 |
| Events | 4 | 10-25 | ~60 |
| Routes | 12 | 5-8 | ~75 |
| **Total** | **90** | - | **~1,255** |

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm test -- --selectProjects unit

# Specific file
npm test -- listing.service.test.ts

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Success Criteria

1. **Coverage Thresholds Met:**
   - Global: 80% lines, 75% functions, 70% branches
   - Services: 85% lines, 85% functions, 80% branches
   - Middleware: 80% lines, 80% functions, 75% branches

2. **All Critical Paths Tested:**
   - Listing creation, update, cancellation
   - Transfer initiation, completion, failure
   - Payment processing (crypto and fiat)
   - Escrow management

3. **Edge Cases Covered:**
   - Error handling
   - Validation failures
   - Timeout scenarios
   - Retry logic

4. **No Flaky Tests:**
   - Deterministic mocks
   - Proper async handling
   - Isolated test state
