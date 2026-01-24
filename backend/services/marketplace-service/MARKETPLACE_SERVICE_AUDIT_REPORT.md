# MARKETPLACE-SERVICE COMPREHENSIVE AUDIT REPORT

**Service:** marketplace-service
**Audit Date:** 2026-01-23
**Auditor:** Claude Code (Opus 4.5)
**Batch:** 1 of 2 - Infrastructure & Security

---

## 1. SERVICE CAPABILITIES - API SURFACE

### Route Groups

| Route File | Endpoints | Auth Required | Rate Limits |
|------------|-----------|---------------|-------------|
| listings.routes.ts | 6 endpoints | JWT (all) | 50/min default |
| transfers.routes.ts | 6 endpoints | JWT (all) + wallet | 20/min |
| search.routes.ts | 4 endpoints | JWT (all) | 100/min |
| disputes.routes.ts | 6 endpoints | JWT (all) | 30/min |
| admin.routes.ts | 8 endpoints | JWT + Admin role | 100/min |
| health.routes.ts | 3 endpoints | None | None |
| venue.routes.ts | 4 endpoints | JWT + Venue Owner | 50/min |
| tax.routes.ts | 3 endpoints | JWT (all) | 30/min |
| webhook.routes.ts | 2 endpoints | HMAC / Stripe signature | None |
| seller-onboarding.routes.ts | 4 endpoints | JWT (all) | 20/min |
| internal.routes.ts | 4 endpoints | HMAC (service-to-service) | None |
| metrics.routes.ts | 2 endpoints | None | None |

### All Endpoints Summary

| Method | Path | Auth | Middleware | Purpose |
|--------|------|------|------------|---------|
| **Listings** |||||
| GET | /listings | JWT | rate-limit, cache | List all active listings |
| GET | /listings/:id | JWT | rate-limit, cache | Get listing by ID |
| POST | /listings | JWT | rate-limit, wallet, idempotency | Create new listing |
| PUT | /listings/:id | JWT | rate-limit, wallet | Update listing |
| DELETE | /listings/:id | JWT | rate-limit | Cancel listing |
| GET | /listings/user/me | JWT | rate-limit | Get user's listings |
| **Transfers** |||||
| POST | /transfers/purchase/:listingId | JWT | rate-limit, wallet, cooldown, idempotency | Purchase a listing |
| GET | /transfers/:id | JWT | rate-limit | Get transfer details |
| GET | /transfers/buyer/me | JWT | rate-limit | Get buyer's transfers |
| GET | /transfers/seller/me | JWT | rate-limit | Get seller's transfers |
| POST | /transfers/:id/confirm | JWT | rate-limit, wallet | Confirm transfer |
| POST | /transfers/:id/cancel | JWT | rate-limit | Cancel transfer |
| **Search** |||||
| GET | /search | JWT | rate-limit, cache | Search listings |
| GET | /search/events/:eventId | JWT | rate-limit, cache | Search by event |
| GET | /search/venues/:venueId | JWT | rate-limit, cache | Search by venue |
| GET | /search/suggestions | JWT | rate-limit, cache | Search suggestions |
| **Disputes** |||||
| GET | /disputes | JWT | rate-limit | List user disputes |
| GET | /disputes/:id | JWT | rate-limit | Get dispute details |
| POST | /disputes | JWT | rate-limit, idempotency | Create dispute |
| PUT | /disputes/:id | JWT | rate-limit | Update dispute |
| POST | /disputes/:id/evidence | JWT | rate-limit | Add evidence |
| GET | /disputes/:id/evidence | JWT | rate-limit | Get evidence |
| **Admin** |||||
| GET | /admin/listings | JWT + Admin | rate-limit | List all listings (admin) |
| GET | /admin/listings/:id | JWT + Admin | rate-limit | Get listing (admin) |
| PUT | /admin/listings/:id/status | JWT + Admin | rate-limit | Update listing status |
| GET | /admin/transfers | JWT + Admin | rate-limit | List all transfers |
| GET | /admin/disputes | JWT + Admin | rate-limit | List all disputes |
| PUT | /admin/disputes/:id/resolve | JWT + Admin | rate-limit | Resolve dispute |
| POST | /admin/blacklist | JWT + Admin | rate-limit | Add to blacklist |
| DELETE | /admin/blacklist/:id | JWT + Admin | rate-limit | Remove from blacklist |
| **Health** |||||
| GET | /health | None | None | Basic health check |
| GET | /health/ready | None | None | Readiness probe |
| GET | /health/live | None | None | Liveness probe |
| **Venue** |||||
| GET | /venues/:venueId/settings | JWT + Venue Owner | rate-limit | Get venue settings |
| PUT | /venues/:venueId/settings | JWT + Venue Owner | rate-limit, validate | Update venue settings |
| GET | /venues/:venueId/listings | JWT + Venue Owner | rate-limit | Get venue listings |
| GET | /venues/:venueId/sales-report | JWT + Venue Owner | rate-limit | Get sales report |
| **Tax** |||||
| GET | /tax/transactions | JWT | rate-limit | Get tax transactions |
| GET | /tax/report/:year | JWT | rate-limit | Get yearly report |
| GET | /tax/1099k/:year | JWT | rate-limit | Generate 1099-K |
| **Webhooks** |||||
| POST | /webhooks/stripe | Stripe signature | None | Stripe webhook |
| POST | /webhooks/payment-completed | HMAC | None | Internal payment webhook |
| **Seller Onboarding** |||||
| POST | /seller/onboard | JWT | rate-limit | Start Stripe Connect |
| GET | /seller/status | JWT | rate-limit | Get account status |
| POST | /seller/refresh-link | JWT | rate-limit | Refresh onboarding link |
| GET | /seller/can-accept-fiat | JWT | rate-limit | Check fiat capability |
| **Internal** |||||
| POST | /internal/events | HMAC | None | Handle internal events |
| GET | /internal/listings/:listingId | HMAC | None | Get listing (internal) |
| GET | /internal/escrow/:transferId | HMAC | None | Get escrow status |
| POST | /internal/escrow/release | HMAC | None | Release escrow |
| **Metrics** |||||
| GET | /metrics | None | None | Prometheus metrics |
| GET | /metrics/json | None | None | JSON metrics |

### Authentication Patterns

**Public Endpoints (No Auth):**
- GET /health, /health/ready, /health/live
- GET /metrics, /metrics/json

**JWT Required:**
- All /listings, /transfers, /search, /disputes, /tax, /seller endpoints

**JWT + Admin Role:**
- All /admin endpoints

**JWT + Venue Owner:**
- All /venues/:venueId endpoints

**HMAC Required (Service-to-Service):**
- POST /internal/events
- GET /internal/listings/:listingId
- GET /internal/escrow/:transferId
- POST /internal/escrow/release

**Stripe Signature:**
- POST /webhooks/stripe

**HMAC (Internal Webhook):**
- POST /webhooks/payment-completed

### Middleware Coverage

**All routes have:**
- Request ID generation
- Request logging
- Error handling
- JSON body parsing

**Protected routes add:**
- JWT authentication
- Tenant context setting
- Rate limiting

**Write operations add:**
- Idempotency (where specified)
- Wallet validation (for crypto operations)
- Validation middleware

---

## 2. DATABASE SCHEMA

### Tables (16 Total)

#### marketplace_listings (Tenant-Scoped)
**Columns:**
- id: UUID, PK, default gen_random_uuid()
- tenant_id: UUID, NOT NULL, FK → tenants
- ticket_id: UUID, NOT NULL, UNIQUE
- seller_id: UUID, NOT NULL (cross-service FK)
- event_id: UUID, NOT NULL (cross-service FK)
- venue_id: UUID, NOT NULL (cross-service FK)
- price: INTEGER, NOT NULL
- original_face_value: INTEGER, NOT NULL
- price_multiplier: DECIMAL(5,2)
- status: marketplace_listing_status, NOT NULL, default 'active'
- listed_at: TIMESTAMPTZ, default now()
- sold_at: TIMESTAMPTZ
- expires_at: TIMESTAMPTZ
- cancelled_at: TIMESTAMPTZ
- listing_signature: VARCHAR(255)
- wallet_address: VARCHAR(255), NOT NULL
- program_address: VARCHAR(255)
- requires_approval: BOOLEAN, default false
- approved_at: TIMESTAMPTZ
- approved_by: UUID (cross-service FK)
- approval_notes: TEXT
- view_count: INTEGER, default 0
- favorite_count: INTEGER, default 0
- accepts_fiat_payment: BOOLEAN, default false
- accepts_crypto_payment: BOOLEAN, default true
- created_at: TIMESTAMPTZ, NOT NULL, default now()
- updated_at: TIMESTAMPTZ, NOT NULL, default now()
- deleted_at: TIMESTAMPTZ

**Indexes:**
- idx_marketplace_listings_tenant_id
- idx_marketplace_listings_ticket_id
- idx_marketplace_listings_seller_id
- idx_marketplace_listings_event_id
- idx_marketplace_listings_venue_id
- idx_marketplace_listings_status
- idx_marketplace_listings_event_status (composite)
- idx_marketplace_listings_expires_at

**RLS:** Yes (FORCE: Yes)

#### marketplace_transfers (Tenant-Scoped)
**Columns:**
- id: UUID, PK, default gen_random_uuid()
- tenant_id: UUID, NOT NULL, FK → tenants
- listing_id: UUID, NOT NULL, FK → marketplace_listings
- buyer_id: UUID, NOT NULL (cross-service FK)
- seller_id: UUID, NOT NULL (cross-service FK)
- event_id: UUID, NOT NULL (cross-service FK)
- venue_id: UUID, NOT NULL (cross-service FK)
- buyer_wallet: VARCHAR(255), NOT NULL
- seller_wallet: VARCHAR(255), NOT NULL
- transfer_signature: VARCHAR(255), NOT NULL
- block_height: INTEGER
- payment_currency: marketplace_payment_currency, NOT NULL
- payment_amount: DECIMAL(20,6)
- usd_value: INTEGER, NOT NULL
- status: marketplace_transfer_status, NOT NULL, default 'initiated'
- initiated_at: TIMESTAMPTZ, default now()
- completed_at: TIMESTAMPTZ
- failed_at: TIMESTAMPTZ
- failure_reason: TEXT
- network_fee: DECIMAL(20,6)
- network_fee_usd: INTEGER
- payment_method: VARCHAR(20), default 'crypto'
- fiat_currency: VARCHAR(3)
- stripe_payment_intent_id: VARCHAR(255)
- stripe_transfer_id: VARCHAR(255)
- stripe_application_fee_amount: INTEGER
- created_at: TIMESTAMPTZ, NOT NULL, default now()
- updated_at: TIMESTAMPTZ, NOT NULL, default now()
- deleted_at: TIMESTAMPTZ

**Indexes:**
- idx_marketplace_transfers_tenant_id
- idx_marketplace_transfers_listing_id
- idx_marketplace_transfers_buyer_id
- idx_marketplace_transfers_seller_id
- idx_marketplace_transfers_status
- idx_marketplace_transfers_event_id
- idx_marketplace_transfers_buyer_status (composite)
- idx_marketplace_transfers_seller_status (composite)
- idx_marketplace_transfers_stripe_payment_intent
- idx_marketplace_transfers_payment_method

**CHECK Constraints:**
- chk_marketplace_transfers_payment_method: payment_method IN ('crypto', 'fiat')

**RLS:** Yes (FORCE: Yes)

#### platform_fees (Tenant-Scoped)
**Columns:**
- id: UUID, PK
- tenant_id: UUID, NOT NULL, FK → tenants
- transfer_id: UUID, NOT NULL, UNIQUE, FK → marketplace_transfers
- sale_price: INTEGER, NOT NULL
- platform_fee_amount: INTEGER, NOT NULL
- platform_fee_percentage: DECIMAL(5,2), NOT NULL
- venue_fee_amount: INTEGER, NOT NULL
- venue_fee_percentage: DECIMAL(5,2), NOT NULL
- seller_payout: INTEGER, NOT NULL
- platform_fee_wallet: VARCHAR(255)
- platform_fee_signature: VARCHAR(255)
- venue_fee_wallet: VARCHAR(255)
- venue_fee_signature: VARCHAR(255)
- platform_fee_collected: BOOLEAN, default false
- venue_fee_paid: BOOLEAN, default false
- created_at: TIMESTAMPTZ, NOT NULL
- updated_at: TIMESTAMPTZ, NOT NULL

**RLS:** Yes (FORCE: Yes)

#### venue_marketplace_settings (Tenant-Scoped)
**Columns:**
- venue_id: UUID, PK (cross-service FK)
- tenant_id: UUID, NOT NULL, FK → tenants
- max_resale_multiplier: DECIMAL(5,2), default 3.0
- min_price_multiplier: DECIMAL(5,2), default 1.0
- allow_below_face: BOOLEAN, default false
- transfer_cutoff_hours: INTEGER, default 4
- listing_advance_hours: INTEGER, default 720
- auto_expire_on_event_start: BOOLEAN, default true
- max_listings_per_user_per_event: INTEGER, default 8
- max_listings_per_user_total: INTEGER, default 50
- require_listing_approval: BOOLEAN, default false
- auto_approve_verified_sellers: BOOLEAN, default false
- royalty_percentage: DECIMAL(5,2), default 5.0
- royalty_wallet_address: VARCHAR(255), NOT NULL
- minimum_royalty_payout: INTEGER, default 1000
- allow_international_sales: BOOLEAN, default true
- blocked_countries: TEXT[]
- require_kyc_for_high_value: BOOLEAN, default false
- high_value_threshold: INTEGER, default 100000
- created_at: TIMESTAMPTZ, NOT NULL
- updated_at: TIMESTAMPTZ, NOT NULL

**RLS:** Yes (FORCE: Yes)

#### marketplace_price_history (Tenant-Scoped)
**Columns:** id, tenant_id, listing_id, event_id, old_price, new_price, price_change, changed_by, change_reason, changed_at

**RLS:** Yes (FORCE: Yes)

#### marketplace_disputes (Tenant-Scoped)
**Columns:** id, tenant_id, transfer_id, listing_id, filed_by, filed_against, dispute_type, description, evidence_urls, status, resolution_notes, resolved_by, resolved_at, refund_amount, refund_transaction_id, filed_at, created_at, updated_at

**RLS:** Yes (FORCE: Yes)

#### dispute_evidence (Tenant-Scoped)
**Columns:** id, tenant_id, dispute_id, submitted_by, evidence_type, content, metadata, submitted_at

**RLS:** Yes (FORCE: Yes)

#### tax_transactions (Tenant-Scoped)
**Columns:** id, tenant_id, transfer_id, seller_id, sale_amount, cost_basis, capital_gain, tax_year, tax_quarter, transaction_type, tax_category, reported_to_seller, reported_to_irs, reported_at, metadata, transaction_date, created_at

**RLS:** Yes (FORCE: Yes)

#### anti_bot_activities (Tenant-Scoped)
**Columns:** id, tenant_id, user_id, action_type, ip_address, user_agent, timestamp, metadata

**RLS:** Yes (FORCE: Yes)

#### anti_bot_violations (Tenant-Scoped)
**Columns:** id, tenant_id, user_id, reason, severity, flagged_at

**RLS:** Yes (FORCE: Yes)

#### marketplace_blacklist (Tenant-Scoped)
**Columns:** id, tenant_id, user_id, wallet_address, reason, banned_by, banned_at, expires_at, is_active

**RLS:** Yes (FORCE: Yes)

#### refunds (Tenant-Scoped)
**Columns:** id, tenant_id, transfer_id, listing_id, buyer_id, seller_id, original_amount, refund_amount, reason, reason_details, initiated_by, status, stripe_refund_id, error_message, completed_at, created_at, updated_at

**RLS:** Yes (FORCE: Yes)

#### listing_audit_log (Global - Immutable)
**Columns:** id, listing_id, action, old_status, new_status, reason, event_start_time, metadata, created_at
**Triggers:** prevent_listing_audit_update, prevent_listing_audit_delete

#### anonymization_log (Global)
**Columns:** id, user_id, anonymized_id, tables_affected, created_at

#### user_activity_log (Global)
**Columns:** id, user_id, activity_type, metadata, created_at

#### refund_audit_log (Global - Immutable)
**Columns:** id, refund_id, transfer_id, event_id, action, old_status, new_status, amount, stripe_refund_id, reason, error, initiated_by, metadata, request_id, created_at
**Triggers:** prevent_refund_audit_update, prevent_refund_audit_delete

### Database Functions (5)

1. **expire_marketplace_listings()** - Auto-expire listings past expires_at
2. **calculate_marketplace_fees()** - Calculate platform and venue fees
3. **get_user_active_listings_count()** - Count active listings per user
4. **prevent_audit_log_update()** - Immutability enforcement
5. **prevent_audit_log_delete()** - Immutability enforcement

### Enums (7)

1. marketplace_listing_status: 'active', 'sold', 'cancelled', 'expired', 'pending_approval'
2. marketplace_payment_currency: 'USDC', 'SOL'
3. marketplace_transfer_status: 'initiated', 'pending', 'completed', 'failed', 'disputed'
4. marketplace_dispute_type: 'payment_not_received', 'ticket_not_transferred', 'fraudulent_listing', 'price_dispute', 'other'
5. marketplace_dispute_status: 'open', 'under_review', 'resolved', 'closed'
6. tax_transaction_type: 'short_term', 'long_term'
7. bot_violation_severity: 'low', 'medium', 'high'

### Schema Quality Assessment

**✅ What's Good:**
- All tenant tables have RLS with FORCE enabled
- Comprehensive indexing strategy
- Cross-service FKs documented as comments (not enforced)
- Immutable audit logs with trigger enforcement
- Proper enum types for status fields
- Consistent naming conventions (snake_case)
- UUID primary keys with gen_random_uuid()
- Proper timestamptz for all timestamps

**❌ Missing:**
- No version column for optimistic locking on marketplace_listings
- No version column on marketplace_transfers
- discrepancy_log table referenced in code but not in migration
- sessions table referenced in data-lifecycle.ts but not in migration

**⚠️ Concerns:**
- Large number of indexes may impact write performance
- No partial indexes for common query patterns
- deleted_at soft delete pattern but no index on it

---

## 3. SECURITY ANALYSIS

### 3.1 HMAC Implementation

**File:** `src/middleware/internal-auth.middleware.ts`

**Algorithm:** HMAC-SHA256 ✅

**Implementation Details:**
- Secret loaded from `process.env.HMAC_SECRET`
- Timestamp-based replay protection (5-minute window)
- Timing-safe comparison via `crypto.timingSafeEqual`
- Service allowlist: `['payment-service', 'order-service', 'notification-service', 'ticket-service', 'event-service', 'auth-service']`

**Signature Format:** `HMAC-SHA256(timestamp.serviceId.requestPath.bodyHash)`

**Matches Standardization:** Yes - Uses shared HMAC module pattern

**Issues:**
- ⚠️ In development mode without HMAC_SECRET, logs warning but allows request through (line 26-31)
- ⚠️ Body hash uses `JSON.stringify(request.body)` which may not preserve original byte order

### 3.2 JWT Implementation

**File:** `src/middleware/auth.middleware.ts`

**Algorithm:** RS256 (verified via `verify` from jsonwebtoken)

**Validation:**
- Token extracted from Authorization Bearer header
- Verifies signature with public key
- Checks expiration (exp claim)
- Extracts user_id, tenant_id, roles from payload

**Issues:**
- ⚠️ No issuer validation (iss claim)
- ⚠️ No audience validation (aud claim)
- ✅ Handles token extraction properly

### 3.3 Input Validation

**Framework:** Joi

**Coverage:** ~75% of endpoints

**Location:** `src/schemas/validation.ts`, `src/schemas/wallet.schema.ts`

**Wallet Address Validation:**
- Base58 regex validation
- Length check (32-44 chars)
- Blacklisted address check (system programs)

**Price Validation:**
- Min: $1.00 (100 cents)
- Max: $10,000,000 (1,000,000,000 cents)
- Integer cents only

**Issues:**
- ⚠️ Some routes missing validation schemas (venue.routes.ts only validates updateSettingsSchema)
- ⚠️ No validation on metrics routes (low risk - read only)
- ✅ Pagination properly bounded (1-100 limit)

### 3.4 Rate Limiting

**File:** `src/middleware/rate-limit.ts`

**Implementation:** Redis-based sliding window

**Configuration:**
- Default: 100 requests per minute per user
- Transfer/Purchase: 20 requests per minute
- Search: 100 requests per minute
- Admin: 100 requests per minute

**Storage:** Redis with prefix `ratelimit:`

**Issues:**
- ⚠️ No IP-based rate limiting for unauthenticated endpoints
- ✅ Per-user rate limiting for authenticated endpoints
- ✅ Configurable via environment variables

### 3.5 Purchase Cooldown

**File:** `src/middleware/purchase-cooldown.ts`

**Implementation:**
- Cooldown duration: 30 seconds between purchases (configurable)
- Redis key: `purchase:cooldown:{userId}`
- Returns 429 with retry-after header

**Issues:**
- ✅ Properly implemented
- ✅ Configurable duration
- ⚠️ No per-event cooldown (user can buy from different events rapidly)

### 3.6 Anti-Bot Protection

**Implementation Details (from constants and middleware):**
- MAX_PURCHASES_PER_HOUR: 10
- MAX_LISTINGS_PER_DAY: 50
- VELOCITY_CHECK_WINDOW_SECONDS: 60
- BOT_SCORE_THRESHOLD: 0.7

**Anti-bot tracking stored in:**
- anti_bot_activities table
- anti_bot_violations table

**Issues:**
- ⚠️ Bot score calculation logic not visible in middleware (may be in services)
- ✅ Violations tracked with severity levels

### 3.7 Wallet Validation

**File:** `src/schemas/wallet.schema.ts`, `src/utils/wallet-helper.ts`

**Validation Rules:**
- Base58 character set validation
- Length: 32-44 characters
- Blacklist: System Program, Token Program, Associated Token Program, Wrapped SOL mint

**Signature Verification:**
- Placeholder in wallet-helper.ts (line 29-34): `// Placeholder verification - replace with actual signature verification`

**Issues:**
- ❌ **CRITICAL:** Wallet signature verification is a placeholder (always returns true)
- ⚠️ Should use @solana/web3.js nacl for actual verification

### 3.8 Idempotency

**File:** `src/middleware/idempotency.ts`

**Implementation:**
- Redis-based storage
- Key: `idempotency:{tenantId}:{userId}:{idempotencyKey}`
- TTL: 24 hours (configurable)
- Stores response for replay

**Issues:**
- ✅ Proper implementation
- ✅ Returns cached response on duplicate
- ✅ Handles concurrent requests with locking

### 3.9 SQL Injection Check

**Assessment:** ✅ All queries parameterized

**Evidence:**
- Knex query builder used throughout
- No raw SQL string interpolation found
- Parameters passed via `.where('id', value)` pattern

**Checked Files:**
- src/routes/internal.routes.ts - Uses knex parameterized queries
- src/utils/db-operations.ts - Uses knex parameterized queries
- src/utils/data-lifecycle.ts - Uses knex parameterized queries
- src/utils/discrepancy-alerting.ts - Uses knex parameterized queries

### 3.10 Secrets Management

**File:** `src/config/secrets.ts`

**Secrets Loaded:**
- JWT_PUBLIC_KEY (required)
- JWT_PRIVATE_KEY (optional)
- HMAC_SECRET (required in production)
- STRIPE_SECRET_KEY (required)
- STRIPE_WEBHOOK_SECRET (required)
- DATABASE_URL (required)
- REDIS_URL (required)
- RABBITMQ_URL (required)

**Loading Method:** Environment variables

**Issues:**
- ⚠️ No AWS Secrets Manager or HashiCorp Vault integration
- ⚠️ Secrets validated at startup but may fail silently
- ✅ Production requires all critical secrets

### CRITICAL VULNERABILITIES

1. **[CRITICAL]** Wallet signature verification is a placeholder that always returns true
   - File: `src/utils/wallet-helper.ts`, Line: 29-34
   - Impact: Anyone can claim wallet ownership without proof

### HIGH PRIORITY ISSUES

1. **Missing issuer/audience JWT validation**
   - File: `src/middleware/auth.middleware.ts`
   - Impact: Tokens from other services could be accepted

2. **Development mode HMAC bypass**
   - File: `src/middleware/internal-auth.middleware.ts`, Line: 26-31
   - Impact: Internal endpoints accessible without auth in dev mode

### MEDIUM PRIORITY ISSUES

1. **No IP-based rate limiting for public endpoints**
2. **Some routes missing input validation schemas**
3. **Missing discrepancy_log table in migration**

---

## 4. CODE QUALITY - INFRASTRUCTURE

### 4.1 Code Organization

**Structure:** Well-organized following standard patterns
- Clear separation of concerns (config, middleware, routes, utils)
- Consistent file naming conventions
- Index files for re-exports

**Consistency:** Good
- snake_case for database fields
- camelCase for TypeScript
- Consistent error handling patterns

### 4.2 Error Handling

**Custom Error Classes (src/errors/index.ts):**
- BaseError - Base class with RFC 7807 support
- AuthenticationError - 401/403 errors
- ValidationError - 400 errors with field violations
- NotFoundError - 404 errors
- ConflictError - 409 errors
- BusinessError - 422 errors
- ExternalServiceError - 503 errors
- RateLimitError - 429 errors
- DatabaseError - 500 errors

**Error Codes Enumerated:**
- UNAUTHORIZED, FORBIDDEN, INVALID_TOKEN, TOKEN_EXPIRED
- VALIDATION_FAILED, INVALID_INPUT, MISSING_REQUIRED_FIELD
- NOT_FOUND, ALREADY_EXISTS, CONFLICT
- INSUFFICIENT_FUNDS, LISTING_NOT_AVAILABLE, TRANSFER_FAILED, etc.

**RFC 7807 Compliance:** Yes ✅
- toProblemDetails() method on BaseError

### 4.3 Logging

**Framework:** Winston

**Configuration:**
- JSON format with timestamp
- Error stack traces included
- Service name in default metadata
- Component child loggers

**PII Redaction:** Partial
- Response filter redacts sensitive fields
- Blacklist includes: password, secret, apiKey, accessToken, etc.
- Masked fields: email, phone, walletAddress

**Issues:**
- ⚠️ No automatic request body redaction
- ⚠️ IP addresses logged without redaction

### 4.4 Circuit Breakers

**File:** `src/utils/circuit-breaker.ts`

**Implementation:**
- States: CLOSED, OPEN, HALF_OPEN
- Redis persistence for distributed state
- Configurable thresholds

**Pre-configured Circuits:**
| Circuit | Failure Threshold | Success Threshold | Timeout |
|---------|-------------------|-------------------|---------|
| blockchain-service | 5 | 2 | 30s |
| ticket-service | 5 | 2 | 30s |
| payment-service | 3 | 1 | 60s |
| stripe-api | 5 | 2 | 30s |
| database | 5 | 2 | 10s |

**Retry Configuration:**
- Max retries: 3
- Initial delay: 1000ms
- Max delay: 30000ms
- Backoff multiplier: 2
- Jitter factor: 0.2 (20%)

### 4.5 Distributed Locking

**File:** `src/utils/distributed-lock.ts`

**Implementation:** Redis-based with Lua scripts

**Features:**
- Atomic SET NX EX operations
- Lua scripts for safe release/extend
- Exponential backoff retries

**Pre-configured Locks:**
| Lock Type | Default TTL | Retry Count | Retry Delay |
|-----------|-------------|-------------|-------------|
| Generic | 30s | 3 | 200ms |
| Listing | 10s | 3 | 200ms |
| Purchase | 30s | 5 | 500ms |
| Wallet | 15s | 3 | 200ms |

**Optimistic Locking Support:**
- checkVersion() function
- updateWithVersion() function

### 4.6 Dead Code

**Identified:**
- None significant in Batch 1 scope

### 4.7 TODO/FIXME Comments (Total: 0)

No TODO/FIXME comments found in Batch 1 files.

### 4.8 `any` Type Usage

**Total Occurrences:** ~25

**Highest in:**
- src/schemas/validation.ts (validateSchema middleware)
- src/middleware/error.middleware.ts (error handling)
- src/utils/db-operations.ts (Knex types)

**Justified:**
- Most are for Fastify request/reply types
- Knex transaction types
- Error handling where type is unknown

### 4.9 Dependencies

**package.json Analysis:**

| Package | Purpose | Notes |
|---------|---------|-------|
| fastify | Web framework | v4.x |
| knex | Query builder | v3.x |
| ioredis | Redis client | v5.x |
| amqplib | RabbitMQ | v0.10.x |
| winston | Logging | v3.x |
| joi | Validation | v17.x |
| jsonwebtoken | JWT | v9.x |
| stripe | Payments | Latest |
| @solana/web3.js | Blockchain | Latest |

**Potential Issues:**
- ⚠️ Should verify all dependencies are latest stable versions

### 4.10 TypeScript Configuration

**Strict Mode:** Not verified in Batch 1 (tsconfig.json not in scope)

---

## 5. CONFIGURATION & SETUP

### 5.1 Framework

**Framework:** Fastify v4
**Plugins:**
- @fastify/cors
- @fastify/helmet
- @fastify/rate-limit
- @fastify/swagger
- @fastify/sensible

### 5.2 Database Configuration

**File:** `src/config/database.ts`

**Connection:**
- PostgreSQL via Knex
- SSL required in production
- Connection string from DATABASE_URL

**Pool Configuration:**
- Min: 2
- Max: 10 (configurable via DB_POOL_MAX)
- Idle timeout: 30s
- Acquire timeout: 60s

**RLS Setup:**
- Sets `app.current_tenant_id` before each request
- Sets `app.is_system_user` for system operations

### 5.3 Redis Configuration

**File:** `src/config/redis.ts`

**Purpose:**
- Rate limiting
- Caching
- Distributed locks
- Session storage
- Idempotency keys
- Circuit breaker state

**Connection:**
- URL from REDIS_URL env var
- Reconnection strategy with exponential backoff
- Max retries: 10

**Key Prefixes:**
- `ratelimit:` - Rate limiting
- `cache:` - General cache
- `lock:` - Distributed locks
- `idempotency:` - Idempotency keys
- `marketplace:circuit:` - Circuit breaker state

### 5.4 RabbitMQ Configuration

**File:** `src/config/rabbitmq.ts`

**Exchanges:**
- `marketplace.events` (topic)

**Queues:**
- `marketplace.listing.created`
- `marketplace.listing.sold`
- `marketplace.transfer.completed`
- `marketplace.dispute.created`

**Event Patterns:**
- listing.created
- listing.updated
- listing.sold
- listing.cancelled
- transfer.initiated
- transfer.completed
- transfer.failed
- dispute.created
- dispute.resolved

### 5.5 Blockchain Configuration

**File:** `src/config/blockchain.ts`

**Network:** Configurable (devnet/mainnet/testnet)
**RPC Endpoint:** From SOLANA_RPC_ENDPOINT env var
**Default:** https://api.devnet.solana.com
**Commitment:** confirmed

### 5.6 Fee Configuration

**File:** `src/config/fees.ts`

**Platform Fee:** 2.5% (configurable)
**Venue Fee:** Configurable per venue (default 5%)
**Distribution:**
1. Platform fee deducted first
2. Venue fee/royalty deducted
3. Remainder to seller

### 5.7 Required Environment Variables

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| DATABASE_URL | PostgreSQL connection | Yes | - |
| REDIS_URL | Redis connection | Yes | - |
| RABBITMQ_URL | RabbitMQ connection | Yes | - |
| JWT_PUBLIC_KEY | JWT verification | Yes | - |
| HMAC_SECRET | Service auth | Prod only | - |
| STRIPE_SECRET_KEY | Stripe API | Yes | - |
| STRIPE_WEBHOOK_SECRET | Webhook verification | Yes | - |
| SOLANA_RPC_ENDPOINT | Blockchain RPC | No | devnet |
| NODE_ENV | Environment | No | development |
| PORT | Server port | No | 3000 |
| LOG_LEVEL | Logging level | No | info |
| PLATFORM_FEE_PERCENTAGE | Fee config | No | 2.5 |
| DB_POOL_MAX | Connection pool | No | 10 |
| RATE_LIMIT_MAX | Rate limit | No | 100 |
| PURCHASE_COOLDOWN_SECONDS | Cooldown | No | 30 |

### 5.8 Graceful Shutdown

**File:** `src/server.ts`

**Sequence:**
1. SIGTERM/SIGINT received
2. Stop accepting new connections
3. Wait for in-flight requests (30s timeout)
4. Close database connections
5. Close Redis connections
6. Close RabbitMQ connections
7. Exit process

**Timeout:** 30 seconds

### 5.9 Startup Sequence

1. Load environment variables
2. Validate required secrets
3. Initialize database connection
4. Initialize Redis connection
5. Initialize RabbitMQ connection
6. Register Fastify plugins
7. Register middleware
8. Register routes
9. Start listening

### 5.10 Configuration Issues

- ⚠️ No health check for RabbitMQ connection in startup
- ⚠️ Database migrations not auto-run on startup
- ✅ Proper error handling for missing required config

---

## 6. MIDDLEWARE ANALYSIS

### 6.1 auth.middleware.ts

**Purpose:** JWT authentication for user requests
**Routes:** All protected user endpoints
**Logic:**
1. Extract token from Authorization header
2. Verify JWT signature with public key
3. Check token expiration
4. Extract user_id, tenant_id, roles
5. Attach to request object

**Issues:**
- ⚠️ No issuer/audience validation

### 6.2 internal-auth.middleware.ts

**Purpose:** HMAC authentication for service-to-service calls
**Routes:** /internal/* endpoints
**Logic:**
1. Extract signature, timestamp, service from headers
2. Verify timestamp within 5 minutes
3. Compute expected signature
4. Compare using timing-safe function
5. Verify service in allowlist

**Issues:**
- ⚠️ Dev mode bypass

### 6.3 error.middleware.ts

**Purpose:** Centralized error handling
**Routes:** All routes (global error handler)
**Logic:**
1. Catch all unhandled errors
2. Determine status code from error
3. Sanitize error for response
4. Log full error internally
5. Return RFC 7807 response

**Issues:** None

### 6.4 rate-limit.ts

**Purpose:** Per-user rate limiting
**Routes:** All protected routes
**Logic:**
1. Extract user ID from request
2. Check Redis for current window count
3. Increment counter
4. Return 429 if exceeded

**Issues:**
- ⚠️ No IP-based limiting

### 6.5 idempotency.ts

**Purpose:** Prevent duplicate mutations
**Routes:** POST /listings, POST /transfers/purchase, POST /disputes
**Logic:**
1. Extract idempotency key from header
2. Check Redis for existing response
3. If exists, return cached response
4. If not, proceed and cache result

**Issues:** None

### 6.6 purchase-cooldown.ts

**Purpose:** Prevent rapid purchases
**Routes:** POST /transfers/purchase/*
**Logic:**
1. Check Redis for cooldown key
2. If exists, return 429 with retry-after
3. If not, set key with TTL

**Issues:** None

### 6.7 tenant-context.ts

**Purpose:** Set tenant context for RLS
**Routes:** All authenticated routes
**Logic:**
1. Extract tenant_id from JWT
2. Set PostgreSQL session variable
3. Queries automatically filtered

**Issues:** None

### 6.8 wallet.middleware.ts

**Purpose:** Validate wallet address in requests
**Routes:** Crypto transaction routes
**Logic:**
1. Extract wallet address from body
2. Validate format (Base58, length)
3. Check against blacklist
4. Normalize and attach to request

**Issues:**
- ❌ Signature verification is placeholder

### 6.9 cache.middleware.ts

**Purpose:** Response caching
**Routes:** GET /listings, GET /search
**Logic:**
1. Generate cache key from request
2. Check Redis cache
3. If hit, return cached response
4. If miss, proceed and cache result

**Cache TTLs:**
- Listings: 300s (5 min)
- Search: 60s (1 min)
- User: 600s (10 min)

**Issues:** None

### 6.10 validation.middleware.ts

**Purpose:** Request body/query validation
**Routes:** Routes with schemas defined
**Logic:**
1. Select appropriate Joi schema
2. Validate request data
3. Strip unknown fields
4. Return 400 on validation failure

**Issues:** None

### 6.11 venue-access.middleware.ts

**Purpose:** Verify venue owner access
**Routes:** /venues/:venueId/*
**Logic:**
1. Extract venueId from params
2. Check user has venue_owner role
3. Verify user owns the venue
4. Return 403 if not authorized

**Issues:** None

### 6.12 request-id.ts

**Purpose:** Assign unique request ID
**Routes:** All routes
**Logic:**
1. Check for existing X-Request-ID header
2. If not present, generate UUID
3. Attach to request and response headers

**Issues:** None

### 6.13 request-logger.ts

**Purpose:** Log all requests
**Routes:** All routes
**Logic:**
1. Log request start (method, path, IP)
2. Log response (status, duration)
3. Include request ID in logs

**Issues:**
- ⚠️ IP logged without redaction option

### 6.X Middleware Chain Analysis

**Typical Chain:**
1. request-id (first)
2. request-logger
3. rate-limit
4. auth.middleware
5. tenant-context
6. validation.middleware
7. [route-specific: wallet, idempotency, cache, cooldown]
8. controller
9. error.middleware (last)

**Performance:** Good ordering - auth before heavy operations

**Gaps:**
- ⚠️ No request body size limit middleware (relies on Fastify default)
- ⚠️ No CORS middleware visible (may be in app.ts)

---

## 7. VALIDATION SCHEMAS

### 7.1 Framework

**Primary:** Joi v17
**Secondary:** JSON Schema (Fastify native)

### 7.2 Schemas Defined

**validation.ts:**
- ListingSchemas.create
- ListingSchemas.update
- ListingSchemas.getById
- ListingSchemas.list
- ListingSchemas.search
- PurchaseSchemas.create
- PurchaseSchemas.getById
- PurchaseSchemas.list
- DisputeSchemas.create
- DisputeSchemas.update
- DisputeSchemas.list
- RefundSchemas.create
- RefundSchemas.eventCancellation
- WebhookSchemas.stripe
- WebhookSchemas.internal
- AdminSchemas.listUsers
- AdminSchemas.updateUser
- AdminSchemas.bulkAction

**wallet.schema.ts:**
- solanaAddressSchema
- validateSolanaAddress()
- validateMultipleSolanaAddresses()
- createJoiSolanaAddressValidator()
- walletValidationMiddleware()

### 7.3 Validation Coverage

**Endpoints with validation:** ~45/55 (82%)

**Missing validation:**
- /health endpoints (acceptable - read only)
- /metrics endpoints (acceptable - read only)
- Some admin endpoints

### 7.4 Wallet Validation

**Address Format:**
- Base58 characters only (no 0, O, I, l)
- Length: 32-44 characters

**Blacklisted Addresses:**
- 11111111111111111111111111111111 (System Program)
- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA (Token Program)
- ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL (Associated Token)
- So11111111111111111111111111111111111111112 (Wrapped SOL)

**Issues:**
- ❌ Signature verification placeholder

### 7.5 Price Validation

**Range:**
- Min: $1.00 (100 cents)
- Max: $10,000,000 (1,000,000,000 cents)

**Precision:** Integer cents only

**Currency:** USD (stored as cents)

**Markup Limit:** 300% of face value (configurable per venue)

### 7.6 Validation Gaps

- ⚠️ No validation on venue.routes.ts GET endpoints
- ⚠️ No validation on internal route request bodies beyond basic schema
- ⚠️ Pagination max (100) should be enforced at database level too

---

## 8. UTILITIES ASSESSMENT

### 8.1 circuit-breaker.ts

**Purpose:** Graceful degradation for external services
**Used by:** External service calls (blockchain, payment, ticket)
**Quality:** Good ✅
**Features:** Redis persistence, retry with jitter

### 8.2 distributed-lock.ts

**Purpose:** Prevent race conditions
**Used by:** Purchase operations, listing updates
**Quality:** Good ✅
**Features:** Lua scripts, exponential backoff

### 8.3 logger.ts

**Purpose:** Structured logging
**Used by:** All components
**Quality:** Good ✅
**Features:** Child loggers, JSON format

### 8.4 errors.ts

**Purpose:** Simple error classes (utils version)
**Used by:** Legacy code
**Quality:** Fair - duplicates src/errors/index.ts

### 8.5 validators.ts

**Purpose:** Business validation logic
**Used by:** Services
**Quality:** Good ✅
**Features:** Price, UUID, listing validation

### 8.6 wallet-helper.ts

**Purpose:** Wallet utilities
**Used by:** Transfer operations
**Quality:** Poor ❌
**Issues:** Signature verification placeholder

### 8.7 constants.ts

**Purpose:** Business constants
**Used by:** All components
**Quality:** Good ✅
**Values documented

### 8.8 date-helper.ts

**Purpose:** Date formatting and calculations
**Used by:** Listings, transfers
**Quality:** Good ✅

### 8.9 db-operations.ts

**Purpose:** Database utilities with retry
**Used by:** Services
**Quality:** Excellent ✅
**Features:** Deadlock retry, optimistic locking

### 8.10 metrics.ts

**Purpose:** Prometheus metrics
**Used by:** All components
**Quality:** Good ✅
**Features:** Custom registry, standard metric types

### 8.11 solana-helper.ts

**Purpose:** Solana blockchain utilities
**Used by:** Transfer operations
**Quality:** Fair - placeholder implementations

### 8.12 data-lifecycle.ts

**Purpose:** GDPR compliance, retention
**Used by:** Background jobs
**Quality:** Good ✅
**Features:** Anonymization, SLA tracking

### 8.13 discrepancy-alerting.ts

**Purpose:** Payment discrepancy detection
**Used by:** Background reconciliation
**Quality:** Good ✅
**Features:** Multiple check types, Slack alerts

### 8.14 response-filter.ts

**Purpose:** Sanitize responses
**Used by:** Error middleware
**Quality:** Good ✅
**Features:** PII filtering, field masking

### 8.X Utilities Summary

**Well-implemented:**
- circuit-breaker.ts
- distributed-lock.ts
- db-operations.ts
- data-lifecycle.ts
- discrepancy-alerting.ts
- response-filter.ts
- metrics.ts

**Needs improvement:**
- wallet-helper.ts (signature verification)
- solana-helper.ts (placeholder implementations)

**Missing utilities:**
- Encryption utilities for sensitive data
- Retry utilities for HTTP calls (beyond circuit breaker)

---

## 9. TEST COVERAGE - BATCH 1 SCOPE

### Test Files

**Config Tests:**
- tests/unit/config/database.test.ts
- tests/unit/config/redis.test.ts
- tests/unit/config/validate.test.ts
Total: 3 files

**Middleware Tests:**
- tests/unit/middleware/auth.middleware.test.ts
- tests/unit/middleware/internal-auth.test.ts
- tests/unit/middleware/tenant-context.test.ts
- tests/unit/middleware/rate-limit.test.ts
- tests/unit/middleware/idempotency.test.ts
Total: 5 files

**Utils Tests:**
- tests/unit/utils/logger.test.ts
- tests/unit/utils/metrics.test.ts
- tests/unit/utils/circuit-breaker.test.ts
- tests/unit/utils/distributed-lock.test.ts
- tests/unit/utils/db-operations.test.ts
- tests/unit/utils/response-filter.test.ts
Total: 6 files

**Error Tests:**
- tests/unit/errors/index.test.ts
Total: 1 file

**Route Tests:**
- tests/unit/routes/index.routes.test.ts
- tests/unit/routes/health.routes.test.ts
- tests/unit/routes/listings.routes.test.ts
- tests/unit/routes/search.routes.test.ts
- tests/unit/routes/transfers.routes.test.ts
- tests/unit/routes/admin.routes.test.ts
- tests/unit/routes/disputes.routes.test.ts
- tests/unit/routes/venue.routes.test.ts
- tests/unit/routes/tax.routes.test.ts
- tests/unit/routes/seller-onboarding.routes.test.ts
- tests/unit/routes/webhook.routes.test.ts
- tests/unit/routes/internal.routes.test.ts
Total: 12 files

**HMAC Integration:**
- tests/hmac-integration.test.ts
Total: 1 file

### Coverage Gaps (Batch 1 Scope)

**Missing Tests:**
- src/middleware/cache.middleware.ts
- src/middleware/purchase-cooldown.ts
- src/middleware/wallet.middleware.ts
- src/middleware/venue-access.middleware.ts
- src/middleware/request-id.ts
- src/middleware/request-logger.ts
- src/middleware/error.middleware.ts
- src/middleware/validation.middleware.ts
- src/config/blockchain.ts
- src/config/constants.ts
- src/config/dependencies.ts
- src/config/fees.ts
- src/config/rabbitmq.ts
- src/config/secrets.ts
- src/config/service-urls.ts
- src/utils/constants.ts
- src/utils/date-helper.ts
- src/utils/validators.ts
- src/utils/wallet-helper.ts
- src/utils/solana-helper.ts
- src/utils/data-lifecycle.ts
- src/utils/discrepancy-alerting.ts
- src/schemas/validation.ts
- src/schemas/wallet.schema.ts

**Estimated Coverage:** ~50% of Batch 1 files

---

## BATCH 1 SUMMARY

### FILES ANALYZED

| Category | Count |
|----------|-------|
| Config | 11 |
| Middleware | 13 |
| Routes | 13 |
| Utils | 14 |
| Schemas | 2 |
| Errors | 1 |
| Migrations | 1 |
| Root files | 4 |
| **TOTAL BATCH 1** | **59** |

### CRITICAL ISSUES (Must Fix)

1. **Wallet signature verification is a placeholder**
   - Location: `src/utils/wallet-helper.ts:29-34`
   - Impact: Complete bypass of wallet ownership verification
   - Fix: Implement proper Solana signature verification using @solana/web3.js

### HIGH PRIORITY (Should Fix)

1. **Missing JWT issuer/audience validation**
   - Location: `src/middleware/auth.middleware.ts`
   - Impact: Tokens from other services could be accepted

2. **Development mode HMAC bypass**
   - Location: `src/middleware/internal-auth.middleware.ts:26-31`
   - Impact: Internal endpoints accessible without auth in dev

3. **Missing database tables referenced in code**
   - discrepancy_log table
   - sessions table
   - Impact: Runtime errors if features used

### MEDIUM PRIORITY

1. No IP-based rate limiting for public endpoints
2. Some routes missing input validation schemas
3. Solana helper functions are placeholders
4. Test coverage ~50% for infrastructure code
5. No version column for optimistic locking on key tables

### INFRASTRUCTURE ASSESSMENT

| Area | Rating | Notes |
|------|--------|-------|
| Security | Fair | Critical wallet verification issue |
| Configuration | Good | Well-organized, proper env var handling |
| Code Quality | Good | Clean structure, consistent patterns |
| Error Handling | Excellent | RFC 7807 compliant, comprehensive |
| Database Schema | Good | Proper RLS, good indexing |
| Middleware | Good | Complete coverage, proper ordering |
| Testing | Fair | 50% coverage, key areas tested |

---

**END OF BATCH 1**

**BATCH 2 (Business Logic & Operations) will be appended below this line.**

---
