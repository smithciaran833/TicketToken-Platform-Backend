# Marketplace Service - Complete Overview

## Service Purpose
The Marketplace Service is the core secondary market platform for TicketToken NFT tickets. It handles listing creation, price management, purchases/transfers, fee distribution, dispute resolution, tax reporting, seller onboarding (Stripe Connect), anti-bot protection, and venue-specific marketplace rules. Supports both cryptocurrency and fiat payment methods.

---

## Routes (`src/routes/`)

### Main Routes (`index.ts`)
Central router that registers all sub-routes with prefixes:

| Prefix | Route Module | Description |
|--------|--------------|-------------|
| `/listings` | listings.routes.ts | Listing management |
| `/transfers` | transfers.routes.ts | Purchase and transfer operations |
| `/venues` | venue.routes.ts | Venue marketplace settings |
| `/search` | search.routes.ts | Listing search and discovery |
| `/admin` | admin.routes.ts | Admin management |
| `/disputes` | disputes.routes.ts | Dispute management |
| `/tax` | tax.routes.ts | Tax reporting |
| `/seller` | seller-onboarding.routes.ts | Stripe Connect seller onboarding |
| `/webhooks` | webhook.routes.ts | Payment webhook handlers |
| `/` | health.routes.ts | Health checks |

**Additional Endpoints:**
- `GET /stats` - Marketplace statistics (authenticated)
- `GET /cache/stats` - Cache statistics
- `DELETE /cache/flush` - Flush cache

### Listings Routes (`listings.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| GET | `/:id` | Get listing by ID | None | - |
| GET | `/my-listings` | Get user's own listings | Required | `authMiddleware` |
| POST | `/` | Create new listing | Required | `authMiddleware`, `walletMiddleware`, validation |
| PUT | `/:id/price` | Update listing price | Required | `authMiddleware`, `walletMiddleware`, `verifyListingOwnership`, validation |
| DELETE | `/:id` | Cancel listing | Required | `authMiddleware`, `walletMiddleware`, `verifyListingOwnership` |

**Validation Schemas:**
- `createListingSchema` - ticketId, eventId, venueId, price, originalFaceValue, eventStartTime
- `updatePriceSchema` - price (positive number)

### Transfers Routes (`transfers.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| POST | `/purchase` | Purchase a listing | Required | `authMiddleware`, `walletMiddleware`, validation |
| POST | `/direct` | Direct ticket transfer | Required | `authMiddleware`, `walletMiddleware`, validation |
| GET | `/history` | Get transfer history | Required | `authMiddleware`, `walletMiddleware` |
| GET | `/:id` | Get transfer by ID | Required | `authMiddleware`, `walletMiddleware` |
| POST | `/:id/cancel` | Cancel pending transfer | Required | `authMiddleware`, `walletMiddleware` |

**Validation Schemas:**
- `purchaseListingSchema` - listingId, paymentMethodId (optional)
- `directTransferSchema` - ticketId, recipientWallet

### Venue Routes (`venue.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| GET | `/:venueId/settings` | Get venue marketplace settings | Required | `authMiddleware`, `requireVenueOwner` |
| PUT | `/:venueId/settings` | Update venue settings | Required | `authMiddleware`, `requireVenueOwner`, validation |
| GET | `/:venueId/listings` | Get venue listings | Required | `authMiddleware`, `requireVenueOwner` |
| GET | `/:venueId/sales-report` | Get venue sales report | Required | `authMiddleware`, `requireVenueOwner` |

**Validation Schema:**
- `updateSettingsSchema` - allowResale, maxMarkupPercentage (0-500), minPricePercentage (0-100), royaltyPercentage (0-50)

### Search Routes (`search.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| GET | `/` | Search listings | None (public) | validation |
| GET | `/recommended` | Get personalized recommendations | Required | `authMiddleware` |
| GET | `/watchlist` | Get user's watchlist | Required | `authMiddleware` |

**Validation Schema:**
- `searchSchema` - eventId, venueId, minPrice, maxPrice, date, limit (1-100, default 20), offset (default 0)

### Admin Routes (`admin.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| GET | `/stats` | Get marketplace statistics | Required | `authMiddleware`, `requireAdmin` |
| GET | `/disputes` | Get all disputes | Required | `authMiddleware`, `requireAdmin` |
| PUT | `/disputes/:disputeId/resolve` | Resolve dispute | Required | `authMiddleware`, `requireAdmin` |
| GET | `/flagged-users` | Get flagged users | Required | `authMiddleware`, `requireAdmin` |
| POST | `/ban-user` | Ban user from marketplace | Required | `authMiddleware`, `requireAdmin` |

### Disputes Routes (`disputes.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| POST | `/` | Create dispute | Required | `authMiddleware` |
| GET | `/my-disputes` | Get user's disputes | Required | `authMiddleware` |
| GET | `/:disputeId` | Get dispute by ID | Required | `authMiddleware` |
| POST | `/:disputeId/evidence` | Add evidence to dispute | Required | `authMiddleware` |

### Tax Routes (`tax.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| GET | `/transactions` | Get reportable transactions | Required | `authMiddleware` |
| GET | `/report/:year` | Get yearly tax report | Required | `authMiddleware` |
| GET | `/1099k/:year` | Generate 1099-K form | Required | `authMiddleware` |

### Seller Onboarding Routes (`seller-onboarding.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| POST | `/onboard` | Start Stripe Connect onboarding | Required | `authenticate` hook |
| GET | `/status` | Get Stripe Connect account status | Required | `authenticate` hook |
| POST | `/refresh-link` | Get new onboarding link | Required | `authenticate` hook |
| GET | `/can-accept-fiat` | Check if seller can accept fiat | Required | `authenticate` hook |

### Webhook Routes (`webhook.routes.ts`)

| Method | Path | Description | Authentication | Middleware |
|--------|------|-------------|----------------|------------|
| POST | `/stripe` | Stripe webhook handler | Webhook signature | Verified in controller |
| POST | `/payment-completed` | Legacy payment completion webhook | Internal service header | `x-internal-service` check |

### Health Routes (`health.routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Aggregate health check (DB + Blockchain) |
| GET | `/health/db` | Database connectivity check |
| GET | `/health/blockchain` | Blockchain RPC connectivity check |

---

## Services (`src/services/`)

### `listing.service.ts`
- **Purpose:** Core listing management with distributed locking
- **Key Methods:**
  - `createListing(data)` - Create listing with ticket lock, validates duplicate listings
  - `updateListingPrice(params)` - Update price with lock, validates markup limits (300% max)
  - `cancelListing(listingId, userId)` - Cancel listing with ownership verification
  - `getListingById(listingId)` - Fetch single listing
  - `searchListings(params)` - Search by event/seller/venue with filters
  - `markListingAsSold(listingId, buyerId)` - Mark as sold after purchase
- **Features:**
  - Distributed locking via `withLock` from shared library
  - Search sync integration (`publishSearchSync`)
  - Audit logging integration
  - Automatic price validation

### `transfer.service.ts`
- **Purpose:** Handle purchases and direct transfers
- **Functions:** Purchase processing, direct transfers, transfer history
- **Integration:** Payment service, blockchain service, audit logging

### `blockchain.service.ts`
- **Purpose:** Solana blockchain interaction wrapper
- **Functions:** Connection management, program calls, transaction signing

### `stripe-payment.service.ts`
- **Purpose:** Stripe Connect payment processing for fiat transactions
- **Functions:** Payment intent creation, destination charges, Stripe transfer management

### `seller-onboarding.service.ts`
- **Purpose:** Stripe Connect account onboarding for sellers
- **Functions:** Create Connect accounts, generate onboarding links, check account status

### `fee.service.ts`
- **Purpose:** Platform and venue fee calculations
- **Functions:** Calculate fees, distribute payments, track collections

### `fee-distribution.service.ts`
- **Purpose:** Automated fee distribution to platform and venue wallets
- **Functions:** Batch fee payments, royalty distribution

### `dispute.service.ts`
- **Purpose:** Dispute resolution management
- **Functions:** Create disputes, add evidence, resolve disputes, process refunds

### `tax-reporting.service.ts`
- **Purpose:** Tax transaction tracking and reporting
- **Functions:** Record taxable transactions, generate 1099-K forms, yearly reports

### `anti-bot.service.ts`
- **Purpose:** Bot detection and prevention
- **Functions:** Track user activities, detect suspicious patterns, flag violations

### `search.service.ts`
- **Purpose:** Listing search and filtering
- **Functions:** Advanced search, price range filters, sort options

### `validation.service.ts`
- **Purpose:** Business rule validation
- **Functions:** Validate listing rules, price limits, transfer eligibility

### `venue-rules.service.ts`
- **Purpose:** Venue-specific marketplace rules enforcement
- **Functions:** Check markup limits, transfer cutoffs, listing restrictions

### `wallet.service.ts`
- **Purpose:** Wallet validation and management
- **Functions:** Validate wallet addresses, check wallet ownership

### `notification.service.ts`
- **Purpose:** Send notifications for marketplace events
- **Functions:** Listing notifications, purchase confirmations, price alerts

### `ticket-lookup.service.ts`
- **Purpose:** Ticket information retrieval
- **Functions:** Fetch ticket details, validate ticket eligibility

### `escrow-monitor.service.ts`
- **Purpose:** Monitor escrow transactions for fiat purchases
- **Functions:** Track payment status, release escrow on completion

### `cache-integration.ts`
- **Purpose:** Redis cache integration
- **Configuration:** Uses shared cache library with marketplace-specific prefix

---

## Controllers (`src/controllers/`)

### `listing.controller.ts`
- **Class:** `ListingController`
- **Methods:**
  - `createListing(request, reply)` - Create listing with audit logging
  - `updateListingPrice(request, reply)` - Update price with change tracking
  - `cancelListing(request, reply)` - Cancel listing with audit log
  - `getListing(request, reply)` - Get single listing
  - `getMyListings(request, reply)` - Get user's listings with pagination
  - `getEventListings(request, reply)` - Get event listings with pagination
- **Features:** Comprehensive audit logging via shared `auditService`

### `buy.controller.ts`
- **Purpose:** Purchase flow controllers
- **Methods:** Handle listing purchases, payment processing

### `transfer.controller.ts`
- **Purpose:** Transfer management controllers
- **Methods:** Direct transfers, transfer history, cancellation

### `dispute.controller.ts`
- **Purpose:** Dispute management controllers
- **Methods:** Create disputes, view disputes, add evidence, resolve

### `venue-settings.controller.ts`
- **Purpose:** Venue marketplace configuration
- **Methods:** Get/update settings, view listings, generate reports

### `search.controller.ts`
- **Purpose:** Search functionality controllers
- **Methods:** Search listings, recommendations, watchlist

### `admin.controller.ts`
- **Purpose:** Admin operations controllers
- **Methods:** View stats, manage disputes, ban users, view violations

### `tax.controller.ts`
- **Purpose:** Tax reporting controllers
- **Methods:** Get transactions, yearly reports, generate 1099-K

### `seller-onboarding.controller.ts`
- **Purpose:** Stripe Connect onboarding controllers
- **Methods:** Start onboarding, check status, refresh link, check eligibility

### `webhook.controller.ts`
- **Purpose:** Webhook handlers
- **Methods:** Handle Stripe webhooks, payment completion callbacks

### `health.controller.ts`
- **Purpose:** Health check handlers
- **Methods:** Database health, blockchain health, aggregate health

---

## Repositories

❌ **No dedicated repository layer** - Data access is handled through:
- **Models** (src/models/*.model.ts) - Database query wrappers
- **Knex.js** - Direct SQL query builder
- **Shared Database** - `db` from `config/database.ts`

---

## Middleware (`src/middleware/`)

### `auth.middleware.ts`
- **Functions:**
  - `authMiddleware(request, reply)` - JWT token validation, attaches `user` and `tenantId` to request
  - `requireAdmin(request, reply)` - Verify admin role
  - `requireVenueOwner(request, reply)` - Verify venue owner/manager role
  - `verifyListingOwnership(request, reply)` - Verify user owns the listing being modified
- **Features:**
  - JWT verification with configurable secret
  - Role-based access control
  - Dynamic listing ownership verification

### `wallet.middleware.ts`
- **Purpose:** Wallet connection and validation
- **Functions:** Validate wallet signature, attach wallet to request
- **Integration:** Solana wallet verification

### `validation.middleware.ts`
- **Purpose:** Request validation using Joi schemas
- **Functions:** `validate(schema)` - Returns Fastify pre-handler for validation
- **Integration:** Joi validation library

### `cache.middleware.ts`
- **Purpose:** Response caching middleware
- **Functions:** Cache GET requests, invalidate on mutations

### `error.middleware.ts`
- **Purpose:** Global error handling
- **Functions:** Format errors, log errors, return consistent error responses

### `tenant-context.ts`
- **Purpose:** Multi-tenancy support via Row Level Security
- **Functions:** Set PostgreSQL session variable `app.current_tenant`
- **Features:** Ensures data isolation per tenant

### `venue-access.middleware.ts`
- **Purpose:** Venue-specific access control
- **Functions:** Verify user has access to venue resources

---

## Configuration (`src/config/`)

### `index.ts`
- **Purpose:** Export all configuration modules
- **Exports:** Database, blockchain, Redis, RabbitMQ, secrets, service URLs

### `database.ts`
- **Purpose:** Knex database configuration
- **Exports:** `db` - Knex instance for PostgreSQL
- **Configuration:**
  - Connection pooling (min 2, max 10)
  - Idle timeout: 30s
  - Connection timeout: 5s

### `blockchain.ts`
- **Purpose:** Solana blockchain configuration
- **Exports:** Connection, program ID, commitment level
- **Configuration:**
  - RPC URL from environment
  - WebSocket URL
  - Commitment: 'confirmed'

### `redis.ts`
- **Purpose:** Redis connection configuration
- **Exports:** Redis client for caching
- **Configuration:** Host, port, password from environment

### `rabbitmq.ts`
- **Purpose:** RabbitMQ message queue configuration
- **Exports:** Connection, channels for event publishing
- **Configuration:** Connection URL from environment

### `secrets.ts`
- **Purpose:** AWS Secrets Manager integration
- **Functions:** `loadSecrets()` - Load database credentials, API keys
- **Integration:** Shared secrets manager utility

### `service-urls.ts`
- **Purpose:** Inter-service communication URLs
- **Exports:** URLs for auth-service, payment-service, minting-service, etc.

### `constants.ts`
- **Purpose:** Application constants
- **Exports:** Fee percentages, limits, default values

### `dependencies.ts`
- **Purpose:** Dependency injection configuration
- **Exports:** Service instances, shared utilities

**Configured External Services:**
- **PostgreSQL** (via PgBouncer) - Primary database
- **Redis** - Caching and distributed locking
- **RabbitMQ** - Event publishing
- **Solana RPC** - Blockchain operations
- **Stripe** - Payment processing (Connect for sellers)
- **AWS Secrets Manager** - Credential management

---

## Migrations (`src/migrations/`)

### `001_baseline_marketplace.ts`
Creates 11 tables owned by this service:

#### Tables Created:

1. **`marketplace_listings`**
   - Main listings table
   - Fields: ticket_id (unique), seller_id, event_id, venue_id, price (cents), original_face_value, price_multiplier, status, wallet_address, listing_signature
   - Statuses: active, sold, cancelled, expired, pending_approval
   - Payment support: accepts_fiat_payment, accepts_crypto_payment
   - Metrics: view_count, favorite_count
   - Timestamps: listed_at, sold_at, expires_at, cancelled_at
   - Approval system: requires_approval, approved_at, approved_by, approval_notes
   - Indexes: ticket_id, seller_id, event_id, venue_id, status, expires_at
   - Queries: All active marketplace listings

2. **`marketplace_transfers`**
   - Purchase and transfer records
   - Fields: listing_id, buyer_id, seller_id, buyer_wallet, seller_wallet, transfer_signature, payment_currency (USDC/SOL), payment_amount, usd_value (cents)
   - Status: initiated, pending, completed, failed, disputed
   - **Fiat Payment Support:** payment_method (crypto/fiat), stripe_payment_intent_id, stripe_transfer_id, stripe_application_fee_amount
   - Network fees: network_fee, network_fee_usd
   - Timestamps: initiated_at, completed_at, failed_at
   - Indexes: listing_id, buyer_id, seller_id, status, stripe_payment_intent_id, payment_method
   - Queries: All marketplace purchases and transfers

3. **`platform_fees`**
   - Fee breakdown and collection tracking
   - Fields: transfer_id (unique), sale_price (cents), platform_fee_amount, platform_fee_percentage, venue_fee_amount, venue_fee_percentage, seller_payout
   - Blockchain tracking: platform_fee_wallet, platform_fee_signature, venue_fee_wallet, venue_fee_signature
   - Collection status: platform_fee_collected, venue_fee_paid
   - Indexes: transfer_id, platform_fee_collected, venue_fee_paid
   - Queries: Fee distribution and collection status

4. **`venue_marketplace_settings`**
   - Venue-specific marketplace configuration
   - Price controls: max_resale_multiplier (default 3.0), min_price_multiplier (default 1.0), allow_below_face
   - Timing: transfer_cutoff_hours (default 4), listing_advance_hours (default 720), auto_expire_on_event_start
   - Limits: max_listings_per_user_per_event (default 8), max_listings_per_user_total (default 50)
   - Approval: require_listing_approval, auto_approve_verified_sellers
   - Royalties: royalty_percentage (default 5%), royalty_wallet_address, minimum_royalty_payout
   - Geographic: allow_international_sales, blocked_countries[]
   - KYC: require_kyc_for_high_value, high_value_threshold
   - Primary key: venue_id
   - Queries: Per-venue marketplace rules

5. **`marketplace_price_history`**
   - Price change audit log
   - Fields: listing_id, event_id, old_price (cents), new_price (cents), price_change, changed_by, change_reason, changed_at
   - Indexes: listing_id, event_id, changed_at
   - Queries: Price history tracking for analytics

6. **`marketplace_disputes`**
   - Dispute management
   - Fields: transfer_id, listing_id, filed_by, filed_against, dispute_type, description, evidence_urls[]
   - Types: payment_not_received, ticket_not_transferred, fraudulent_listing, price_dispute, other
   - Status: open, under_review, resolved, closed
   - Resolution: resolution_notes, resolved_by, resolved_at, refund_amount, refund_transaction_id
   - Indexes: transfer_id, listing_id, filed_by, status
   - Queries: Dispute tracking and resolution

7. **`dispute_evidence`**
   - Evidence attached to disputes
   - Fields: dispute_id, submitted_by, evidence_type, content, metadata (jsonb), submitted_at
   - Indexes: dispute_id, submitted_by
   - Foreign Key: dispute_id → marketplace_disputes.id (CASCADE)
   - Queries: Dispute evidence trail

8. **`tax_transactions`**
   - Tax reporting data
   - Fields: transfer_id (unique), seller_id, sale_amount (cents), cost_basis, capital_gain, tax_year, tax_quarter
   - Classification: transaction_type (short_term/long_term), tax_category
   - Reporting: reported_to_seller, reported_to_irs, reported_at
   - Metadata: jsonb for additional data
   - Indexes: transfer_id, seller_id, tax_year, seller_id+tax_year composite
   - Queries: IRS reporting and seller tax documents

9. **`anti_bot_activities`**
   - User activity tracking for bot detection
   - Fields: user_id, action_type, ip_address, user_agent, timestamp, metadata (jsonb)
   - Indexes: user_id, timestamp, user_id+action_type, user_id+timestamp
   - Queries: Activity pattern analysis

10. **`anti_bot_violations`**
    - Flagged suspicious activities
    - Fields: user_id, reason, severity (low/medium/high), flagged_at
    - Indexes: user_id, severity, flagged_at
    - Queries: Violation tracking and user banning

11. **`marketplace_blacklist`**
    - Banned users and wallets
    - Fields: user_id, wallet_address, reason, banned_by, banned_at, expires_at, is_active
    - Indexes: user_id, wallet_address, is_active, expires_at
    - Queries: Ban enforcement (at least one of user_id or wallet_address required)

**Stored Procedures:**
- `expire_marketplace_listings()` - Auto-expire listings past expiry date
- `calculate_marketplace_fees(sale_price, platform_fee_pct, venue_fee_pct)` - Calculate fee breakdown
- `get_user_active_listings_count(user_id, event_id)` - Count user's active listings

**Row Level Security (RLS):**
- All tables have RLS enabled
- Tenant isolation policy: `tenant_id = current_setting('app.current_tenant')`

**Foreign Keys:**
- Internal: 7 constraints (transfers→listings, fees→transfers, etc.)
- Cross-service: 22 constraints to users, events, venues, tickets tables
- Total: 29 foreign key constraints

---

## Validators

❌ **No dedicated validators folder** - Validation schemas are defined inline in route files using **Joi** validation library.

**Validation Schemas (defined in routes):**
- Listing creation: ticketId, eventId, venueId, price, originalFaceValue, eventStartTime
- Price update: price (positive number)
- Purchase: listingId, optional paymentMethodId
- Direct transfer: ticketId, recipientWallet
- Search: eventId, venueId, minPrice, maxPrice, date, limit, offset
- Venue settings: allowResale, maxMarkupPercentage, minPricePercentage, royaltyPercentage
- Seller onboarding: returnUrl, refreshUrl

---

## Models (`src/models/`)

### `listing.model.ts`
- **Purpose:** Listing database operations
- **Methods:**
  - `create(data)` - Create listing
  - `findById(id)` - Find by ID
  - `findByTicketId(ticketId)` - Find by ticket
  - `findBySellerId(sellerId, status, limit, offset)` - Seller's listings
  - `findByEventId(eventId, status, limit, offset)` - Event listings
  - `update(id, data)` - Update listing
  - `updateStatus(id, status, metadata)` - Change status
- **Table:** `marketplace_listings`

### `transfer.model.ts`
- **Purpose:** Transfer/purchase operations
- **Methods:** CRUD for transfers, status updates, history queries
- **Table:** `marketplace_transfers`

### `fee.model.ts`
- **Purpose:** Fee tracking and distribution
- **Methods:** Calculate fees, record collections, query unpaid fees
- **Table:** `platform_fees`

### `venue-settings.model.ts`
- **Purpose:** Venue marketplace configuration
- **Methods:** Get/update settings, validate rules
- **Table:** `venue_marketplace_settings`

### `price-history.model.ts`
- **Purpose:** Price change tracking
- **Methods:** Record price changes, query history
- **Table:** `marketplace_price_history`

### `dispute.model.ts`
- **Purpose:** Dispute management
- **Methods:** Create disputes, add evidence, resolve
- **Tables:** `marketplace_disputes`, `dispute_evidence`

### `tax-reporting.model.ts`
- **Purpose:** Tax transaction tracking
- **Methods:** Record transactions, generate reports
- **Table:** `tax_transactions`

### `anti-bot.model.ts`
- **Purpose:** Bot detection data
- **Methods:** Log activities, flag violations
- **Tables:** `anti_bot_activities`, `anti_bot_violations`

### `blacklist.model.ts`
- **Purpose:** Ban management
- **Methods:** Ban users/wallets, check bans, expire bans
- **Table:** `marketplace_blacklist`

---

## Events (`src/events/`)

### `event-types.ts`
- **Purpose:** Define marketplace event types
- **Events:**
  - `listing.created` - New listing created
  - `listing.updated` - Listing price changed
  - `listing.cancelled` - Listing cancelled
  - `listing.sold` - Listing sold
  - `transfer.initiated` - Purchase started
  - `transfer.completed` - Purchase completed
  - `transfer.failed` - Purchase failed
  - `dispute.created` - New dispute
  - `dispute.resolved` - Dispute resolved

### `handlers.ts`
- **Purpose:** Event handlers for marketplace events
- **Functions:** Handle listing events, transfer events, dispute events
- **Integration:** Update search index, send notifications, trigger workflows

### `publishers.ts`
- **Purpose:** Publish events to RabbitMQ
- **Functions:**
  - `publishListingCreated(listing)`
  - `publishListingSold(listing, transfer)`
  - `publishTransferCompleted(transfer)`
  - `publishDisputeCreated(dispute)`

---

## Types (`src/types/`)

### `common.types.ts`
- **Purpose:** Shared types and interfaces
- **Types:** Response wrappers, pagination, filters

### `listing.types.ts`
- **Purpose:** Listing-related types
- **Types:**
  - `ListingStatus` - active, sold, cancelled, expired, pending_approval
  - `CreateListingInput`, `UpdateListingInput`
  - `ListingSearchParams`

### `transfer.types.ts`
- **Purpose:** Transfer-related types
- **Types:**
  - `TransferStatus` - initiated, pending, completed, failed, disputed
  - `PaymentCurrency` - USDC, SOL
  - `PaymentMethod` - crypto, fiat
  - `CreateTransferInput`, `TransferSearchParams`

### `venue-settings.types.ts`
- **Purpose:** Venue configuration types
- **Types:** `VenueMarketplaceSettings`, `UpdateSettingsInput`

### `wallet.types.ts`
- **Purpose:** Wallet-related types
- **Types:** `WalletInfo`, `WalletSignature`

---

## Utils (`src/utils/`)

### `logger.ts`
- **Purpose:** Structured logging with Pino
- **Configuration:**
  - Service name: 'marketplace-service'
  - Log level from environment
  - Pretty print in development

### `errors.ts`
- **Purpose:** Custom error classes
- **Classes:**
  - `ValidationError` - Input validation failures
  - `AuthorizationError` - Permission denied
  - `NotFoundError` - Resource not found
  - `BusinessRuleError` - Business logic violations
  - `BlockchainError` - Blockchain operation failures
  - `PaymentError` - Payment processing failures

### `validators.ts`
- **Purpose:** Custom validation functions
- **Functions:**
  - `validateWalletAddress(address)` - Solana wallet validation
  - `validatePrice(price, faceValue, maxMarkup)` - Price limit validation
  - `validateTransferEligibility(ticket, event)` - Transfer time checks
  - `validateListingLimits(user, event, settings)` - Listing limit enforcement

### `solana-helper.ts`
- **Purpose:** Solana utility functions
- **Functions:**
  - `parseTransaction(signature)` - Parse transaction details
  - `verifySignature(message, signature, publicKey)` - Verify wallet signature
  - `createTransferInstruction(...)` - Build transfer instruction

### `wallet-helper.ts`
- **Purpose:** Wallet management utilities
- **Functions:**
  - `connectWallet(request)` - Extract and validate wallet
  - `signMessage(wallet, message)` - Sign messages
  - `verifyOwnership(wallet, nft)` - Verify NFT ownership

### `date-helper.ts`
- **Purpose:** Date/time utilities
- **Functions:**
  - `isWithinCutoff(eventTime, cutoffHours)` - Check transfer cutoff
  - `calculateExpiry(eventTime)` - Calculate listing expiry
  - `getTaxYear(date)` - Get tax year for date

### `constants.ts`
- **Purpose:** Application constants
- **Constants:**
  - `DEFAULT_PLATFORM_FEE` - 2.5%
  - `DEFAULT_VENUE_FEE` - 2.5%
  - `MAX_MARKUP_PERCENT` - 300%
  - `TRANSFER_CUTOFF_HOURS` - 4 hours
  - `HIGH_VALUE_THRESHOLD` - $1000 (100000 cents)

---

## Architecture Summary

### Data Flow

```
User Request
    ↓
Routes + Middleware (auth, wallet, validation)
    ↓
Controllers
    ↓
Services (with distributed locking)
    ↓
Models
    ↓
    ┌────────┴────────┐
    ↓                 ↓
PostgreSQL         Events
(relational)    (RabbitMQ)
    ↓                 ↓
  ┌─────────────────────┘
  ↓
Search Sync / Notifications
```

### Dual Payment Support

The marketplace supports **both cryptocurrency and fiat payments**:

**Cryptocurrency Flow:**
1. Buyer pays with SOL/USDC via Solana transaction
2. Smart contract handles escrow
3. On-chain transfer to seller
4. Platform/venue fees deducted on-chain

**Fiat Flow (Stripe Connect):**
1. Seller onboards via Stripe Connect
2. Buyer pays with credit card via Stripe Payment Intent
3. Stripe holds funds in escrow
4. On successful ticket transfer, funds released to seller's Connect account
5. Platform fees collected via Stripe application fees
6. `marketplace_transfers` tracks: stripe_payment_intent_id, stripe_transfer_id, stripe_application_fee_amount

### Fee Structure

All fees stored as **INTEGER CENTS** (no floating point):
- **Platform Fee:** 2.5% (default, configurable)
- **Venue Fee:** 2.5% (default, per-venue configurable up to 50%)
- **Seller Payout:** Sale Price - Platform Fee - Venue Fee

Calculated via stored procedure: `calculate_marketplace_fees(sale_price, platform_fee_pct, venue_fee_pct)`

### Anti-Bot Strategy

1. **Activity Logging:** Track all user actions (searches, listings, purchases)
2. **Pattern Detection:** Analyze frequency, velocity, duplicate IPs
3. **Violation Flagging:** Auto-flag suspicious patterns (severity: low/medium/high)
4. **Blacklisting:** Ban users or wallet addresses permanently or temporarily
5. **Rate Limiting:** Apply per-user rate limits (enforced at API gateway level)

### Distributed Locking

Uses **Redis-based distributed locks** from shared library:
- `LockKeys.listing(id)` - Prevent concurrent listing modifications
- `LockKeys.ticket(id)` - Prevent duplicate listings for same ticket
- Lock timeout: 5000ms
- Ensures consistency in multi-instance deployments

### Audit Logging

Comprehensive audit trail via shared `auditService`:
- **Listing creation** - Tracks price, ticket, event, wallet
- **Price changes** - Tracks old/new price, percentage change (CRITICAL for fraud detection)
- **Cancellations** - Tracks who cancelled and when
- **Purchases** - Tracks buyer, seller, amount, payment method
- **Disputes** - Tracks all dispute actions

All audit logs include: userId, resourceType, resourceId, actionType, previousValue, newValue, metadata, ipAddress, userAgent, success status

---

## External Dependencies

### Required Services
- **PostgreSQL** (via PgBouncer) - Primary database
- **Redis** - Caching and distributed locking
- **RabbitMQ** - Event publishing for search sync and notifications
- **Solana RPC** - Blockchain transactions
- **Stripe API** - Payment processing and Connect onboarding
- **AWS Secrets Manager** - Credential storage

### Inter-Service Dependencies
- **Auth Service** - User authentication and roles
- **Payment Service** - Fiat payment processing coordination
- **Minting Service** - Ticket creation and transfer
- **Blockchain Service** - Blockchain operations wrapper
- **Notification Service** - Email/SMS notifications

### NPM Packages (Key Dependencies)
- `fastify` - Web framework
- `knex` - SQL query builder
- `joi` - Validation
- `jsonwebtoken` - JWT authentication
- `@solana/web3.js` - Solana blockchain
- `stripe` - Stripe API
- `ioredis` - Redis client
- `amqplib` - RabbitMQ client
- `@tickettoken/shared` - Shared utilities (locks, audit, cache)

---

## Environment Variables

### Database
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Redis
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### RabbitMQ
- `RABBITMQ_URL`

### Solana
- `SOLANA_RPC_URL`, `SOLANA_WS_URL`
- `SOLANA_NETWORK` (mainnet-beta, devnet, testnet)
- `SOLANA_PROGRAM_ID`

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PLATFORM_FEE_PERCENT` (default: 2.5)

### Service Configuration
- `PORT` (default: 3007)
- `NODE_ENV` (development, production)
- `LOG_LEVEL` (debug, info, warn, error)
- `SERVICE_NAME` (marketplace-service)

### Security
- `JWT_SECRET` (minimum 32 characters)

### Service URLs
- `AUTH_SERVICE_URL`
- `PAYMENT_SERVICE_URL`
- `MINTING_SERVICE_URL`
- `BLOCKCHAIN_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`

---

## Key Features

### ✅ Hybrid Payment Support
- Cryptocurrency payments (SOL, USDC) via Solana
- Fiat payments (credit cards) via Stripe Connect
- Automatic seller onboarding for fiat acceptance
- Destination charges with application fees

### ✅ Dynamic Pricing
- Market-based pricing with configurable markup limits
- Price history tracking for analytics
- Real-time price updates with distributed locking
- Venue-specific pricing rules

### ✅ Fee Distribution
- Automated platform fee collection (2.5% default)
- Venue royalty distribution (configurable up to 50%)
- Stripe application fees for fiat transactions
- On-chain fee distribution for crypto

### ✅ Dispute Resolution
- Structured dispute creation with evidence
- Admin review and resolution workflow
- Automated refund processing
- Comprehensive dispute history

### ✅ Tax Reporting
- Automatic tracking of all taxable transactions
- Capital gains calculation (short-term/long-term)
- Quarterly and yearly reports
- 1099-K form generation for sellers

### ✅ Anti-Bot Protection
- Activity logging and pattern detection
- Velocity checks and duplicate IP detection
- Automated violation flagging (severity levels)
- User and wallet blacklisting
- Rate limiting integration

### ✅ Venue Control
- Per-venue marketplace settings
- Configurable markup limits (0-500%)
- Transfer cutoff times (default 4 hours)
- Listing approval workflows
- Geographic restrictions
- KYC requirements for high-value sales

### ✅ Search & Discovery
- Advanced filtering (event, venue, price range, date)
- Personalized recommendations (authenticated users)
- Watchlist functionality
- Real-time search index sync via RabbitMQ

### ✅ Audit & Compliance
- Comprehensive audit logging for all actions
- Fraud detection via price change tracking
- Multi-tenancy via Row Level Security
- GDPR-compliant data handling

---

## Performance Considerations

### Optimizations
- **Distributed Locking:** Prevents race conditions in multi-instance deployments
- **Connection Pooling:** PostgreSQL (2-10 connections), Redis
- **Caching Layer:** Redis caching for frequently accessed data
- **Event-Driven:** Async event publishing for search updates and notifications
- **Database Indexes:** 50+ indexes across all tables for fast queries
- **Stored Procedures:** Database-side fee calculations for performance

### Monitoring
- Health endpoints for database and blockchain
- Prometheus metrics export (via shared library)
- Structured logging with request tracing
- Performance monitoring via audit logs

---

## Security

### Authentication & Authorization
- JWT-based authentication on all protected routes
- Role-based access control (admin, venue_owner, user)
- Ownership verification for listing modifications
- Wallet signature verification

### Data Protection
- Row Level Security (RLS) for multi-tenancy
- Tenant context isolation
- SQL injection prevention via parameterized queries
- Input validation using Joi schemas

### Payment Security
- Stripe webhook signature verification
- Internal service header validation for callbacks
- Payment intent idempotency
- Secure credential storage (AWS Secrets Manager)

### Fraud Prevention
- Anti-bot activity tracking
- Price manipulation detection
- Blacklist enforcement (user + wallet)
- Rate limiting per user
- Comprehensive audit trails

---

## Testing

### Test Structure
- **Unit Tests:** `tests/unit/` - Service and model tests
- **Integration Tests:** `tests/integration/` - API endpoint tests
- **Load Tests:** `tests/load/` - Concurrent purchase tests
- **Security Tests:** `tests/security/` - Authentication and authorization tests
- **Fixtures:** `tests/fixtures/` - Test data generators

### Test Coverage
- Controllers: Listing, transfer, dispute operations
- Services: Listing service with locking, fee calculations
- Middleware: Auth, wallet, validation
- Models: Database operations

---

## Deployment

### Docker Support
- `Dockerfile` included for containerization
- Multi-stage builds for optimization
- Health check endpoints for orchestration

### Database Migrations
- Knex.js migration system
- Version-controlled schema changes
- Rollback support with `down()` functions

### Monitoring & Observability
- Health endpoints: `/health`, `/health/db`, `/health/blockchain`
- Prometheus metrics (via shared library)
- Structured JSON logging
- Audit trail for compliance

---

## Business Rules

### Listing Rules
- Maximum markup: 300% of face value (configurable per-venue up to 500%)
- Minimum price: Face value (unless venue allows below-face)
- Duplicate listings prevented via distributed locking
- Auto-expiry on event start time
- Listing limits: 8 per event, 50 total per user (configurable)

### Transfer Rules
- Transfer cutoff: 4 hours before event (configurable per-venue)
- Listings must be active to purchase
- Buyers cannot purchase their own listings
- Banned users/wallets cannot list or purchase

### Fee Rules
- Platform fee: 2.5% (configurable)
- Venue fee: 2.5% (configurable per-venue, max 50%)
- Seller receives: Sale Price - Platform Fee - Venue Fee
- Fees collected in same currency as payment (crypto or fiat)

### Tax Rules
- All sales >$600/year reportable to IRS
- Capital gains calculated: Sale Price - Cost Basis
- Short-term: <1 year holding period
- Long-term: ≥1 year holding period
- 1099-K generated for sellers meeting thresholds

---

## Future Enhancements

### Potential Improvements
- [ ] Auction system for high-demand events
- [ ] Bundle listings (multiple tickets in one transaction)
- [ ] Escrow smart contracts for crypto payments
- [ ] Machine learning for dynamic pricing recommendations
- [ ] Advanced fraud detection models
- [ ] Multi-currency fiat support (EUR, GBP, etc.)
- [ ] Installment payment plans
- [ ] Ticket insurance offerings
- [ ] Social features (seller ratings, reviews)
- [ ] Mobile app push notifications
- [ ] Real-time price alerts
- [ ] Advanced analytics dashboard for venues
